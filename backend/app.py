"""
VisionaryAI - Product Detection REST API Server
Provides endpoints for live inference, history, analytics, settings, and database management.
"""

from http.server import HTTPServer, BaseHTTPRequestHandler
import json
import os
import sys
import time
import urllib.parse
from datetime import datetime

# Add current directory to path
sys.path.append(os.path.dirname(__file__))

import database
import detector

PORT = 8000
SERVER_START_TIME = datetime.now()

# In-memory request log buffer (last 50 requests)
REQUEST_LOGS = []

def log_request(method, path, status, latency_ms):
    log_entry = {
        "timestamp": datetime.now().strftime("%H:%M:%S"),
        "method": method,
        "path": path,
        "status": status,
        "latency_ms": round(latency_ms, 1)
    }
    REQUEST_LOGS.insert(0, log_entry)
    if len(REQUEST_LOGS) > 50:
        REQUEST_LOGS.pop()

class VisionaryAPIHandler(BaseHTTPRequestHandler):
    def _send_cors_headers(self):
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS')
        self.send_header('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Requested-With')
        
    def _send_json(self, data, status_code=200):
        self.send_response(status_code)
        self.send_header('Content-Type', 'application/json; charset=utf-8')
        self._send_cors_headers()
        self.end_headers()
        self.wfile.write(json.dumps(data, default=str).encode('utf-8'))
        
    def do_OPTIONS(self):
        self.send_response(204)
        self._send_cors_headers()
        self.end_headers()

    def do_GET(self):
        t0 = time.perf_counter()
        parsed = urllib.parse.urlparse(self.path)
        path = parsed.path
        query = urllib.parse.parse_qs(parsed.query)

        # 1. Health Status & Telemetry
        if path == '/api/status':
            uptime_seconds = int((datetime.now() - SERVER_START_TIME).total_seconds())
            resp = {
                "frontend": "Online",
                "backend": "Online",
                "uptime_seconds": uptime_seconds,
                "uptime_formatted": f"{uptime_seconds // 3600}h {(uptime_seconds % 3600) // 60}m {uptime_seconds % 60}s",
                "model_status": detector.model_info.get("status", "Model Connected"),
                "model_name": detector.model_info.get("name", "Ultralytics-YOLOv8-Polytechnique"),
                "classes": detector.model_info.get("classes", ["Trident", "Donut", "Pickers", "Bahia"]),
                "database": "Connected",
                "camera": "Available",
                "timestamp": datetime.now().isoformat()
            }
            log_request("GET", path, 200, (time.perf_counter() - t0) * 1000)
            return self._send_json(resp)

        # 2. Dashboard Stats
        elif path == '/api/stats':
            stats = database.get_dashboard_stats()
            log_request("GET", path, 200, (time.perf_counter() - t0) * 1000)
            return self._send_json(stats)

        # 3. Real Analytics
        elif path == '/api/analytics':
            res = database.get_real_analytics()
            log_request("GET", path, 200, (time.perf_counter() - t0) * 1000)
            return self._send_json(res)

        # 4. Detection History
        elif path == '/api/detections':
            limit = int(query.get('limit', [50])[0])
            offset = int(query.get('offset', [0])[0])
            product = query.get('product', [None])[0]
            source = query.get('source', [None])[0]
            min_conf = float(query.get('min_conf', [0.0])[0])
            search = query.get('search', [None])[0]
            date_from = query.get('date_from', [None])[0]
            date_to = query.get('date_to', [None])[0]

            res = database.get_detections(limit, offset, product, source, min_conf, search, date_from, date_to)
            log_request("GET", path, 200, (time.perf_counter() - t0) * 1000)
            return self._send_json(res)

        # 5. Database Full Export
        elif path == '/api/database/export':
            all_dets = database.export_all_detections()
            log_request("GET", path, 200, (time.perf_counter() - t0) * 1000)
            return self._send_json({"exported_at": datetime.now().isoformat(), "total": len(all_dets), "detections": all_dets})

        # 6. System Settings GET
        elif path == '/api/settings':
            settings = database.get_settings()
            log_request("GET", path, 200, (time.perf_counter() - t0) * 1000)
            return self._send_json(settings)

        else:
            log_request("GET", path, 404, (time.perf_counter() - t0) * 1000)
            return self._send_json({"error": f"Endpoint GET {path} not found"}, 404)

    def do_POST(self):
        t0 = time.perf_counter()
        parsed = urllib.parse.urlparse(self.path)
        path = parsed.path

        # Read JSON body
        content_length = int(self.headers.get('Content-Length', 0))
        post_data = self.rfile.read(content_length) if content_length > 0 else b'{}'
        try:
            payload = json.loads(post_data.decode('utf-8'))
        except Exception:
            payload = {}

        # 1. Product Detection Endpoint
        if path == '/api/detect':
            image_data = payload.get('image')
            source = payload.get('source', 'Live Camera')
            conf_thresh = max(0.70, float(payload.get('confidence_threshold', 0.70)))
            iou_thresh = float(payload.get('iou_threshold', 0.45))
            max_det = int(payload.get('max_detections', 10))
            min_size = float(payload.get('min_detection_size', 20))
            save_to_history = payload.get('save_to_history', True)
            save_detection_images = payload.get('save_detection_images', False)

            if not image_data:
                log_request("POST", path, 400, (time.perf_counter() - t0) * 1000)
                return self._send_json({"error": "No image payload provided"}, 400)

            try:
                result = detector.detect_image(image_data, conf_thresh, iou_thresh, max_det, min_size)
                filtered_dets = [d for d in result.get("detections", []) if float(d.get("confidence", 0.0)) >= 0.70][:max_det]
                result["detections"] = filtered_dets
                result["total_objects"] = len(filtered_dets)

                saved_ids = []
                if save_to_history and filtered_dets:
                    for det in filtered_dets:
                        img_path = f"assets/products/{det['class'].lower()}.jpeg" if save_detection_images else None
                        det_id = database.add_detection(
                            product_name=det["class"],
                            class_id=det["class_id"],
                            confidence=det["confidence"],
                            bbox=det["bbox"],
                            source=source,
                            image_path=img_path,
                            model_name=result.get("model", "Ultralytics-YOLOv8-FinalDetector")
                        )
                        saved_ids.append(det_id)
                
                result["saved_detection_ids"] = saved_ids
                log_request("POST", path, 200, (time.perf_counter() - t0) * 1000)
                return self._send_json(result)
            except Exception as e:
                log_request("POST", path, 500, (time.perf_counter() - t0) * 1000)
                return self._send_json({"error": f"Inference failed: {str(e)}"}, 500)

        # 2. CSV Import Endpoint
        elif path == '/api/detections/import':
            items = payload.get('items', [])
            imported_count = 0
            for item in items:
                prod_name = item.get('product_name') or item.get('Product') or 'Trident'
                class_id = 0
                if str(prod_name).strip().lower() == 'donut': class_id = 1
                elif str(prod_name).strip().lower() == 'pickers': class_id = 2
                elif str(prod_name).strip().lower() == 'bahia': class_id = 3
                
                conf_val = item.get('confidence') or item.get('Confidence') or 0.85
                if isinstance(conf_val, str):
                    conf_val = float(conf_val.replace('%', ''))
                    if conf_val > 1.0: conf_val = conf_val / 100.0
                
                source = item.get('source') or item.get('Source') or 'Imported CSV'
                created_at = item.get('created_at') or (str(item.get('Date', '')).strip() + ' ' + str(item.get('Time', '')).strip()).strip() or None
                
                database.add_detection(
                    product_name=str(prod_name).strip(),
                    class_id=class_id,
                    confidence=float(conf_val),
                    bbox=[0.2, 0.2, 0.8, 0.8],
                    source=source,
                    image_path=None,
                    created_at=created_at
                )
                imported_count += 1

            log_request("POST", path, 200, (time.perf_counter() - t0) * 1000)
            return self._send_json({"status": "success", "imported": imported_count})

        # 3. Settings Update Endpoint
        elif path == '/api/settings':
            for k, v in payload.items():
                database.update_setting(k, v)
            log_request("POST", path, 200, (time.perf_counter() - t0) * 1000)
            return self._send_json({"status": "updated", "settings": database.get_settings()})

        else:
            log_request("POST", path, 404, (time.perf_counter() - t0) * 1000)
            return self._send_json({"error": f"Endpoint POST {path} not found"}, 404)

    def do_DELETE(self):
        t0 = time.perf_counter()
        parsed = urllib.parse.urlparse(self.path)
        path = parsed.path

        # Clear All Detection History
        if path == '/api/detections/clear':
            database.clear_all_detections()
            log_request("DELETE", path, 200, (time.perf_counter() - t0) * 1000)
            return self._send_json({"status": "cleared", "total_remaining": 0})

        # Delete Single Detection
        elif path.startswith('/api/detections/'):
            det_id = int(path.split('/')[-1])
            success = database.delete_detection(det_id)
            log_request("DELETE", path, 200 if success else 404, (time.perf_counter() - t0) * 1000)
            return self._send_json({"status": "deleted" if success else "not_found"})

def run_server():
    database.init_db()
    server_address = ('', PORT)
    httpd = HTTPServer(server_address, VisionaryAPIHandler)
    print(f"==================================================================")
    print(f" VisionaryAI REST API Server")
    print(f" Listening on http://127.0.0.1:{PORT}")
    print(f" Connected YOLO Model: C:\\yolo\\best.pt (4 Classes: Trident, Donut, Pickers, Bahia)")
    print(f"==================================================================")
    httpd.serve_forever()

if __name__ == '__main__':
    run_server()
