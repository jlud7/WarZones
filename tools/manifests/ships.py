"""Ship sprites — top-down view, clean plain background for easy BG removal."""

STYLE = (
    "Top-down orthographic game sprite, subject centered in frame with generous margin, "
    "clean readable silhouette, stylized sci-fi military vehicle, "
    "consistent semi-realistic illustration style matching a cohesive set, "
    "subtle cel-shaded highlights and shadows, "
    "flat plain solid light grey background, studio product shot, no scenery, "
    "no text, no labels, no UI, "
)

COMMON = {
    "category": "ships",
    "aspect_ratio": "1:1",
    "quality": "high",
    "background": "opaque",
    "output_format": "png",
    "remove_background": True,
}


def _mk(name, prompt):
    return {**COMMON, "filename": f"{name}.png", "prompt": STYLE + prompt}


ITEMS = [
    _mk("spacecraft",
        "top-down view of a perfectly circular alien UFO disc, radially symmetric, "
        "central domed cockpit in the middle, glowing teal lights around the rim, "
        "dark chrome plating with intricate panel details, hull silhouette is a perfect circle "
        "(1-to-1 aspect ratio, NOT oval, NOT elongated), "
        "sprite will be tiled across a 2-by-2 grid so the design must read well as a single unified circle"),
    _mk("fighterjet",
        "top-down view of a compact single-seat sci-fi fighter jet, swept delta wings, "
        "glowing orange thruster at the rear, grey and yellow paint scheme, hull roughly square, "
        "oriented nose-up"),
    _mk("battleship",
        "top-down view of a 3-by-1-cell modern naval battleship, long grey hull with forward and aft gun turrets, "
        "bridge superstructure near the center, radar mast, hull roughly 3 times as long as wide, "
        "oriented horizontally, dark naval paint"),
    _mk("cruiser",
        "top-down view of a 2-by-1-cell naval cruiser, sleek grey hull with a single central superstructure and missile cells, "
        "hull roughly 2 times as long as wide, "
        "oriented horizontally, darker naval paint than a battleship"),
    _mk("destroyer",
        "top-down view of a 2-by-1-cell naval destroyer, angular stealth hull with a single forward gun, "
        "sharp low-profile superstructure, hull roughly 2 times as long as wide, "
        "oriented horizontally, charcoal and black paint"),
    _mk("submarine",
        "top-down view of a 2-by-1-cell military submarine, smooth cigar-shaped dark hull with a single central conning tower, "
        "faint periscope, hull roughly 2 times as long as wide, "
        "oriented horizontally, deep blue-black paint"),
]
