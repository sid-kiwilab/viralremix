"""Rebuild Luca UI portrait (profile-display.webp) from full-res profile.jpg."""
from __future__ import annotations

from pathlib import Path

from PIL import Image

LUCA_DIR = Path(__file__).resolve().parents[1] / "public" / "avatars" / "luca"
SRC = LUCA_DIR / "profile.jpg"
OUT = LUCA_DIR / "profile-display.webp"
MAX_WIDTH = 400
WEBP_QUALITY = 82


def main() -> None:
    if not SRC.is_file():
        raise SystemExit(f"Missing source: {SRC}")

    im = Image.open(SRC).convert("RGB")
    w, h = im.size
    if w > MAX_WIDTH:
        nh = int(h * MAX_WIDTH / w)
        im = im.resize((MAX_WIDTH, nh), Image.Resampling.LANCZOS)

    OUT.parent.mkdir(parents=True, exist_ok=True)
    im.save(OUT, "WEBP", quality=WEBP_QUALITY, method=6)
    print(f"Wrote {OUT} ({OUT.stat().st_size} bytes, {im.size[0]}x{im.size[1]})")


if __name__ == "__main__":
    main()
