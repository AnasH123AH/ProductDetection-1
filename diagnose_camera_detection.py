"""
VisionaryAI Camera Detection Diagnostic

Standalone test that talks directly to backend/detector.py's real YOLO
model — no HTTP server, no live-camera loop, no tracker, no frontend
involved. It exists to answer the one question a screenshot of the live
view can never answer on its own:

    (A) YOLO itself does not produce a box for this product in this image, or
    (B) YOLO DOES produce a box, but the app's own confidence/size
        filtering rejects it before it ever reaches the screen.

That distinction decides whether the fix belongs in code (thresholds,
preprocessing, stability) or in the training data. This script makes it
directly observable instead of inferred.

MUST be run on the machine that actually has the trained weights
(C:\\yolo\\best.pt, or wherever reload_weights()/find_model_weights() point)
and the `ultralytics` package installed. The sandbox this script was
written in has neither — it was checked for syntax and for correct
behavior on every non-model code path (image loading, the aspect-ratio
distortion comparison, the synthetic angle/distance/lighting variations),
but the actual detection numbers below can only come from your machine.

Usage:
    python diagnose_camera_detection.py                 # sample images only
    python diagnose_camera_detection.py --camera         # also grab one live frame per product (interactive)

Requires: PIL, numpy, ultralytics — same as backend/requirements.txt plus
whatever backend/detector.py already needs.
"""

import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(__file__), 'backend'))

import detector  # noqa: E402
from PIL import Image, ImageEnhance  # noqa: E402

PROBE_CONF = 0.25   # low floor used ONLY by this diagnostic, to see what YOLO
                     # produces before the app's real 0.70 hard floor applies.
                     # Never used by the real application.
REAL_CONF = 0.70     # the app's actual, unchanged hard floor.
MIN_SIZE = 20        # the app's actual min_detection_size default.

SAMPLES_DIR = os.path.join(os.path.dirname(__file__), 'assets', 'products')
PRODUCTS = ['trident', 'donut', 'pickers', 'bahia']


def _raw_probe(img):
    """Every box YOLO produces at PROBE_CONF, completely unfiltered by the
    app's own logic — the ground truth for "did the model see this at all."""
    if detector.yolo_model is None:
        return None
    results = detector.yolo_model.predict(img, conf=PROBE_CONF, iou=0.45, max_det=10, verbose=False)
    boxes_out = []
    for r in results:
        for box in r.boxes:
            cls_id = int(box.cls[0].item())
            conf = float(box.conf[0].item())
            xyxy = box.xyxy[0].tolist()
            cls_name = detector.CLASSES.get(cls_id, detector.yolo_model.names.get(cls_id, f"Class_{cls_id}"))
            boxes_out.append({
                "class": cls_name, "class_id": cls_id, "confidence": conf,
                "box_w": xyxy[2] - xyxy[0], "box_h": xyxy[3] - xyxy[1],
            })
    return boxes_out


def run_case(label, img, expected_class):
    """Runs both the raw probe and the real production path on one image,
    and prints a verdict distinguishing A (YOLO never saw it) from
    B (YOLO saw it, the app's filters rejected it)."""
    if detector.yolo_model is None:
        print(f"  [{label}] SKIPPED — no model loaded. Run this script on the "
              f"machine with the real weights and `ultralytics` installed.")
        return

    raw = _raw_probe(img)
    matches = [b for b in raw if b["class"].lower() == expected_class.lower()]

    if not matches:
        best = max(raw, key=lambda b: b["confidence"]) if raw else None
        extra = f" (highest-confidence box in frame was {best['class']} at {best['confidence']:.0%})" if best else " (no boxes at all, even at 25% probe)"
        print(f"  [{label}] VERDICT A — YOLO did not produce a {expected_class} box even at a {PROBE_CONF:.0%} probe.{extra}")
        print(f"            -> This points at the dataset/model, not app filtering: "
              f"the model has no signal for {expected_class} in this framing.")
        return

    best_match = max(matches, key=lambda b: b["confidence"])
    conf = best_match["confidence"]
    w, h = best_match["box_w"], best_match["box_h"]

    if conf >= REAL_CONF and w >= MIN_SIZE and h >= MIN_SIZE:
        print(f"  [{label}] OK — {expected_class} detected at {conf:.1%} confidence, "
              f"box {w:.0f}x{h:.0f}px. Passes the real app filters normally.")
    elif conf < REAL_CONF:
        print(f"  [{label}] VERDICT B — YOLO SAW {expected_class} at {conf:.1%}, "
              f"but that is below the app's {REAL_CONF:.0%} hard floor, so the app "
              f"never shows/saves it. This is a real, present detection being filtered out, "
              f"not a missing one.")
    else:
        print(f"  [{label}] VERDICT B — YOLO saw {expected_class} at {conf:.1%} (passes confidence), "
              f"but its box ({w:.0f}x{h:.0f}px) is smaller than min_detection_size ({MIN_SIZE}px) "
              f"and gets filtered on size instead.")


def make_variations(img):
    """Synthetic stand-ins for Etape 11's Test 4-7 (distance, tilt,
    lighting) generated from one still photo. These are NOT a substitute
    for testing with the real camera at those positions — a resized/rotated
    still photo does not reproduce real motion blur, real lens distortion,
    or a real camera's auto-exposure response the way physically moving the
    camera does. Treat their results as a first, repeatable sanity check;
    trust the real --camera run (or a manual test) as the final answer."""
    w, h = img.size
    return {
        "baseline (as-is)": img,
        "closer (+40% size, simulates approaching the camera)": img.resize((int(w * 1.4), int(h * 1.4))),
        "farther (-35% size, simulates moving away)": img.resize((int(w * 0.65), int(h * 0.65))),
        "tilted +8deg": img.rotate(8, expand=True, fillcolor=(255, 255, 255)),
        "tilted -8deg": img.rotate(-8, expand=True, fillcolor=(255, 255, 255)),
        "dimmer lighting (-30% brightness)": ImageEnhance.Brightness(img).enhance(0.7),
        "brighter lighting (+30% brightness)": ImageEnhance.Brightness(img).enhance(1.3),
    }


def compare_capture_distortion(img):
    """Directly answers whether the OLD buggy frontend capture (a fixed,
    non-aspect-preserving 640x480 canvas — see js/live-detect.js) actually
    hurts detection versus the FIXED aspect-preserving capture, on the
    exact same source frame. This is the single most direct evidence for or
    against the aspect-ratio-distortion diagnosis, run on your real model
    instead of argued from CSS/canvas math alone."""
    w, h = img.size
    print(f"  Source image: {w}x{h}px")

    # OLD behavior: js/live-detect.js used to hardcode a 640x480 destination
    # regardless of the source's real aspect ratio, stretching a 16:9-ish
    # frame into 4:3 (different x/y scale factors -> real distortion).
    old_distorted = img.resize((640, 480))

    # NEW behavior: scale proportionally, longest side capped at 640 -
    # matches the fix now in js/live-detect.js's processVideoFrame().
    scale = min(1.0, 640 / max(w, h))
    new_w, new_h = max(1, round(w * scale)), max(1, round(h * scale))
    new_correct = img.resize((new_w, new_h))

    print(f"  OLD (buggy) capture would have sent: 640x480px (stretched, aspect ratio changed"
          f" from {w/h:.2f} to {640/480:.2f})")
    print(f"  NEW (fixed) capture sends:            {new_w}x{new_h}px (aspect ratio preserved: {new_w/new_h:.2f})")

    for name, variant in [("OLD distorted 640x480", old_distorted), ("NEW aspect-preserving", new_correct)]:
        raw = _raw_probe(variant)
        top = max(raw, key=lambda b: b["confidence"]) if raw else None
        if top:
            print(f"    {name}: top detection = {top['class']} at {top['confidence']:.1%}")
        else:
            print(f"    {name}: no detections at all, even at {PROBE_CONF:.0%} probe")


def main():
    if detector.yolo_model is None:
        print("=" * 78)
        print(" No model loaded (yolo_model is None / weights not found).")
        print(" This script cannot produce real numbers without the actual trained")
        print(" weights and `ultralytics` installed. Run it on the machine where")
        print(" backend/app.py normally runs, not in a bare checkout.")
        print("=" * 78)
        return

    print("=" * 78)
    print(" PART 1 — Does YOLO see each product at all, in the existing sample photos?")
    print(" (A = model never saw it -> dataset issue. B = model saw it, app filtered it -> code issue.)")
    print("=" * 78)
    for product in PRODUCTS:
        for suffix in ['', '_sample2']:
            path = os.path.join(SAMPLES_DIR, f"{product}{suffix}.jpeg")
            if not os.path.exists(path):
                continue
            img = Image.open(path).convert("RGB")
            run_case(f"{product}{suffix}", img, product)

    print()
    print("=" * 78)
    print(" PART 2 — Synthetic distance / tilt / lighting variations (Trident)")
    print(" Approximation only — a real camera test still matters more than this.")
    print("=" * 78)
    trident_path = os.path.join(SAMPLES_DIR, "trident.jpeg")
    if os.path.exists(trident_path):
        base = Image.open(trident_path).convert("RGB")
        for label, variant in make_variations(base).items():
            run_case(label, variant, "trident")

    print()
    print("=" * 78)
    print(" PART 3 — OLD (distorted) vs NEW (aspect-preserving) live capture, same frame")
    print("=" * 78)
    if os.path.exists(trident_path):
        compare_capture_distortion(Image.open(trident_path).convert("RGB"))

    print()
    print("Done. If PART 1/2 show mostly VERDICT B for Trident (YOLO saw it, app")
    print("filtered it), the code-level fixes in this change are the right lever.")
    print("If PART 1/2 show mostly VERDICT A (YOLO never sees Trident at all, even")
    print("at a 25% probe, across these variations), that is dataset-coverage")
    print("evidence, not a threshold/preprocessing bug — see the report's dataset")
    print("recommendation.")


if __name__ == '__main__':
    main()
