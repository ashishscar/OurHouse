"""Build private vision SFT splits from explicitly reviewed receipt annotations.

No customer fixture is bundled. Inputs and generated images/labels must remain
outside Git. Whole source images, not crops, determine the train/valid/test split.
"""
import argparse
import hashlib
import json
import math
import random
import subprocess
from pathlib import Path

from PIL import Image, ImageDraw, ImageEnhance, ImageFilter

ROOT = Path(__file__).resolve().parents[2]


def digest(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def private_output(path):
    path = path.resolve()
    if path == ROOT or ROOT in path.parents:
        result = subprocess.run(
            ["git", "check-ignore", "--quiet", str(path / "private-output")],
            cwd=ROOT, check=False,
        )
        if result.returncode != 0:
            raise ValueError("Training output must be Git-ignored or outside the checkout")
    path.mkdir(parents=True, exist_ok=True, mode=0o700)
    return path


def marked_band(image, top, bottom, context=140):
    """Context preserves wrapped/rate evidence; markers define row ownership."""
    start, stop = max(0, top-context), min(image.height, bottom+context)
    result = image.crop((0, start, image.width, stop)).convert("RGB")
    draw = ImageDraw.Draw(result)
    lo, hi = top-start, bottom-start
    for a, b in [(0, lo), (hi, result.height)]:
        if b > a:
            piece = result.crop((0, a, result.width, b))
            white = Image.new("RGB", piece.size, "white")
            result.paste(Image.blend(piece, white, .72), (0, a))
    draw = ImageDraw.Draw(result)
    for y, name in [(lo, "BEGIN"), (min(result.height-1, hi), "END")]:
        draw.line((0, y, result.width, y), fill="#2871B7", width=3)
        draw.rectangle((0, max(0, y-14), 55, y), fill="white")
        draw.text((3, max(0, y-13)), name, fill="#164E85")
    return result


def gap_boundaries(image, size, offset=0):
    """Use image-only blank gaps so a marker does not run through text."""
    gray = image.convert("L").crop((image.width//10, 0, image.width*9//10, image.height))
    ink = gray.point(lambda value: 255 if value < 145 else 0).resize((1, image.height), Image.Resampling.BOX)
    density = ink.tobytes()
    result = [0]
    for proposal in range(offset or size, image.height, size):
        if image.height-proposal < 40:
            continue
        candidates = range(max(result[-1]+40, proposal-40), min(image.height-40, proposal+40))
        if not candidates:
            continue
        cut = min(candidates, key=lambda y: (sum(density[max(0,y-3):y+4]), abs(y-proposal)))
        result.append(cut)
    return result+[image.height]


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--manifest", type=Path, required=True)
    parser.add_argument("--annotations", type=Path, required=True)
    parser.add_argument("--output", type=Path, required=True)
    parser.add_argument("--width", type=int, default=1000)
    parser.add_argument("--band-height", type=int, default=600)
    parser.add_argument("--context", type=int, default=140)
    args = parser.parse_args()
    if not 400 <= args.width <= 1600 or not 200 <= args.band_height <= 1200 or not 0 <= args.context <= 240:
        raise ValueError("Unsafe image dimensions")
    output = private_output(args.output)
    manifest = json.loads(args.manifest.read_text())
    annotations = json.loads(args.annotations.read_text())
    instruction = json.loads((ROOT/"receipts/row-prompt.json").read_text())["instruction"]
    splits = {"train": [], "valid": [], "test": []}
    sources, pixels, groups = set(), set(), {}
    rng = random.Random(369)
    image_dir = output/"images"
    image_dir.mkdir(mode=0o700, exist_ok=True)
    for record in manifest:
        source = Path(record["source"])
        key, split = str(record["id"]), record["split"]
        if split not in splits or record.get("verified") is not True:
            raise ValueError("Every source needs a reviewed split, bounds and annotations")
        source_hash = digest(source)
        if source_hash != record["sha256"] or source_hash in sources:
            raise ValueError("Changed or duplicate source")
        sources.add(source_hash)
        image = Image.open(source).convert("RGB")
        pixel_hash = hashlib.sha256(image.tobytes()).hexdigest()
        if pixel_hash in pixels:
            raise ValueError("Re-encoded duplicate source")
        pixels.add(pixel_hash)
        x0, x1, y0, y1 = record["bounds"]
        if not 0 <= x0 < x1 <= 1 or not 0 <= y0 < y1 <= 1:
            raise ValueError("Invalid privacy bounds")
        width, height = image.size
        image = image.crop((math.floor(x0*width), math.floor(y0*height), math.ceil(x1*width), math.ceil(y1*height)))
        scale = args.width/image.width
        image = image.resize((args.width, max(1, round(image.height*scale))), Image.Resampling.LANCZOS)
        blocks = annotations[key]
        for block in blocks:
            if not y0 <= block["y"] < y1 or len(block["row"]) != 5:
                raise ValueError("An annotation falls outside the reviewed image bounds")
        groups[key] = {"split": split, "source_sha256": source_hash, "pixel_sha256": pixel_hash}
        # Source-held-out validation/test use only the normal production tiling.
        # Training adds shifted boundaries and mild camera-like variations.
        offsets = [0, args.band_height//3, 2*args.band_height//3] if split == "train" else [0]
        index = 0
        for offset in offsets:
            boundaries = gap_boundaries(image, args.band_height, offset)
            for top, bottom in zip(boundaries, boundaries[1:]):
                if bottom-top < 40:
                    continue
                owned = [b for b in blocks if top <= (b["y"]-y0)*height*scale < bottom]
                target = {"rows": [b["row"] for b in owned]}
                crop = marked_band(image, top, bottom, args.context)
                variants = [crop]
                if split == "train":
                    variant = ImageEnhance.Contrast(crop).enhance(rng.uniform(.85, 1.15))
                    variant = ImageEnhance.Brightness(variant).enhance(rng.uniform(.93, 1.07))
                    variants.append(variant.filter(ImageFilter.GaussianBlur(.15)))
                for variant in variants:
                    destination = image_dir/f"source-{key}-{index}.jpg"
                    variant.save(destination, quality=94)  # strips all EXIF metadata
                    splits[split].append({
                        "images": [str(destination.resolve())],
                        "messages": [
                            {"role": "user", "content": instruction},
                            {"role": "assistant", "content": json.dumps(target, separators=(",", ":"), ensure_ascii=False)},
                        ],
                        "source_group": key,
                        "owned_pixels": [top, bottom],
                    })
                    index += 1
    for split, rows in splits.items():
        (output/f"{split}.jsonl").write_text("".join(json.dumps(row, ensure_ascii=False)+"\n" for row in rows))
    report = {"sources": groups, "examples": {split: len(rows) for split, rows in splits.items()},
              "prompt_sha256": hashlib.sha256(instruction.encode()).hexdigest(),
              "width": args.width, "band_height": args.band_height, "context": args.context}
    (output/"manifest.private.json").write_text(json.dumps(report, indent=2)+"\n")
    print(json.dumps({"source_count": len(sources), "examples": report["examples"]}))


if __name__ == "__main__":
    main()
