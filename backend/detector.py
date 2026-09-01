"""
Product Detection Computer Vision Engine
Supports Ultralytics YOLO inference with custom trained weights for:
0 = Trident
1 = Donut
2 = Pickers
3 = Bahia

Model: C:\\yolo\\best.pt
Trained on: final_training_dataset (388 train / 97 val)
Performance: Precision 98.87%, Recall 89.89%, mAP50 91.96%, mAP50-95 79.35%
Confidence threshold: 0.70
"""

import os
import time
import io
import base64
import numpy as np
from PIL import Image

# 4 Target Product Classes strictly matching YOLO trained model
CLASSES = {
    0: "Trident",
    1: "Donut",
    2: "Pickers",
    3: "Bahia"
}

CLASS_COLORS = {
    "Trident": "#06B6D4",   # Cyan
    "Donut": "#F59E0B",     # Amber
    "Pickers": "#8B5CF6",   # Violet
    "Bahia": "#10B981"      # Emerald
}

# Model state
yolo_model = None
model_source_path = None
model_loaded = False
model_info = {
    "name": "Ultralytics-YOLOv8-FinalDetector",
    "architecture": "Ultralytics YOLOv8 Custom Detector",
    "version": "8.1.0",
    "input_size": "640x640",
    "weights_path": r"C:\yolo\best.pt",
    "dataset": "final_training_dataset (388 train / 97 val)",
    "classes": ["Trident", "Donut", "Pickers", "Bahia"],
    "classes_mapping": {0: "Trident", 1: "Donut", 2: "Pickers", 3: "Bahia"},
    "classes_count": 4,
    "precision": 0.9887,
    "recall": 0.8989,
    "map50": 0.9196,
    "map50_95": 0.7935,
    "default_confidence": 0.70,
    "status": "Loaded"
}

def find_model_weights():
    # C:\yolo\best.pt is the primary trained model
    candidates = [
        r"C:\yolo\best.pt",
        os.path.join(os.path.dirname(__file__), "best.pt"),
        os.path.join(os.path.dirname(__file__), "..", "best.pt"),
        "C:\\Users\\ANAS\\Downloads\\best.pt",
        "C:\\Users\\ANAS\\Desktop\\best.pt"
    ]
    for c in candidates:
        if os.path.exists(c):
            return c
    return None

def init_detector():
    global yolo_model, model_loaded, model_source_path, model_info
    weights = find_model_weights()
    if weights:
        try:
            from ultralytics import YOLO
            yolo_model = YOLO(weights)
            model_loaded = True
            model_source_path = weights
            model_info["status"] = "Model Connected"
            model_info["weights_path"] = weights
            print(f"[Detector] Ultralytics YOLO model successfully loaded from {weights}")
            print(f"[Detector] Classes: {yolo_model.names}")
            return
        except Exception as e:
            print(f"[Detector] Failed loading Ultralytics model from {weights}: {e}")
    
    model_loaded = False
    model_info["status"] = "Weights Not Found"
    print(f"[Detector] Warning: Could not load weights from C:\\yolo\\best.pt")

def load_image(image_input):
    """Parses base64 string, byte buffer, or file path into a PIL Image"""
    if isinstance(image_input, Image.Image):
        return image_input.convert("RGB")
    
    if isinstance(image_input, str):
        if image_input.startswith("data:image"):
            # Strip data URI header
            header, encoded = image_input.split(",", 1)
            image_data = base64.b64decode(encoded)
            return Image.open(io.BytesIO(image_data)).convert("RGB")
        elif os.path.exists(image_input):
            return Image.open(image_input).convert("RGB")
        else:
            # Raw base64
            image_data = base64.b64decode(image_input)
            return Image.open(io.BytesIO(image_data)).convert("RGB")
            
    if isinstance(image_input, bytes):
        return Image.open(io.BytesIO(image_input)).convert("RGB")
        
    raise ValueError("Unsupported image input format")

HARD_CONFIDENCE_THRESHOLD = 0.70

def detect_image(image_input, conf_threshold=0.70, iou_threshold=0.45, max_detections=10, min_detection_size=20):
    """
    Runs actual Ultralytics YOLO inference on the given image.
    Confidence threshold is strictly enforced (HARD 0.70 minimum).
    If no product detected with conf >= 0.70, returns empty detections list [].
    """
    # Enforce hard 0.70 minimum
    effective_conf = max(HARD_CONFIDENCE_THRESHOLD, float(conf_threshold if conf_threshold is not None else HARD_CONFIDENCE_THRESHOLD))
    max_det = int(max_detections if max_detections is not None else 10)
    min_size = float(min_detection_size if min_detection_size is not None else 20)
    
    start_time = time.time()
    img = load_image(image_input)
    w, h = img.size
    
    detections = []
    
    if yolo_model is not None:
        try:
            # 1. Run YOLO prediction with confidence, IoU, and max_det threshold
            results = yolo_model.predict(img, conf=effective_conf, iou=iou_threshold, max_det=max_det, verbose=False)
            for r in results:
                boxes = r.boxes
                for box in boxes:
                    cls_id = int(box.cls[0].item())
                    conf = float(box.conf[0].item())
                    
                    # Explicit filtering step 1: Discard immediately if below 0.70
                    if conf < HARD_CONFIDENCE_THRESHOLD or conf < effective_conf:
                        continue
                    
                    xyxy = box.xyxy[0].tolist() # [x1, y1, x2, y2]
                    box_w = xyxy[2] - xyxy[0]
                    box_h = xyxy[3] - xyxy[1]

                    # Filter out small detection noise (< min_detection_size px)
                    if box_w < min_size or box_h < min_size:
                        continue

                    cls_name = CLASSES.get(cls_id, yolo_model.names.get(cls_id, f"Class_{cls_id}"))
                    norm_bbox = [
                        round(max(0.0, xyxy[0] / w), 4),
                        round(max(0.0, xyxy[1] / h), 4),
                        round(min(1.0, xyxy[2] / w), 4),
                        round(min(1.0, xyxy[3] / h), 4)
                    ]
                    detections.append({
                        "class": cls_name,
                        "class_id": cls_id,
                        "confidence": round(conf, 3),
                        "bbox": norm_bbox,
                        "pixel_bbox": [round(c, 1) for c in xyxy],
                        "color": CLASS_COLORS.get(cls_name, "#0284C7")
                    })
        except Exception as e:
            print(f"[Detector] YOLO predict error: {e}")
            detections = []
    else:
        print("[Detector] Warning: yolo_model is None during detection.")

    # Explicit filtering step 2: Safety post-filter ensuring nothing < 0.70 leaves backend & cap at max_det
    detections = [d for d in detections if d.get("confidence", 0.0) >= HARD_CONFIDENCE_THRESHOLD][:max_det]

    latency = round((time.time() - start_time) * 1000, 1)
    
    return {
        "detections": detections,
        "total_objects": len(detections),
        "image_size": [w, h],
        "inference_latency_ms": max(2.5, latency),
        "model": model_info["name"],
        "confidence_threshold": effective_conf,
        "status": "success"
    }

def run_benchmark(iterations=10):
    """
    Runs multi-pass inference benchmark measuring mean latency and throughput.
    """
    sample_path = os.path.join(os.path.dirname(__file__), "..", "assets", "products", "trident.jpeg")
    if not os.path.exists(sample_path):
        sample_img = Image.new("RGB", (640, 640), color=(73, 109, 137))
    else:
        sample_img = Image.open(sample_path).convert("RGB")
        
    latencies = []
    # Warmup
    detect_image(sample_img, 0.70)
    
    for _ in range(iterations):
        t0 = time.perf_counter()
        detect_image(sample_img, 0.70)
        dt = (time.perf_counter() - t0) * 1000
        latencies.append(round(dt, 2))
        
    mean_lat = round(float(np.mean(latencies)), 2)
    std_lat = round(float(np.std(latencies)), 2)
    fps = round(1000.0 / (mean_lat if mean_lat > 0 else 1.0), 1)
    
    return {
        "iterations": iterations,
        "mean_latency_ms": mean_lat,
        "std_latency_ms": std_lat,
        "min_latency_ms": min(latencies),
        "max_latency_ms": max(latencies),
        "estimated_fps": fps,
        "latencies": latencies,
        "model_name": model_info["name"],
        "device": "CPU / Edge Inference"
    }

def reload_weights(weights_path):
    global yolo_model, model_loaded, model_source_path, model_info
    if os.path.exists(weights_path):
        try:
            from ultralytics import YOLO
            yolo_model = YOLO(weights_path)
            model_loaded = True
            model_source_path = weights_path
            model_info["status"] = "Model Connected"
            model_info["weights_path"] = weights_path
            return {"status": "success", "message": f"Weights loaded from {weights_path}"}
        except Exception as e:
            return {"status": "error", "message": str(e)}
    else:
        return {"status": "error", "message": f"File not found: {weights_path}"}

# Initialize on import
init_detector()
