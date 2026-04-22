#!/usr/bin/env python3
"""
Unified image generator for WarZones assets using Replicate's openai/gpt-image-2.

Reads a manifest (python dict imported from manifests/*.py) of image specs and
renders each one into the appropriate assets subdirectory. Skips files that
already exist. Fails loudly on API errors per-item but keeps going.

Usage:
  export REPLICATE_API_TOKEN=r8_...
  python tools/generate_images.py [batch ...]

Where `batch` is one of: portraits, zones, ships, icons, splash, all.
Default is `all`.
"""

import concurrent.futures as cf
import importlib.util
import os
import sys
import time
from pathlib import Path

import requests

ROOT = Path(__file__).resolve().parent.parent
MANIFEST_DIR = Path(__file__).resolve().parent / "manifests"
ASSET_DIR = ROOT / "assets"

MODEL = "openai/gpt-image-2"
API_URL = f"https://api.replicate.com/v1/models/{MODEL}/predictions"
# 851-labs/background-remover is a community model; invoke by version id.
BG_REMOVER_VERSION = "a029dff38972b5fda4ec5d75d7d1cd25aeff621d2cf4946a41055d7db66b80bc"
VERSION_PREDICTIONS_URL = "https://api.replicate.com/v1/predictions"

TOKEN = os.environ.get("REPLICATE_API_TOKEN")
if not TOKEN:
    print("ERROR: set REPLICATE_API_TOKEN", file=sys.stderr)
    sys.exit(1)


def load_manifest(name):
    path = MANIFEST_DIR / f"{name}.py"
    spec = importlib.util.spec_from_file_location(f"manifest_{name}", path)
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod.ITEMS


def create_prediction(spec):
    body = {
        "input": {
            "prompt": spec["prompt"],
            "aspect_ratio": spec.get("aspect_ratio", "1:1"),
            "quality": spec.get("quality", "high"),
            "background": spec.get("background", "auto"),
            "output_format": spec.get("output_format", "webp"),
            "number_of_images": 1,
        }
    }
    resp = requests.post(
        API_URL,
        headers={"Authorization": f"Bearer {TOKEN}", "Content-Type": "application/json"},
        json=body,
        timeout=30,
    )
    resp.raise_for_status()
    return resp.json()


def poll(prediction_url, timeout_s=300):
    deadline = time.time() + timeout_s
    headers = {"Authorization": f"Bearer {TOKEN}"}
    while time.time() < deadline:
        r = requests.get(prediction_url, headers=headers, timeout=30)
        r.raise_for_status()
        data = r.json()
        status = data.get("status")
        if status == "succeeded":
            return data.get("output")
        if status in ("failed", "canceled"):
            raise RuntimeError(f"prediction {status}: {data.get('error')}")
        time.sleep(2)
    raise TimeoutError("prediction did not finish within timeout")


def download(url, filepath):
    r = requests.get(url, timeout=60)
    r.raise_for_status()
    filepath.parent.mkdir(parents=True, exist_ok=True)
    filepath.write_bytes(r.content)


def remove_background(image_url):
    """Submit image to 851-labs/background-remover; return transparent PNG URL."""
    body = {
        "version": BG_REMOVER_VERSION,
        "input": {"image": image_url, "format": "png", "background_type": "rgba"},
    }
    r = requests.post(
        VERSION_PREDICTIONS_URL,
        headers={"Authorization": f"Bearer {TOKEN}", "Content-Type": "application/json"},
        json=body,
        timeout=30,
    )
    r.raise_for_status()
    pred_url = r.json().get("urls", {}).get("get")
    if not pred_url:
        raise RuntimeError("bg remover returned no prediction url")
    out = poll(pred_url)
    if not out:
        raise RuntimeError("bg remover empty output")
    return out if isinstance(out, str) else out[0]


def run_item(spec):
    out_path = ASSET_DIR / spec["category"] / spec["filename"]
    if out_path.exists():
        return (spec["filename"], "skipped")
    try:
        pred = create_prediction(spec)
        pred_url = pred.get("urls", {}).get("get")
        if not pred_url:
            return (spec["filename"], "error: no prediction url")
        output = poll(pred_url)
        if not output:
            return (spec["filename"], "error: empty output")
        url = output if isinstance(output, str) else output[0]
        if spec.get("remove_background"):
            url = remove_background(url)
        download(url, out_path)
        return (spec["filename"], "ok")
    except Exception as e:
        return (spec["filename"], f"error: {e}")


def run_batch(name, items, workers=3):
    print(f"\n=== {name} ({len(items)} items) ===")
    with cf.ThreadPoolExecutor(max_workers=workers) as ex:
        futures = {ex.submit(run_item, it): it for it in items}
        for fut in cf.as_completed(futures):
            spec = futures[fut]
            name_, status = fut.result()
            marker = "OK " if status == "ok" else ("-- " if status == "skipped" else "!! ")
            print(f"  {marker}{spec['category']}/{name_}: {status}")


BATCHES = ["portraits", "zones", "ships", "icons", "splash"]


def main():
    requested = sys.argv[1:] or ["all"]
    batches = BATCHES if "all" in requested else [b for b in requested if b in BATCHES]
    if not batches:
        print(f"no valid batches. options: {BATCHES + ['all']}")
        sys.exit(2)
    for b in batches:
        items = load_manifest(b)
        run_batch(b, items)
    print("\nDone.")


if __name__ == "__main__":
    main()
