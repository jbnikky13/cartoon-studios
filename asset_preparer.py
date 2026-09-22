#!/usr/bin/env python3
"""Phase 7 asset-preparation utilities.

Creates transparent body-part sprites from full-body character PNGs using
normalized crop regions. It intentionally keeps the source artwork unchanged.
"""

from pathlib import Path
from PIL import Image

REGIONS = {
    "head": (0.28, 0.04, 0.72, 0.31),
    "torso": (0.24, 0.27, 0.76, 0.70),
    "left_arm": (0.02, 0.27, 0.29, 0.65),
    "right_arm": (0.71, 0.27, 0.98, 0.65),
    "left_leg": (0.18, 0.68, 0.47, 1.00),
    "right_leg": (0.53, 0.68, 0.82, 1.00),
}

def extract_character(source: Path, destination: Path) -> list[Path]:
    image = Image.open(source).convert("RGBA")
    destination.mkdir(parents=True, exist_ok=True)
    outputs = []
    w, h = image.size
    for name, (x1, y1, x2, y2) in REGIONS.items():
        box = (round(x1*w), round(y1*h), round(x2*w), round(y2*h))
        part = image.crop(box)
        # Keep transparent pixels; remove only fully transparent outer margins.
        alpha = part.getchannel("A")
        bbox = alpha.getbbox()
        if bbox:
            part = part.crop(bbox)
        out = destination / f"{name}.png"
        part.save(out, optimize=True)
        outputs.append(out)
    return outputs

if __name__ == "__main__":
    import argparse
    parser = argparse.ArgumentParser()
    parser.add_argument("source", type=Path)
    parser.add_argument("--output", type=Path, required=True)
    args = parser.parse_args()
    for path in extract_character(args.source, args.output):
        print(path)
