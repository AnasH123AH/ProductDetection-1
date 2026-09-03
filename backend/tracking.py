"""
VisionaryAI Object Tracking / Product Lifecycle

Turns per-frame YOLO+tracker detections into ONE Detection History record
per physical product — based on tracked identity and disappearance, not
frame count and not a time-based cooldown alone.

Lifecycle per tracked object (keyed by the tracker's track_id):
  (no entry)
    -> CANDIDATE      seen, but not yet confirmed stable
    -> TRACKING       confirmed after `required_stable_frames` consecutive
                       frames; bbox/confidence kept up to date every frame;
                       no history record is written yet
    -> (missed frames tolerated up to `max_missed_frames`)
    -> EXIT           missed-frame tolerance exceeded -> exactly ONE history
                       record is saved, using the best/representative
                       confidence seen while tracking -> track is closed

A track that saved its exit event is deleted immediately, so it can never
produce a second event. `reset()` clears all state when a live session
(re)starts, so stale track IDs never leak into a new session.
"""

import threading
import time

import database

_lock = threading.Lock()
_tracks = {}          # track_id -> track state dict
_last_exit_at = {}     # class_name -> epoch seconds (secondary cooldown safety net)


def reset():
    with _lock:
        _tracks.clear()
        _last_exit_at.clear()


def _log(msg):
    print(f"[TRACK] {msg}")


def process_frame(detections, required_stable_frames=3, max_missed_frames=5,
                   duplicate_cooldown_seconds=0.0, source="Live Camera",
                   model_name="Ultralytics-YOLOv8-FinalDetector", save_detection_images=False):
    """
    detections: this frame's already confidence/size-filtered YOLO+tracker
    results, as [{"track_id": int, "class": str, "class_id": int,
    "confidence": float, "bbox": [x1,y1,x2,y2]}, ...]. Detections with no
    track_id (tracker hasn't assigned an identity yet) are ignored rather
    than guessed at.

    Returns (active_tracks, exited_tracks):
      active_tracks  — every currently-tracked object (for live UI overlay)
      exited_tracks  — objects that just had exactly ONE history record saved
    """
    now = time.time()
    seen_ids = set()
    exited = []
    stability = max(1, required_stable_frames)
    missed_tolerance = max(1, max_missed_frames)

    with _lock:
        for det in detections:
            tid = det.get('track_id')
            if tid is None:
                continue
            seen_ids.add(tid)

            track = _tracks.get(tid)
            if track is None:
                track = {
                    "track_id": tid,
                    "class_name": det["class"],
                    "class_id": det["class_id"],
                    "state": "CANDIDATE",
                    "frames_seen": 0,
                    "missed_frames": 0,
                    "last_confidence": 0.0,
                    "last_bbox": det["bbox"],
                    "best_confidence": 0.0,
                    "best_bbox": det["bbox"],
                }
                _tracks[tid] = track
                _log(f"ID={tid} class={track['class_name']} confidence={det['confidence']:.2f} new candidate")
            elif track["state"] == "CANDIDATE":
                _log(f"ID={tid} class={track['class_name']} confidence={det['confidence']:.2f} state=CANDIDATE")

            track["frames_seen"] += 1
            track["missed_frames"] = 0
            track["last_confidence"] = det["confidence"]
            track["last_bbox"] = det["bbox"]
            if det["confidence"] > track["best_confidence"]:
                track["best_confidence"] = det["confidence"]
                track["best_bbox"] = det["bbox"]

            if track["state"] == "CANDIDATE" and track["frames_seen"] >= stability:
                track["state"] = "TRACKING"
                _log(f"ID={tid} class={track['class_name']} promoted to TRACKING")

        for tid in list(_tracks.keys()):
            if tid in seen_ids:
                continue
            track = _tracks[tid]
            track["missed_frames"] += 1

            if track["state"] != "TRACKING":
                # Never confirmed stable — a fleeting false positive, not a real
                # product. Discard silently once it's missed its own tolerance
                # window; no history impact either way.
                if track["missed_frames"] > missed_tolerance:
                    del _tracks[tid]
                continue

            _log(f"ID={tid} missed={track['missed_frames']}")

            if track["missed_frames"] > missed_tolerance:
                _log(f"ID={tid} class={track['class_name']} disappeared")

                # Secondary safety net only (not the primary mechanism): avoids
                # writing two rows for the same class in quick succession if the
                # tracker briefly re-IDs an object that never actually left.
                last_exit = _last_exit_at.get(track["class_name"], 0)
                if duplicate_cooldown_seconds > 0 and (now - last_exit) < duplicate_cooldown_seconds:
                    _log(f"ID={tid} class={track['class_name']} exit suppressed by cooldown safety net")
                    del _tracks[tid]
                    continue

                img_path = f"assets/products/{track['class_name'].lower()}.jpeg" if save_detection_images else None
                det_id = database.add_detection(
                    product_name=track["class_name"],
                    class_id=track["class_id"],
                    confidence=track["best_confidence"],
                    bbox=track["best_bbox"],
                    source=source,
                    image_path=img_path,
                    model_name=model_name,
                )
                _last_exit_at[track["class_name"]] = now
                _log(f"EXIT ID={tid} class={track['class_name']}")
                _log(f"HISTORY Saved ONE exit event for {track['class_name']} (detection_id={det_id})")

                exited.append({
                    "track_id": tid,
                    "class": track["class_name"],
                    "confidence": track["best_confidence"],
                    "detection_id": det_id,
                })
                del _tracks[tid]
                _log(f"ID={tid} closed")

        active = [
            {
                "track_id": t["track_id"],
                "class": t["class_name"],
                "confidence": t["last_confidence"],
                "bbox": t["last_bbox"],
                "state": t["state"],
            }
            for t in _tracks.values()
        ]

    return active, exited
