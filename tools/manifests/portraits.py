"""Commander portraits for campaign mode. Regenerated with GPT-Image-2."""

STYLE = (
    "Game character portrait, head and shoulders only, dark moody background, "
    "dramatic cinematic lighting, digital painting style, military sci-fi aesthetic, "
    "highly detailed face, sharp focus, consistent illustration style across the set, "
)

COMMON = {
    "category": "portraits",
    "aspect_ratio": "1:1",
    "quality": "high",
    "background": "opaque",
    "output_format": "webp",
}


def _mk(i, prompt):
    return {**COMMON, "filename": f"enemy-{i}.webp", "prompt": STYLE + prompt}


ITEMS = [
    _mk(1,
        "young nervous male naval officer, clean shaven, green uniform, "
        "first-time commander look, uncertain wide eyes, dim bridge lighting, "
        "slight sweat on brow showing anxiety"),
    _mk(2,
        "female tactical officer, short dark hair, steely grey eyes, "
        "fog and mist swirling around her, sensor visor over one eye glowing pale blue, "
        "blue-grey uniform, mysterious unreadable expression"),
    _mk(3,
        "imposing male commander with three deep parallel scars across his face, "
        "shaved head, red and black military armor with hydra insignia, menacing grin, "
        "multiple medal ribbons, red rim lighting, multi-headed serpent silhouette behind him"),
    _mk(4,
        "wiry intense female officer, short spiky platinum hair, cybernetic eye implant, "
        "motion blur and speed lines in background, stopwatch on a chain around neck, "
        "yellow-accented dark uniform, tense focused expression, caught mid-shout"),
    _mk(5,
        "pale gaunt male submarine captain, deep-set dark eyes with shadow, "
        "black submariner's cap, deep ocean blue uniform with tarnished brass buttons, "
        "bioluminescent glow from below casting upward light, claustrophobic atmosphere"),
    _mk(6,
        "grizzled old male demolitions expert, eye patch over left eye, "
        "burn scars across neck and jaw, orange and black bomb disposal suit with padding, "
        "dangerous crooked smirk, orange sparks and embers in background"),
    _mk(7,
        "massive intimidating female warlord, glowing cyan eyes, "
        "heavy black power armor with shield generators on shoulders, "
        "tentacle motifs on pauldrons, purple backlighting, "
        "cold ruthless expression, faint kraken silhouette in deep background"),
    _mk(8,
        "ghostly translucent male officer, face partially fading in and out of visibility, "
        "spectral blue-white glow, stealth camouflage uniform shifting colors, "
        "phantom-like, haunting hollow eyes, wisps of light trailing from the edges of his form"),
    _mk(9,
        "bulky armored male commander, face behind a cracked transparent visor, "
        "heavy iron-grey power armor, shield insignia on chest plate, "
        "cold calculating stare visible through the visor, sparks bouncing off shoulder armor"),
    _mk(10,
        "legendary elderly admiral, white beard and weathered face, "
        "golden epaulettes on black greatcoat, chest full of medals and ribbons, "
        "piercing ice-blue eyes, supreme confidence, regal posture, "
        "golden rim light behind him, final boss energy, commanding presence"),
]
