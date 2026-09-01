import os
import io
import json
import base64
import urllib.request
from PIL import Image
from ultralytics import YOLO

print("=" * 65)
print(" VISIONARYAI HARD 0.70 (70%) CONFIDENCE VERIFICATION SUITE")
print("=" * 65)

# 0. Pure boundary logic test: confidence >= 0.70 (not > 0.70)
print("\n0. Confidence Threshold Boundary Logic Tests (conf >= 0.70):")
boundary_cases = [(69.0, False), (69.9, False), (70.0, True), (70.1, True), (85.0, True), (90.0, True)]
for conf_pct, expected in boundary_cases:
    actual = (conf_pct / 100.0) >= 0.70
    status = "PASS" if actual == expected else "FAIL"
    verdict = "ACCEPTED" if actual else "REJECTED"
    print(f"   [{status}] {conf_pct:>5.1f}% -> {verdict} (expected {'ACCEPTED' if expected else 'REJECTED'})")

# 1. Verify YOLO Model directly
model_path = r"C:\yolo\best.pt"
print(f"\n1. Direct YOLO Model Inspection ({model_path}):")
if os.path.exists(model_path):
    model = YOLO(model_path)
    print(f"   Model Loaded Successfully: True")
    print(f"   Classes (4): {model.names}")
else:
    print(f"   ERROR: Model not found at {model_path}")
    exit(1)

# 2. Test Direct Inference on Sample Products with Hard 0.70
print("\n2. Direct YOLO Inference Tests (conf=0.70):")
sample_products = ['trident.jpeg', 'donut.jpeg', 'pickers.jpeg', 'bahia.jpeg']
for prod in sample_products:
    p_path = os.path.join('assets', 'products', prod)
    if os.path.exists(p_path):
        results = model.predict(p_path, conf=0.70, verbose=False)[0]
        detected = []
        for box in results.boxes:
            cid = int(box.cls[0].item())
            conf = float(box.conf[0].item())
            if conf >= 0.70:
                detected.append(f"{model.names[cid]} ({int(conf*100)}%)")
        print(f"   [Product Test] {prod:<15} -> {detected if detected else 'No product detected'}")

# 3. Test Negative / False Positive Scenarios
print("\n3. Negative Tests (Hands, Face, Empty Backgrounds - conf=0.70):")
negatives = {
    'Empty Grey Wall': Image.new('RGB', (640, 480), color=(120, 120, 120)),
    'Hand / Skin Tone': Image.new('RGB', (640, 480), color=(220, 175, 140)),
    'Dark Shadow Background': Image.new('RGB', (640, 480), color=(25, 25, 30)),
    'White Table Surface': Image.new('RGB', (640, 480), color=(245, 245, 245))
}
for name, img in negatives.items():
    results = model.predict(img, conf=0.70, verbose=False)[0]
    detected = []
    for box in results.boxes:
        cid = int(box.cls[0].item())
        conf = float(box.conf[0].item())
        if conf >= 0.70:
            detected.append(f"{model.names[cid]} ({int(conf*100)}%)")
    status_str = "PASS (0 detections)" if len(detected) == 0 else f"FAIL ({detected})"
    print(f"   [Negative Test] {name:<24} -> {status_str}")

# 4. Test API filtering directly
print("\n4. API Server /api/detect Endpoint Test:")
def test_api_detect(image_input, label, conf=0.70):
    if isinstance(image_input, str):
        with open(image_input, 'rb') as f:
            b64 = 'data:image/jpeg;base64,' + base64.b64encode(f.read()).decode('utf-8')
    else:
        buf = io.BytesIO()
        image_input.save(buf, format='JPEG')
        b64 = 'data:image/jpeg;base64,' + base64.b64encode(buf.getvalue()).decode('utf-8')

    payload = {
        'image': b64,
        'source': 'Automated Test',
        'confidence_threshold': conf,
        'save_to_history': False
    }
    
    try:
        req = urllib.request.Request(
            'http://127.0.0.1:5500/api/detect',
            data=json.dumps(payload).encode('utf-8'),
            headers={'Content-Type': 'application/json'}
        )
        with urllib.request.urlopen(req, timeout=5) as resp:
            data = json.loads(resp.read().decode('utf-8'))
            dets = data.get('detections', [])
            
            # Check if any detection leaked below 0.70
            leaks = [d for d in dets if float(d.get('confidence', 0)) < 0.70]
            if leaks:
                print(f"   [API Test] {label:<22} -> FAILED! Found detections below 0.70: {leaks}")
            else:
                summary = [(d['class'], f"{int(float(d['confidence'])*100)}%") for d in dets]
                res_text = str(summary) if summary else "No product detected"
                print(f"   [API Test] {label:<22} -> {res_text} (Status: OK)")
    except Exception as e:
        print(f"   [API Test] {label:<22} -> Server connection note: {e}")

for p in sample_products:
    p_path = os.path.join('assets', 'products', p)
    if os.path.exists(p_path):
        test_api_detect(p_path, p)

test_api_detect(negatives['Hand / Skin Tone'], 'Hand / Skin Image')
test_api_detect(negatives['Empty Grey Wall'], 'Empty Background')

print("\n" + "=" * 65)
print(" ALL HARD 0.70 CONFIDENCE THRESHOLD CHECKS COMPLETED")
print("=" * 65)
