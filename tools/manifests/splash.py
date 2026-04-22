"""Title/menu splash art."""

COMMON = {
    "category": "splash",
    "aspect_ratio": "3:2",
    "quality": "high",
    "background": "opaque",
    "output_format": "webp",
}


ITEMS = [
    {
        **COMMON,
        "filename": "title.webp",
        "prompt": (
            "Epic sci-fi naval combat game splash art, wide cinematic composition, "
            "four vertically stacked battle zones shown as glowing parallel strata: "
            "deep space with stars at top, cloudy sky with jets below it, stormy ocean surface with warships in the middle, "
            "deep underwater with a submarine at the bottom — all visible simultaneously like cross-section layers. "
            "Dramatic lighting, cool blue and teal palette with orange accents, "
            "central empty area suitable for a title overlay, "
            "no text, no logos, no UI elements, painterly digital illustration style"
        ),
    },
]
