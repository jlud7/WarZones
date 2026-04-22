"""Zone background plates for the 4 battle layers."""

STYLE = (
    "Painterly sci-fi game background plate, wide cinematic composition, "
    "dark moody atmosphere with a slight vignette toward the edges, "
    "clean negative space in the center suitable for overlaying a game grid, "
    "no text, no UI, no characters, no ships, no logos, "
)

COMMON = {
    "category": "zones",
    "aspect_ratio": "3:2",
    "quality": "high",
    "background": "opaque",
    "output_format": "webp",
}


def _mk(name, prompt):
    return {**COMMON, "filename": f"{name}.webp", "prompt": STYLE + prompt}


ITEMS = [
    _mk("space",
        "deep space view, distant nebula in purple and teal, "
        "scattered stars and a single large planet with faint rings on the horizon, "
        "cosmic dust clouds, subtle lens flare, colour palette dominated by indigo and magenta"),
    _mk("sky",
        "high altitude sky, dramatic cumulus and cirrus cloud layers lit from behind, "
        "sunlight breaking through the clouds, atmospheric haze, "
        "distant contrails, colour palette dominated by steel blue and warm gold"),
    _mk("sea",
        "open ocean seen from above the waterline, choppy grey-green waves, "
        "storm clouds gathering on the horizon, distant rain curtain, "
        "foam on wave crests, colour palette dominated by cold teal and slate grey"),
    _mk("underwater",
        "deep underwater submarine zone, god rays filtering down from above, "
        "murky blue-green water with particulate matter and silt drifting, "
        "faint silhouettes of kelp and rock formations at the edges, "
        "colour palette dominated by deep teal and midnight blue"),
]
