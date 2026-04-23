#!/usr/bin/env python3
"""Downscale and convert game assets to web-appropriate sizes.

Run from repo root:
    /tmp/wzvenv/bin/python tools/optimize_assets.py

Sources are overwritten (or replaced with .webp siblings for PNGs).
Git history is the safety net.
"""
from pathlib import Path
from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
ASSETS = ROOT / "assets"

# (glob, max_dimension, target_format, quality, keep_original_ext)
JOBS = [
    ("portraits/*.webp", 256, "webp", 82, True),
    ("zones/*.webp", 512, "webp", 82, True),
    ("splash/*.webp", 1024, "webp", 80, True),
    # PNGs → WebP (delete original .png)
    ("icons/*.png", 256, "webp", 85, False),
    ("ships/*.png", 384, "webp", 85, False),
]


def process(path: Path, max_dim: int, fmt: str, quality: int, keep_ext: bool) -> tuple[int, int]:
    before = path.stat().st_size
    img = Image.open(path)
    img.thumbnail((max_dim, max_dim), Image.LANCZOS)
    out_path = path if keep_ext else path.with_suffix(f".{fmt}")
    img.save(out_path, format=fmt.upper(), quality=quality, method=6)
    if not keep_ext and path != out_path:
        path.unlink()
    after = out_path.stat().st_size
    return before, after


def main() -> None:
    total_before = total_after = 0
    for pattern, max_dim, fmt, quality, keep in JOBS:
        for path in sorted(ASSETS.glob(pattern)):
            before, after = process(path, max_dim, fmt, quality, keep)
            total_before += before
            total_after += after
            print(f"  {path.relative_to(ROOT)}: {before/1024:.0f}KB -> {after/1024:.0f}KB")
    print(f"\nTotal: {total_before/1024/1024:.2f}MB -> {total_after/1024/1024:.2f}MB "
          f"({100*(1-total_after/total_before):.0f}% smaller)")


if __name__ == "__main__":
    main()
