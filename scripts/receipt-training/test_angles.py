"""Check that pose augmentation preserves complete documents and split isolation."""
import json
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path

from PIL import Image, ImageDraw
from angles import POSES, homography, pose_image


class AngleTests(unittest.TestCase):
    def document(self):
        image = Image.new("RGB", (160, 240), "white")
        draw = ImageDraw.Draw(image)
        for box, color in [((4, 4, 29, 29), "red"), ((130, 4, 155, 29), "lime"),
                           ((130, 210, 155, 235), "blue"), ((4, 210, 29, 235), "yellow")]:
            draw.rectangle(box, fill=color)
        draw.text((40, 90), "ITEM 1 4.99", fill="black")
        draw.text((40, 135), "ITEM 2 8.99", fill="black")
        return image

    def test_all_corners_remain_visible_and_reading_orientation_is_preserved(self):
        for pose in POSES:
            with self.subTest(pose=pose):
                image = pose_image(self.document(), pose)
                centers = []
                for color in range(4):
                    points = []
                    for y in range(image.height):
                        for x in range(image.width):
                            r, g, b = image.getpixel((x, y))
                            found = ((r > 180 and g < 80 and b < 80), (g > 180 and r < 80 and b < 80),
                                     (b > 180 and r < 80 and g < 80), (r > 180 and g > 180 and b < 80))[color]
                            if found:
                                points.append((x, y))
                    self.assertGreater(len(points), 300, "A document corner was clipped or lost")
                    centers.append(tuple(sum(p[i] for p in points)/len(points) for i in range(2)))
                tl, tr, br, bl = centers
                self.assertGreater((tr[0]-tl[0])*(bl[1]-tl[1])-(tr[1]-tl[1])*(bl[0]-tl[0]), 0,
                                   "Receipt was mirrored")

    def test_homography_maps_destination_corners_back_to_source(self):
        source = [(0, 0), (100, 0), (100, 250), (0, 250)]
        destination = [(20, 5), (90, 20), (98, 245), (2, 230)]
        a, b, c, d, e, f, g, h = homography(source, destination)
        for (x, y), (u, v) in zip(destination, source):
            denominator = g*x+h*y+1
            self.assertAlmostEqual((a*x+b*y+c)/denominator, u)
            self.assertAlmostEqual((d*x+e*y+f)/denominator, v)
        with self.assertRaises(ValueError):
            homography(source, [(0, 0)]*4)

    def test_derived_views_keep_targets_and_never_move_between_source_splits(self):
        with tempfile.TemporaryDirectory() as folder:
            root = Path(folder)
            image = root/"receipt.png"
            self.document().save(image)
            example = {"source_group": "a", "images": [str(image)],
                       "messages": [{"role": "user", "content": "Read receipt"},
                                    {"role": "assistant", "content": '{"rows":[["Item","4.99","","Item","p"]]}'}]}
            (root/"train.jsonl").write_text(json.dumps(example)+"\n")
            for split in ("valid", "test"):
                (root/f"{split}.jsonl").write_text("")
            script = Path(__file__).with_name("angles.py")
            result = subprocess.run([sys.executable, str(script), "--data", str(root), "--output", str(root/"output")], capture_output=True)
            self.assertEqual(result.returncode, 0, result.stderr.decode())
            augmented = [json.loads(line) for line in (root/"output/train.jsonl").read_text().splitlines()]
            self.assertEqual({row["pose"] for row in augmented}, set(POSES))
            for row in augmented:
                self.assertEqual(row["messages"], example["messages"])
                self.assertEqual(row["source_group"], "a")
            (root/"valid.jsonl").write_text(json.dumps(example)+"\n")
            result = subprocess.run([sys.executable, str(script), "--data", str(root), "--output", str(root/"leak")], capture_output=True)
            self.assertNotEqual(result.returncode, 0)
            self.assertIn("crosses dataset splits", result.stderr.decode())
            (root/"valid.jsonl").write_text("")
            changed = {**example, "messages": [{"role": "assistant", "content": '{"rows":[]}'}]}
            (root/"train.jsonl").write_text(json.dumps(example)+"\n"+json.dumps(changed)+"\n")
            result = subprocess.run([sys.executable, str(script), "--data", str(root), "--output", str(root/"conflict")], capture_output=True)
            self.assertNotEqual(result.returncode, 0)
            self.assertIn("conflicting verified targets", result.stderr.decode())


if __name__ == "__main__":
    unittest.main()
