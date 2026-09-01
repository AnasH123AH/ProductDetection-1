import urllib.request
import json
import base64
import os
import io
from PIL import Image

def test_detect(image_input, name, conf=0.70):
    if isinstance(image_input, str):
        with open(image_input, 'rb') as f:
            b64 = 'data:image/jpeg;base64,' + base64.b64encode(f.read()).decode('utf-8')
    else:
        buf = io.BytesIO()
        image_input.save(buf, format='JPEG')
        b64 = 'data:image/jpeg;base64,' + base64.b64encode(buf.getvalue()).decode('utf-8')

    payload = {
        'image': b64,
        'source': 'Live Camera Test',
        'confidence_threshold': conf,
        'save_to_history': False
    }
    
    req = urllib.request.Request(
        'http://127.0.0.1:5500/api/detect',
        data=json.dumps(payload).encode('utf-8'),
        headers={'Content-Type': 'application/json'}
    )
    with urllib.request.urlopen(req) as resp:
        data = json.loads(resp.read().decode('utf-8'))
        dets = data.get('detections', [])
        summary = [(d['class'], f"{int(d['confidence']*100)}%") for d in dets]
        res_str = str(summary) if summary else "No product detected"
        print(f"[{name}] -> {res_str} | Latency: {data.get('inference_latency_ms')}ms")

if __name__ == '__main__':
    print("=== PRODUCT DETECTION TESTS (Threshold = 0.70) ===")
    for p in ['trident.jpeg', 'trident_sample2.jpeg', 'donut.jpeg', 'donut_sample2.jpeg', 'pickers.jpeg', 'pickers_sample2.jpeg', 'bahia.jpeg', 'bahia_sample2.jpeg']:
        fpath = os.path.join('assets', 'products', p)
        if os.path.exists(fpath):
            test_detect(fpath, p)

    print("\n=== NEGATIVE TESTS (Hands, Face, Empty Background) ===")
    blank = Image.new('RGB', (640, 480), color=(100, 100, 100))
    test_detect(blank, 'Empty Background')

    skin = Image.new('RGB', (640, 480), color=(220, 175, 140))
    test_detect(skin, 'Hand / Face Tone')
