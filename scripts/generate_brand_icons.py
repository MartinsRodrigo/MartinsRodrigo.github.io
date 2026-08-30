#!/usr/bin/env python3
"""Regenerate favicon PNG/ICO assets from the documented RM brand geometry."""

from pathlib import Path

from PIL import Image, ImageDraw, ImageFont


ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "img"
FONT_CANDIDATES = [
    Path("C:/Windows/Fonts/segoeuib.ttf"),
    Path("C:/Windows/Fonts/arialbd.ttf"),
]


def font_for(size: int) -> ImageFont.FreeTypeFont | ImageFont.ImageFont:
    for candidate in FONT_CANDIDATES:
        if candidate.exists():
            return ImageFont.truetype(str(candidate), size=size)
    return ImageFont.load_default()


def icon(size: int) -> Image.Image:
    scale = size / 512
    image = Image.new("RGB", (size, size), "#315b86")
    draw = ImageDraw.Draw(image)
    stripe = tuple(round(value * scale) for value in (54, 54, 80, 458))
    draw.rounded_rectangle(stripe, radius=max(1, round(13 * scale)), fill="#a24d35")
    cx, cy, radius = (round(value * scale) for value in (422, 90, 24))
    draw.ellipse((cx - radius, cy - radius, cx + radius, cy + radius), fill="#a24d35")
    font = font_for(max(8, round(188 * scale)))
    box = draw.textbbox((0, 0), "RM", font=font)
    width, height = box[2] - box[0], box[3] - box[1]
    x = round(288 * scale) - width // 2
    y = round(278 * scale) - height // 2 - box[1]
    draw.text((x, y), "RM", font=font, fill="white")
    return image


def main() -> None:
    OUT.mkdir(parents=True, exist_ok=True)
    icon(32).save(OUT / "icon.png", optimize=True)
    icon(192).save(OUT / "icon-192.png", optimize=True)
    icon(512).save(OUT / "icon-512.png", optimize=True)
    icon(64).save(OUT / "favicon.ico", sizes=[(16, 16), (32, 32), (48, 48), (64, 64)])
    print("Generated icon.png, icon-192.png, icon-512.png and favicon.ico")


if __name__ == "__main__":
    main()
