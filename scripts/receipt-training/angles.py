"""Private full-receipt pose augmentation. Geometry changes, verified fields do not."""
import argparse
import hashlib
import json
from pathlib import Path

from PIL import Image
from prepare import private_output

POSES = ("straight", "clockwise-18", "anticlockwise-18", "perspective-left",
         "perspective-right", "perspective-clockwise-8", "perspective-anticlockwise-8")


def homography(source, destination):
    """Return Pillow's output-to-input projective coefficients for four corners."""
    equations = []
    for (x, y), (u, v) in zip(destination, source):
        equations += [[x, y, 1, 0, 0, 0, -u*x, -u*y, u],
                      [0, 0, 0, x, y, 1, -v*x, -v*y, v]]
    for column in range(8):
        pivot = max(range(column, 8), key=lambda row: abs(equations[row][column]))
        equations[column], equations[pivot] = equations[pivot], equations[column]
        value = equations[column][column]
        if abs(value) < 1e-10:
            raise ValueError("Degenerate receipt perspective")
        equations[column] = [item/value for item in equations[column]]
        for row in range(8):
            if row != column:
                factor = equations[row][column]
                equations[row] = [a-factor*b for a, b in zip(equations[row], equations[column])]
    return tuple(row[-1] for row in equations)


def perspective(image, right=False):
    width, height = image.size
    source = [(0, 0), (width, 0), (width, height), (0, height)]
    left = [(width*.16, height*.025), (width*.92, height*.10),
            (width*.98, height*.98), (width*.02, height*.92)]
    destination = [(width-x, y) for x, y in (left[1], left[0], left[3], left[2])] if right else left
    coefficients = homography(source, destination)
    return image.transform(image.size, Image.Transform.PERSPECTIVE, coefficients,
                           resample=Image.Resampling.BICUBIC, fillcolor=(238, 238, 238))


def pose_image(image, pose):
    image = image.convert("RGB")
    if pose not in POSES:
        raise ValueError("Unknown receipt pose")
    if pose == "straight":
        return image.copy()
    if "perspective" in pose:
        image = perspective(image, right=pose in ("perspective-right", "perspective-anticlockwise-8"))
    angle = -18 if pose == "clockwise-18" else 18 if pose == "anticlockwise-18" else -8 if pose == "perspective-clockwise-8" else 8 if pose == "perspective-anticlockwise-8" else 0
    return image.rotate(angle, resample=Image.Resampling.BICUBIC, expand=True,
                        fillcolor=(238, 238, 238)) if angle else image


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--data", type=Path, required=True, help="Reviewed whole-receipt JSONL directory, not ownership strips")
    parser.add_argument("--output", type=Path, required=True)
    args = parser.parse_args()
    output = private_output(args.output)
    if any(output.iterdir()):
        raise ValueError("Use a new private output directory")
    images = output/"images"
    images.mkdir(mode=0o700)
    groups, hashes, report = {}, {}, []
    for split in ("train", "valid", "test"):
        examples = [json.loads(line) for line in (args.data/f"{split}.jsonl").read_text().splitlines() if line.strip()]
        records, seen = [], {}
        for example in examples:
            group = str(example["source_group"])
            if group in groups and groups[group] != split:
                raise ValueError("A source receipt crosses dataset splits")
            groups[group] = split
            if len(example["images"]) != 1 or "owned_pixels" in example:
                raise ValueError("Angle augmentation requires one reviewed complete receipt")
            source = Path(example["images"][0])
            digest = hashlib.sha256(source.read_bytes()).hexdigest()
            key = (group, digest)
            messages = json.dumps(example["messages"], sort_keys=True, ensure_ascii=False)
            if key in seen:  # An explicitly repeated training epoch is not a new receipt.
                if seen[key] != messages:
                    raise ValueError("Repeated receipt has conflicting verified targets")
                continue
            seen[key] = messages
            if digest in hashes and hashes[digest][0] != split:
                raise ValueError("A source image crosses dataset splits")
            if digest in hashes and hashes[digest][1] != group:
                raise ValueError("Duplicate image has different source groups")
            hashes[digest] = (split, group)
            with Image.open(source) as raw:
                if raw.width*raw.height > 40_000_000:
                    raise ValueError("Receipt exceeds the preprocessing pixel limit")
                for pose in POSES:
                    image = pose_image(raw, pose)
                    if image.width*image.height > 40_000_000:
                        raise ValueError("Transformed receipt exceeds the pixel limit")
                    destination = images/f"source-{len(report)}-{pose}.jpg"
                    image.save(destination, quality=96)  # Fresh encoding omits source EXIF.
                    record = {**example, "images": [str(destination.resolve())], "pose": pose}
                    records.append(record)
                    report.append({"source_group": group, "split": split, "pose": pose,
                                   "source_sha256": digest, "image_sha256": hashlib.sha256(destination.read_bytes()).hexdigest(),
                                   "size": image.size})
        (output/f"{split}.jsonl").write_text("".join(json.dumps(row, ensure_ascii=False)+"\n" for row in records))
    (output/"poses.private.json").write_text(json.dumps({"poses": POSES, "images": report,
        "review_required": True, "note": "Derived views are not independent receipts. Targets stay unchanged; never train on valid/test source groups."}, indent=2)+"\n")
    print(json.dumps({"source_groups": len(groups), "derived_images": len(report), "review_required": True}))


if __name__ == "__main__":
    main()
