"""Power-up and game icons — opaque plain BG, background removed post-hoc."""

STYLE = (
    "Single centered game icon, clean readable silhouette, stylized semi-realistic sci-fi, "
    "cel-shaded with rim lighting and a soft glow, "
    "flat plain solid light grey background, studio product shot, no scenery, "
    "no text, no labels, no UI, generous empty margin around the subject, "
    "consistent illustration style across the set, "
)

COMMON = {
    "category": "icons",
    "aspect_ratio": "1:1",
    "quality": "high",
    "background": "opaque",
    "output_format": "png",
    "remove_background": True,
}


def _mk(name, prompt):
    return {**COMMON, "filename": f"{name}.png", "prompt": STYLE + prompt}


ITEMS = [
    _mk("treasure-chest",
        "ornate treasure chest glowing with golden light from inside its cracked open lid, "
        "dark wood and brass, a few coins spilling out, mysterious underwater vibe, centered"),
    _mk("black-box",
        "aircraft flight recorder, bright orange and black striped casing, "
        "antenna on top, rugged industrial design, slight glow from indicator light, centered"),
    _mk("krypton-laser",
        "futuristic sci-fi laser emitter device, emerald green energy core, chrome and dark metal housing, "
        "a single sharp green beam emanating upward, highly detailed, centered"),
    _mk("cannon-ball",
        "heavy dark iron cannonball with faint rust patina, slight glow of red-hot fuse ignition, "
        "dramatic shadow, centered"),
    _mk("mine",
        "classic spherical naval sea mine with protruding contact spikes, chain link at the bottom, "
        "dark green and black weathered metal, menacing silhouette, centered"),
    _mk("explosion",
        "stylized explosion burst, orange and yellow fireball with dark smoke edges, "
        "sharp star-shape silhouette, centered, flat game-icon look"),
]
