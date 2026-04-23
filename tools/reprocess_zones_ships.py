#!/usr/bin/env python3
"""Second-pass asset processing:

- Zones: center-crop 1536x1024 landscape originals to square, resize to 512x512
  so they fill square board backgrounds without awkward cover-scaling.
- Ships: tight-crop to non-transparent bounding box, then pad to the aspect
  ratio the game actually renders them at (Battleship 3:1, Cruiser/Sub 2:1,
  Spacecraft/FighterJet 1:1). Fixes the "skinny ship" problem where the
  sprite framed the ship with 80% empty space, so the ship only filled 20%
  of each cell when stretched across multiple cells.

Reads originals from git HEAD; writes to assets/*.
"""
import subprocess
from io import BytesIO
from pathlib import Path
from PIL import Image

ROOT = Path(__file__).resolve().parent.parent

# ship type -> (horizontal cells, vertical cells) of its bounding box when
# laid on the board. Horizontal ship sprites have cell-count aspect ratio.
SHIP_ASPECTS = {
    "battleship":  (3, 1),
    "cruiser":     (2, 1),
    "submarine":   (2, 1),
    "destroyer":   (3, 1),   # unused in current game but kept consistent
    "fighterjet":  (1, 1),
    "spacecraft":  (2, 2),   # square
}
SHIP_LONG_EDGE = 384   # final sprite size along the long axis
ZONE_EDGE = 512


def read_git(path: str) -> Image.Image:
    """Read a file at HEAD from git into a PIL Image."""
    data = subprocess.check_output(["git", "show", f"HEAD:{path}"])
    return Image.open(BytesIO(data))


def process_zone(name: str) -> None:
    src = read_git(f"assets/zones/{name}.webp")
    # Center-crop to square using the shorter dimension
    w, h = src.size
    side = min(w, h)
    left = (w - side) // 2
    top = (h - side) // 2
    cropped = src.crop((left, top, left + side, top + side))
    out = cropped.resize((ZONE_EDGE, ZONE_EDGE), Image.LANCZOS)
    out_path = ROOT / f"assets/zones/{name}.webp"
    out.save(out_path, format="WEBP", quality=82, method=6)
    print(f"  zones/{name}: {src.size} -> {out.size} ({out_path.stat().st_size/1024:.0f}KB)")


def process_ship(name: str) -> None:
    src = read_git(f"assets/ships/{name}.png").convert("RGBA")
    # Tight crop using alpha bounding box, with 2% breathing room on all sides
    bbox = src.getbbox()
    if bbox is None:
        print(f"  ships/{name}: empty (skipping)")
        return
    l, t, r, b = bbox
    pad = int(max(r - l, b - t) * 0.02)
    l = max(0, l - pad); t = max(0, t - pad)
    r = min(src.size[0], r + pad); b = min(src.size[1], b + pad)
    cropped = src.crop((l, t, r, b))
    cw, ch = cropped.size

    # Pad to match the cell-count aspect ratio the game renders it at
    aw, ah = SHIP_ASPECTS[name]
    target_aspect = aw / ah  # width / height
    current_aspect = cw / ch
    if current_aspect > target_aspect:
        # Too wide -> add vertical padding
        target_h = int(cw / target_aspect)
        pad_y = (target_h - ch) // 2
        canvas = Image.new("RGBA", (cw, target_h), (0, 0, 0, 0))
        canvas.paste(cropped, (0, pad_y))
    else:
        # Too tall -> add horizontal padding
        target_w = int(ch * target_aspect)
        pad_x = (target_w - cw) // 2
        canvas = Image.new("RGBA", (target_w, ch), (0, 0, 0, 0))
        canvas.paste(cropped, (pad_x, 0))

    # Resize so the long edge is SHIP_LONG_EDGE
    long_edge = max(canvas.size)
    scale = SHIP_LONG_EDGE / long_edge
    new_size = (int(canvas.size[0] * scale), int(canvas.size[1] * scale))
    out = canvas.resize(new_size, Image.LANCZOS)
    out_path = ROOT / f"assets/ships/{name}.webp"
    out.save(out_path, format="WEBP", quality=85, method=6)
    print(f"  ships/{name}: bbox={bbox} -> cropped={cropped.size} -> padded={canvas.size} -> final={out.size} ({out_path.stat().st_size/1024:.0f}KB)")


def main() -> None:
    print("Zones:")
    for z in ("space", "sky", "sea", "underwater"):
        process_zone(z)
    print("\nShips:")
    for s in SHIP_ASPECTS:
        process_ship(s)


if __name__ == "__main__":
    main()
