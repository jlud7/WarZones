#!/usr/bin/env python3
"""
Generate enemy commander portraits for WarZones campaign mode.
Uses the Replicate API with Google's nano-banana model (Gemini 2.5 Flash Image).

Usage:
  pip install requests
  REPLICATE_API_TOKEN=r8_your_token_here python generate-portraits.py
"""

import requests
import time
import os
import sys

API_TOKEN = os.environ.get("REPLICATE_API_TOKEN")
if not API_TOKEN:
    print("ERROR: Set REPLICATE_API_TOKEN environment variable")
    print("  REPLICATE_API_TOKEN=r8_... python generate-portraits.py")
    sys.exit(1)
MODEL = "google/nano-banana"
API_URL = f"https://api.replicate.com/v1/models/{MODEL}/predictions"
OUTPUT_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), "assets", "portraits")

STYLE_PREFIX = (
    "Game character portrait, head and shoulders only, dark moody background, "
    "dramatic cinematic lighting, digital painting style, military sci-fi aesthetic, "
    "highly detailed face, sharp focus, "
)

ENEMIES = [
    {
        "id": 1,
        "filename": "enemy-1.webp",
        "prompt": STYLE_PREFIX +
        "young nervous male naval officer, clean shaven, green uniform, "
        "first-time commander look, uncertain eyes, dim bridge lighting"
    },
    {
        "id": 2,
        "filename": "enemy-2.webp",
        "prompt": STYLE_PREFIX +
        "female tactical officer, short dark hair, steely grey eyes, "
        "fog and mist swirling around her, sensor visor over one eye, "
        "blue-grey uniform, mysterious expression"
    },
    {
        "id": 3,
        "filename": "enemy-3.webp",
        "prompt": STYLE_PREFIX +
        "imposing male commander with three deep scars across his face, "
        "shaved head, red and black military armor, menacing grin, "
        "nickname 'The Hydra', multiple medal ribbons, red backlighting"
    },
    {
        "id": 4,
        "filename": "enemy-4.webp",
        "prompt": STYLE_PREFIX +
        "wiry intense female officer, short spiky hair, cybernetic eye implant, "
        "speed lines in background, stopwatch hanging from neck, "
        "yellow-accented dark uniform, tense focused expression"
    },
    {
        "id": 5,
        "filename": "enemy-5.webp",
        "prompt": STYLE_PREFIX +
        "pale gaunt male submarine captain, deep-set dark eyes, "
        "wearing a black submariner's cap, deep ocean blue uniform, "
        "bioluminescent glow from below, claustrophobic atmosphere"
    },
    {
        "id": 6,
        "filename": "enemy-6.webp",
        "prompt": STYLE_PREFIX +
        "grizzled old male demolitions expert, eye patch over left eye, "
        "burn scars on neck, orange and black bomb disposal suit, "
        "dangerous smirk, explosive sparks in background"
    },
    {
        "id": 7,
        "filename": "enemy-7.webp",
        "prompt": STYLE_PREFIX +
        "massive intimidating female warlord, glowing cyan eyes, "
        "heavy black power armor with shield generators, "
        "tentacle motifs on shoulder plates, 'The Kraken', purple backlighting, "
        "cold ruthless expression"
    },
    {
        "id": 8,
        "filename": "enemy-8.webp",
        "prompt": STYLE_PREFIX +
        "ghostly translucent male officer, face partially fading in and out, "
        "spectral blue glow, stealth camouflage uniform shifting colors, "
        "phantom-like, haunting hollow eyes"
    },
    {
        "id": 9,
        "filename": "enemy-9.webp",
        "prompt": STYLE_PREFIX +
        "bulky armored male commander, face behind a cracked transparent visor, "
        "heavy iron-grey power armor, shield insignia on chest, "
        "cold calculating stare, sparks bouncing off armor"
    },
    {
        "id": 10,
        "filename": "enemy-10.webp",
        "prompt": STYLE_PREFIX +
        "legendary elderly admiral, white beard and weathered face, "
        "golden epaulettes on black greatcoat, chest full of medals, "
        "piercing ice-blue eyes, supreme confidence, "
        "golden light behind him, final boss energy, 'Admiral Voss'"
    },
]


def create_prediction(prompt):
    """Start a prediction on Replicate."""
    resp = requests.post(
        API_URL,
        headers={
            "Authorization": f"Bearer {API_TOKEN}",
            "Content-Type": "application/json",
        },
        json={
            "input": {
                "prompt": prompt,
                "aspect_ratio": "1:1",
            }
        },
    )
    resp.raise_for_status()
    return resp.json()


def poll_prediction(prediction_url):
    """Poll until prediction is complete."""
    headers = {"Authorization": f"Bearer {API_TOKEN}"}
    while True:
        resp = requests.get(prediction_url, headers=headers)
        resp.raise_for_status()
        data = resp.json()
        status = data.get("status")
        if status == "succeeded":
            return data.get("output")
        elif status in ("failed", "canceled"):
            print(f"  Prediction {status}: {data.get('error', 'unknown error')}")
            return None
        time.sleep(2)


def download_image(url, filepath):
    """Download image from URL to local file."""
    resp = requests.get(url)
    resp.raise_for_status()
    with open(filepath, "wb") as f:
        f.write(resp.content)


def main():
    os.makedirs(OUTPUT_DIR, exist_ok=True)

    print(f"Generating {len(ENEMIES)} enemy portraits...")
    print(f"Output directory: {OUTPUT_DIR}\n")

    for enemy in ENEMIES:
        filepath = os.path.join(OUTPUT_DIR, enemy["filename"])

        if os.path.exists(filepath):
            print(f"[{enemy['id']}/10] {enemy['filename']} already exists, skipping.")
            continue

        print(f"[{enemy['id']}/10] Generating {enemy['filename']}...")

        try:
            prediction = create_prediction(enemy["prompt"])
            prediction_url = prediction.get("urls", {}).get("get")
            if not prediction_url:
                print(f"  ERROR: No prediction URL returned")
                continue

            print(f"  Waiting for generation...")
            output = poll_prediction(prediction_url)

            if not output:
                print(f"  ERROR: No output received")
                continue

            # Output can be a string URL or list of URLs
            image_url = output if isinstance(output, str) else output[0]
            print(f"  Downloading...")
            download_image(image_url, filepath)
            print(f"  Saved to {enemy['filename']}")

        except Exception as e:
            print(f"  ERROR: {e}")
            continue

    print("\nDone! All portraits saved to assets/portraits/")


if __name__ == "__main__":
    main()
