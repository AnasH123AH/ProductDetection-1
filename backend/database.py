import sqlite3
import os
import hashlib
from datetime import datetime, timedelta
import random

DB_PATH = os.path.join(os.path.dirname(__file__), 'detections.db')

def get_db():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn

def hash_password(password):
    return hashlib.sha256(password.encode('utf-8')).hexdigest()

def init_db():
    conn = get_db()
    cursor = conn.cursor()
    
    # 1. Detections Table
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS detections (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            product_name TEXT NOT NULL,
            class_id INTEGER NOT NULL,
            confidence REAL NOT NULL,
            x1 REAL NOT NULL,
            y1 REAL NOT NULL,
            x2 REAL NOT NULL,
            y2 REAL NOT NULL,
            source TEXT NOT NULL,
            image_path TEXT,
            model_name TEXT DEFAULT 'Ultralytics-YOLOv8-Polytechnique',
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
    ''')
    
    # 2. System Settings Table
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS system_settings (
            key TEXT PRIMARY KEY,
            value TEXT NOT NULL
        )
    ''')

    # Seed realistic historical detections if empty
    cursor.execute('SELECT COUNT(*) FROM detections')
    count = cursor.fetchone()[0]
    if count == 0:
        seed_data(cursor)

    # Default live detection settings
    defaults = {
        "confidence_threshold": "0.70",
        "iou_threshold": "0.45",
        "max_detections": "10",
        "min_detection_size": "20",
        "detection_stability": "ON",
        "required_stable_frames": "3",
        "duplicate_prevention": "ON",
        "detection_cooldown": "1.0",
        "save_detection_history": "ON",
        "save_detection_images": "OFF",
        "display_bounding_boxes": "ON",
        "display_confidence_score": "ON",
        "display_product_name": "ON",
        "fps_counter": "ON",
        "camera_source": "Logitech C270 HD Webcam",
        "resolution": "1280x720",
        "frame_rate": "30",
        "camera_orientation": "Normal",
        "mirror_camera": "OFF",
        "auto_exposure": "ON",
        "auto_focus": "ON"
    }

    for key, value in defaults.items():
        cursor.execute('''
            INSERT OR IGNORE INTO system_settings (key, value) VALUES (?, ?)
        ''', (key, value))

    conn.commit()
    conn.close()

def seed_data(cursor):
    products = [
        {"name": "Trident", "id": 0, "img": "assets/products/trident.jpeg", "base_conf": 0.95},
        {"name": "Donut", "id": 1, "img": "assets/products/donut.jpeg", "base_conf": 0.90},
        {"name": "Pickers", "id": 2, "img": "assets/products/pickers.jpeg", "base_conf": 0.92},
        {"name": "Bahia", "id": 3, "img": "assets/products/bahia.jpeg", "base_conf": 0.94}
    ]
    
    now = datetime.now()
    for i in range(120):
        prod = random.choice(products)
        days_ago = random.randint(0, 14)
        hours_ago = random.randint(0, 23)
        mins_ago = random.randint(0, 59)
        secs_ago = random.randint(0, 59)
        det_time = now - timedelta(days=days_ago, hours=hours_ago, minutes=mins_ago, seconds=secs_ago)
        
        conf = round(min(0.994, max(0.72, random.gauss(prod["base_conf"], 0.04))), 3)
        source = "Live Camera"
        
        x1 = round(random.uniform(0.15, 0.35), 3)
        y1 = round(random.uniform(0.15, 0.35), 3)
        x2 = round(x1 + random.uniform(0.30, 0.50), 3)
        y2 = round(y1 + random.uniform(0.30, 0.50), 3)
        
        cursor.execute('''
            INSERT INTO detections (product_name, class_id, confidence, x1, y1, x2, y2, source, image_path, model_name, created_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'Ultralytics-YOLOv8-FinalDetector', ?)
        ''', (
            prod["name"], prod["id"], conf, x1, y1, x2, y2, source, None, det_time.strftime('%Y-%m-%d %H:%M:%S')
        ))

def add_detection(product_name, class_id, confidence, bbox, source="Live Camera", image_path=None, model_name="Ultralytics-YOLOv8-FinalDetector", created_at=None):
    conn = get_db()
    cursor = conn.cursor()
    x1, y1, x2, y2 = bbox if bbox and len(bbox) == 4 else (0.2, 0.2, 0.8, 0.8)
    if created_at and len(str(created_at).strip()) >= 8:
        cursor.execute('''
            INSERT INTO detections (product_name, class_id, confidence, x1, y1, x2, y2, source, image_path, model_name, created_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ''', (product_name, class_id, round(confidence, 3), x1, y1, x2, y2, source, image_path, model_name, str(created_at).strip()))
    else:
        cursor.execute('''
            INSERT INTO detections (product_name, class_id, confidence, x1, y1, x2, y2, source, image_path, model_name, created_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
        ''', (product_name, class_id, round(confidence, 3), x1, y1, x2, y2, source, image_path, model_name))
    det_id = cursor.lastrowid
    conn.commit()
    conn.close()
    return det_id

def delete_detection(detection_id):
    conn = get_db()
    cursor = conn.cursor()
    cursor.execute("DELETE FROM detections WHERE id = ?", (detection_id,))
    deleted = cursor.rowcount > 0
    conn.commit()
    conn.close()
    return deleted

def clear_all_detections():
    conn = get_db()
    cursor = conn.cursor()
    cursor.execute("DELETE FROM detections")
    conn.commit()
    conn.close()
    return True

def get_detections(limit=50, offset=0, product=None, source=None, min_conf=0.0, search=None, date_from=None, date_to=None):
    conn = get_db()
    cursor = conn.cursor()
    
    query = "SELECT * FROM detections WHERE 1=1"
    count_query = "SELECT COUNT(*) FROM detections WHERE 1=1"
    params = []
    
    if product and product != "All":
        query += " AND product_name = ?"
        count_query += " AND product_name = ?"
        params.append(product)
        
    if source and source != "All":
        query += " AND source = ?"
        count_query += " AND source = ?"
        params.append(source)
        
    if min_conf > 0.0:
        query += " AND confidence >= ?"
        count_query += " AND confidence >= ?"
        params.append(min_conf)
        
    if search:
        query += " AND (product_name LIKE ? OR source LIKE ?)"
        count_query += " AND (product_name LIKE ? OR source LIKE ?)"
        term = f"%{search}%"
        params.extend([term, term])
        
    if date_from:
        query += " AND created_at >= ?"
        count_query += " AND created_at >= ?"
        params.append(date_from)
        
    if date_to:
        query += " AND created_at <= ?"
        count_query += " AND created_at <= ?"
        params.append(date_to)

    cursor.execute(count_query, params)
    total = cursor.fetchone()[0]

    query += " ORDER BY id DESC LIMIT ? OFFSET ?"
    params.extend([limit, offset])

    cursor.execute(query, params)
    rows = [dict(row) for row in cursor.fetchall()]
    conn.close()

    return {
        "total": total,
        "limit": limit,
        "offset": offset,
        "items": rows
    }

def get_dashboard_stats():
    conn = get_db()
    cursor = conn.cursor()

    cursor.execute("SELECT COUNT(*) FROM detections")
    total_detections = cursor.fetchone()[0]

    today_str = datetime.now().strftime("%Y-%m-%d")
    cursor.execute("SELECT COUNT(*) FROM detections WHERE created_at LIKE ?", (f"{today_str}%",))
    today_detections = cursor.fetchone()[0]

    week_ago = (datetime.now() - timedelta(days=7)).strftime("%Y-%m-%d")
    cursor.execute("SELECT COUNT(*) FROM detections WHERE created_at >= ?", (week_ago,))
    week_detections = cursor.fetchone()[0]

    cursor.execute("SELECT AVG(confidence) FROM detections")
    avg_conf_row = cursor.fetchone()
    avg_confidence = round((avg_conf_row[0] or 0.0) * 100, 1)

    cursor.execute("""
        SELECT product_name, COUNT(*) as count 
        FROM detections 
        GROUP BY product_name 
        ORDER BY count DESC 
        LIMIT 1
    """)
    top_row = cursor.fetchone()
    top_sku = top_row["product_name"] if top_row else "None"

    cursor.execute("""
        SELECT product_name, COUNT(*) as count, AVG(confidence) as avg_conf, MAX(created_at) as last_seen
        FROM detections
        GROUP BY product_name
    """)
    by_product = [dict(row) for row in cursor.fetchall()]

    conn.close()

    return {
        "total_detections": total_detections,
        "today_detections": today_detections,
        "week_detections": week_detections,
        "avg_confidence": avg_confidence,
        "top_sku": top_sku,
        "by_product": by_product
    }

def get_real_analytics():
    conn = get_db()
    cursor = conn.cursor()

    cursor.execute("SELECT COUNT(*) FROM detections")
    total = cursor.fetchone()[0]

    if total == 0:
        conn.close()
        return {
            "has_data": False,
            "message": "No detection data available yet"
        }

    cursor.execute("""
        SELECT product_name, COUNT(*) as count, AVG(confidence) as avg_conf
        FROM detections
        GROUP BY product_name
        ORDER BY count DESC
    """)
    by_product = [dict(row) for row in cursor.fetchall()]

    cursor.execute("""
        SELECT strftime('%Y-%m-%d', created_at) as date, COUNT(*) as count
        FROM detections
        GROUP BY strftime('%Y-%m-%d', created_at)
        ORDER BY date ASC
        LIMIT 30
    """)
    over_time = [dict(row) for row in cursor.fetchall()]

    cursor.execute("""
        SELECT strftime('%H', created_at) as hour, COUNT(*) as count
        FROM detections
        GROUP BY strftime('%H', created_at)
        ORDER BY hour ASC
    """)
    by_hour = [dict(row) for row in cursor.fetchall()]

    conn.close()

    return {
        "has_data": True,
        "total": total,
        "by_product": by_product,
        "over_time": over_time,
        "by_hour": by_hour
    }

# ==========================================
# SETTINGS FUNCTIONS
# ==========================================
def get_settings():
    conn = get_db()
    cursor = conn.cursor()
    cursor.execute("SELECT key, value FROM system_settings")
    settings = {row['key']: row['value'] for row in cursor.fetchall()}
    conn.close()
    return settings

def update_setting(key, value):
    conn = get_db()
    cursor = conn.cursor()
    cursor.execute('''
        INSERT INTO system_settings (key, value) VALUES (?, ?)
        ON CONFLICT(key) DO UPDATE SET value=excluded.value
    ''', (key, str(value)))
    conn.commit()
    conn.close()

def export_all_detections():
    conn = get_db()
    cursor = conn.cursor()
    cursor.execute("SELECT * FROM detections ORDER BY id ASC")
    rows = [dict(row) for row in cursor.fetchall()]
    conn.close()
    return rows

def reseed_database():
    conn = get_db()
    cursor = conn.cursor()
    cursor.execute("DELETE FROM detections")
    seed_data(cursor)
    conn.commit()
    
    cursor.execute("SELECT COUNT(*) FROM detections")
    count = cursor.fetchone()[0]
    conn.close()
    return {"status": "reseeded", "total_records": count}


    # 4. Audit Log Table
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS audit_logs (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            action TEXT NOT NULL,
            user_email TEXT NOT NULL,
            details TEXT,
            ip_address TEXT DEFAULT '127.0.0.1',
            status TEXT DEFAULT 'Success',
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
    ''')

    # 5. Application Products Table
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS products (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            class_id INTEGER UNIQUE NOT NULL,
            name TEXT NOT NULL,
            sku TEXT UNIQUE NOT NULL,
            category TEXT NOT NULL,
            status TEXT NOT NULL DEFAULT 'active',
            image_path TEXT,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
    ''')

    # Seed Default Admin & Normal Users if users table is empty
    cursor.execute('SELECT COUNT(*) FROM users')
    user_count = cursor.fetchone()[0]
    if user_count == 0:
        cursor.execute('''
            INSERT INTO users (name, email, password_hash, role, status, organization, created_at)
            VALUES (?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
        ''', ('Anas Hamma', 'anas.hamma@e-polytechnique.ma', hash_password('Anas2004'), 'admin', 'active', 'Polytechnique Vision Lab'))
        
        cursor.execute('''
            INSERT INTO users (name, email, password_hash, role, status, organization, created_at)
            VALUES (?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
        ''', ('Standard Operator', 'user@polytechnique.ma', hash_password('User2004'), 'user', 'active', 'Polytechnique Vision Lab'))

    # Seed Default Products if empty
    cursor.execute('SELECT COUNT(*) FROM products')
    prod_count = cursor.fetchone()[0]
    if prod_count == 0:
        default_prods = [
            (0, "Trident", "TRID-001", "Chewing Gum", "assets/products/trident.jpeg"),
            (1, "Donut", "DONT-002", "Bakery & Snack", "assets/products/donut.jpeg"),
            (2, "Pickers", "PICK-003", "Crisps & Chips", "assets/products/pickers.jpeg"),
            (3, "Bahia", "BAHI-004", "Mineral Beverage", "assets/products/bahia.jpeg")
        ]
        for p in default_prods:
            cursor.execute('''
                INSERT INTO products (class_id, name, sku, category, status, image_path, created_at)
                VALUES (?, ?, ?, ?, 'active', ?, CURRENT_TIMESTAMP)
            ''', p)

    # Seed initial audit log
    cursor.execute('SELECT COUNT(*) FROM audit_logs')
    audit_count = cursor.fetchone()[0]
    if audit_count == 0:
        cursor.execute('''
            INSERT INTO audit_logs (action, user_email, details, ip_address, status)
            VALUES ('System Initialization', 'anas.hamma@e-polytechnique.ma', 'VisionaryAI Production Engine Started', '127.0.0.1', 'Success')
        ''')

    # Seed realistic historical detections if empty
    cursor.execute('SELECT COUNT(*) FROM detections')
    count = cursor.fetchone()[0]
    if count == 0:
        seed_data(cursor)

    # Default live detection settings
    defaults = {
        "confidence_threshold": "0.70",
        "iou_threshold": "0.45",
        "max_detections": "10",
        "min_detection_size": "20",
        "detection_stability": "ON",
        "required_stable_frames": "3",
        "duplicate_prevention": "ON",
        "detection_cooldown": "1.0",
        "save_detection_history": "ON",
        "save_detection_images": "OFF",
        "display_bounding_boxes": "ON",
        "display_confidence_score": "ON",
        "display_product_name": "ON",
        "fps_counter": "ON",
        "camera_source": "Logitech C270 HD Webcam",
        "resolution": "1280x720",
        "frame_rate": "30",
        "camera_orientation": "Normal",
        "mirror_camera": "OFF",
        "auto_exposure": "ON",
        "auto_focus": "ON"
    }

    for key, value in defaults.items():
        cursor.execute('''
            INSERT OR IGNORE INTO system_settings (key, value) VALUES (?, ?)
        ''', (key, value))

    conn.commit()
    conn.close()

def seed_data(cursor):
    products = [
        {"name": "Trident", "id": 0, "img": "assets/products/trident.jpeg", "base_conf": 0.95},
        {"name": "Donut", "id": 1, "img": "assets/products/donut.jpeg", "base_conf": 0.90},
        {"name": "Pickers", "id": 2, "img": "assets/products/pickers.jpeg", "base_conf": 0.92},
        {"name": "Bahia", "id": 3, "img": "assets/products/bahia.jpeg", "base_conf": 0.94}
    ]
    
    now = datetime.now()
    for i in range(120):
        prod = random.choice(products)
        days_ago = random.randint(0, 14)
        hours_ago = random.randint(0, 23)
        mins_ago = random.randint(0, 59)
        secs_ago = random.randint(0, 59)
        det_time = now - timedelta(days=days_ago, hours=hours_ago, minutes=mins_ago, seconds=secs_ago)
        
        conf = round(min(0.994, max(0.72, random.gauss(prod["base_conf"], 0.04))), 3)
        source = "Live Camera"
        
        x1 = round(random.uniform(0.15, 0.35), 3)
        y1 = round(random.uniform(0.15, 0.35), 3)
        x2 = round(x1 + random.uniform(0.30, 0.50), 3)
        y2 = round(y1 + random.uniform(0.30, 0.50), 3)
        
        cursor.execute('''
            INSERT INTO detections (product_name, class_id, confidence, x1, y1, x2, y2, source, image_path, model_name, created_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'Ultralytics-YOLOv8-FinalDetector', ?)
        ''', (
            prod["name"], prod["id"], conf, x1, y1, x2, y2, source, None, det_time.strftime('%Y-%m-%d %H:%M:%S')
        ))

def add_detection(product_name, class_id, confidence, bbox, source="Live Camera", image_path=None, model_name="Ultralytics-YOLOv8-FinalDetector", created_at=None):
    conn = get_db()
    cursor = conn.cursor()
    x1, y1, x2, y2 = bbox if bbox and len(bbox) == 4 else (0.2, 0.2, 0.8, 0.8)
    if created_at and len(str(created_at).strip()) >= 8:
        cursor.execute('''
            INSERT INTO detections (product_name, class_id, confidence, x1, y1, x2, y2, source, image_path, model_name, created_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ''', (product_name, class_id, round(confidence, 3), x1, y1, x2, y2, source, image_path, model_name, str(created_at).strip()))
    else:
        cursor.execute('''
            INSERT INTO detections (product_name, class_id, confidence, x1, y1, x2, y2, source, image_path, model_name, created_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
        ''', (product_name, class_id, round(confidence, 3), x1, y1, x2, y2, source, image_path, model_name))
    det_id = cursor.lastrowid
    conn.commit()
    conn.close()
    return det_id

def delete_detection(detection_id):
    conn = get_db()
    cursor = conn.cursor()
    cursor.execute("DELETE FROM detections WHERE id = ?", (detection_id,))
    deleted = cursor.rowcount > 0
    conn.commit()
    conn.close()
    return deleted

def clear_all_detections():
    conn = get_db()
    cursor = conn.cursor()
    cursor.execute("DELETE FROM detections")
    conn.commit()
    conn.close()
    return True

def get_detections(limit=50, offset=0, product=None, source=None, min_conf=0.0, search=None, date_from=None, date_to=None):
    conn = get_db()
    cursor = conn.cursor()
    
    query = "SELECT * FROM detections WHERE 1=1"
    count_query = "SELECT COUNT(*) FROM detections WHERE 1=1"
    params = []
    
    if product and product != "All":
        query += " AND product_name = ?"
        count_query += " AND product_name = ?"
        params.append(product)
        
    if source and source != "All":
        query += " AND source = ?"
        count_query += " AND source = ?"
        params.append(source)
        
    if min_conf > 0.0:
        query += " AND confidence >= ?"
        count_query += " AND confidence >= ?"
        params.append(min_conf)
        
    if search:
        query += " AND (product_name LIKE ? OR source LIKE ?)"
        count_query += " AND (product_name LIKE ? OR source LIKE ?)"
        term = f"%{search}%"
        params.extend([term, term])
        
    if date_from:
        query += " AND created_at >= ?"
        count_query += " AND created_at >= ?"
        params.append(date_from)
        
    if date_to:
        query += " AND created_at <= ?"
        count_query += " AND created_at <= ?"
        params.append(date_to)

    cursor.execute(count_query, params)
    total = cursor.fetchone()[0]

    query += " ORDER BY id DESC LIMIT ? OFFSET ?"
    params.extend([limit, offset])

    cursor.execute(query, params)
    rows = [dict(row) for row in cursor.fetchall()]
    conn.close()

    return {
        "total": total,
        "limit": limit,
        "offset": offset,
        "items": rows
    }

def get_dashboard_stats():
    conn = get_db()
    cursor = conn.cursor()

    cursor.execute("SELECT COUNT(*) FROM detections")
    total_detections = cursor.fetchone()[0]

    today_str = datetime.now().strftime("%Y-%m-%d")
    cursor.execute("SELECT COUNT(*) FROM detections WHERE created_at LIKE ?", (f"{today_str}%",))
    today_detections = cursor.fetchone()[0]

    week_ago = (datetime.now() - timedelta(days=7)).strftime("%Y-%m-%d")
    cursor.execute("SELECT COUNT(*) FROM detections WHERE created_at >= ?", (week_ago,))
    week_detections = cursor.fetchone()[0]

    cursor.execute("SELECT AVG(confidence) FROM detections")
    avg_conf_row = cursor.fetchone()
    avg_confidence = round((avg_conf_row[0] or 0.0) * 100, 1)

    cursor.execute("""
        SELECT product_name, COUNT(*) as count 
        FROM detections 
        GROUP BY product_name 
        ORDER BY count DESC 
        LIMIT 1
    """)
    top_row = cursor.fetchone()
    top_sku = top_row["product_name"] if top_row else "None"

    cursor.execute("""
        SELECT product_name, COUNT(*) as count, AVG(confidence) as avg_conf, MAX(created_at) as last_seen
        FROM detections
        GROUP BY product_name
    """)
    by_product = [dict(row) for row in cursor.fetchall()]

    conn.close()

    return {
        "total_detections": total_detections,
        "today_detections": today_detections,
        "week_detections": week_detections,
        "avg_confidence": avg_confidence,
        "top_sku": top_sku,
        "by_product": by_product
    }

def get_real_analytics():
    conn = get_db()
    cursor = conn.cursor()

    cursor.execute("SELECT COUNT(*) FROM detections")
    total = cursor.fetchone()[0]

    if total == 0:
        conn.close()
        return {
            "has_data": False,
            "message": "No detection data available yet"
        }

    cursor.execute("""
        SELECT product_name, COUNT(*) as count, AVG(confidence) as avg_conf
        FROM detections
        GROUP BY product_name
        ORDER BY count DESC
    """)
    by_product = [dict(row) for row in cursor.fetchall()]

    cursor.execute("""
        SELECT strftime('%Y-%m-%d', created_at) as date, COUNT(*) as count
        FROM detections
        GROUP BY strftime('%Y-%m-%d', created_at)
        ORDER BY date ASC
        LIMIT 30
    """)
    over_time = [dict(row) for row in cursor.fetchall()]

    cursor.execute("""
        SELECT strftime('%H', created_at) as hour, COUNT(*) as count
        FROM detections
        GROUP BY strftime('%H', created_at)
        ORDER BY hour ASC
    """)
    by_hour = [dict(row) for row in cursor.fetchall()]

    conn.close()

    return {
        "has_data": True,
        "total": total,
        "by_product": by_product,
        "over_time": over_time,
        "by_hour": by_hour
    }

# ==========================================
# USER MANAGEMENT FUNCTIONS
# ==========================================
def authenticate_user(email, password):
    conn = get_db()
    cursor = conn.cursor()
    pwd_hash = hash_password(password)
    cursor.execute("SELECT * FROM users WHERE email = ? AND password_hash = ? AND status = 'active'", (email, pwd_hash))
    user = cursor.fetchone()
    if user:
        user_dict = dict(user)
        user_dict.pop('password_hash', None)
        # Update last login
        cursor.execute("UPDATE users SET last_login = CURRENT_TIMESTAMP WHERE id = ?", (user_dict['id'],))
        conn.commit()
        conn.close()
        return user_dict
    conn.close()
    return None

def get_users():
    conn = get_db()
    cursor = conn.cursor()
    cursor.execute("SELECT id, name, email, role, status, organization, last_login, created_at FROM users ORDER BY id ASC")
    users = [dict(row) for row in cursor.fetchall()]
    conn.close()
    return users

def add_user(name, email, password, role="user", status="active", organization="Polytechnique Vision Lab"):
    conn = get_db()
    cursor = conn.cursor()
    pwd_hash = hash_password(password)
    try:
        cursor.execute('''
            INSERT INTO users (name, email, password_hash, role, status, organization, created_at)
            VALUES (?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
        ''', (name, email, pwd_hash, role, status, organization))
        uid = cursor.lastrowid
        conn.commit()
        conn.close()
        return uid
    except sqlite3.IntegrityError:
        conn.close()
        return None

def update_user(user_id, name=None, email=None, role=None, status=None, password=None):
    conn = get_db()
    cursor = conn.cursor()
    
    fields = []
    params = []
    if name:
        fields.append("name = ?")
        params.append(name)
    if email:
        fields.append("email = ?")
        params.append(email)
    if role:
        fields.append("role = ?")
        params.append(role)
    if status:
        fields.append("status = ?")
        params.append(status)
    if password:
        fields.append("password_hash = ?")
        params.append(hash_password(password))

    if not fields:
        conn.close()
        return False

    params.append(user_id)
    sql = f"UPDATE users SET {', '.join(fields)} WHERE id = ?"
    cursor.execute(sql, params)
    success = cursor.rowcount > 0
    conn.commit()
    conn.close()
    return success

def delete_user(user_id):
    conn = get_db()
    cursor = conn.cursor()
    cursor.execute("DELETE FROM users WHERE id = ?", (user_id,))
    success = cursor.rowcount > 0
    conn.commit()
    conn.close()
    return success

# ==========================================
# AUDIT LOG FUNCTIONS
# ==========================================
def add_audit_log(action, user_email, details="", ip_address="127.0.0.1", status="Success"):
    conn = get_db()
    cursor = conn.cursor()
    cursor.execute('''
        INSERT INTO audit_logs (action, user_email, details, ip_address, status, created_at)
        VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
    ''', (action, user_email, details, ip_address, status))
    conn.commit()
    conn.close()

def get_audit_logs(limit=50):
    conn = get_db()
    cursor = conn.cursor()
    cursor.execute("SELECT * FROM audit_logs ORDER BY id DESC LIMIT ?", (limit,))
    logs = [dict(row) for row in cursor.fetchall()]
    conn.close()
    return logs

# ==========================================
# PRODUCT MANAGEMENT FUNCTIONS
# ==========================================
def get_products_with_stats():
    conn = get_db()
    cursor = conn.cursor()
    
    cursor.execute("SELECT * FROM products ORDER BY class_id ASC")
    products = [dict(row) for row in cursor.fetchall()]
    
    for p in products:
        c_id = p["class_id"]
        cursor.execute("SELECT COUNT(*), AVG(confidence), MAX(created_at) FROM detections WHERE class_id = ?", (c_id,))
        row = cursor.fetchone()
        p["detection_count"] = row[0] or 0
        p["avg_confidence"] = round((row[1] or 0.0) * 100, 1)
        p["last_detected"] = row[2] or "-"

    conn.close()
    return products

def add_product(name, sku, category, class_id=None):
    conn = get_db()
    cursor = conn.cursor()
    if class_id is None:
        cursor.execute("SELECT MAX(class_id) FROM products")
        max_id = cursor.fetchone()[0]
        class_id = (max_id + 1) if max_id is not None else 0

    img_path = f"assets/products/{name.lower().replace(' ', '')}.jpeg"
    try:
        cursor.execute('''
            INSERT INTO products (class_id, name, sku, category, status, image_path, created_at)
            VALUES (?, ?, ?, ?, 'active', ?, CURRENT_TIMESTAMP)
        ''', (class_id, name, sku, category, img_path))
        pid = cursor.lastrowid
        conn.commit()
        conn.close()
        return pid
    except sqlite3.IntegrityError:
        conn.close()
        return None

def update_product(product_id, name=None, sku=None, category=None, status=None):
    conn = get_db()
    cursor = conn.cursor()
    fields = []
    params = []
    if name:
        fields.append("name = ?")
        params.append(name)
    if sku:
        fields.append("sku = ?")
        params.append(sku)
    if category:
        fields.append("category = ?")
        params.append(category)
    if status:
        fields.append("status = ?")
        params.append(status)

    if not fields:
        conn.close()
        return False

    params.append(product_id)
    sql = f"UPDATE products SET {', '.join(fields)} WHERE id = ?"
    cursor.execute(sql, params)
    success = cursor.rowcount > 0
    conn.commit()
    conn.close()
    return success

def delete_product(product_id):
    conn = get_db()
    cursor = conn.cursor()
    cursor.execute("DELETE FROM products WHERE id = ?", (product_id,))
    success = cursor.rowcount > 0
    conn.commit()
    conn.close()
    return success

# ==========================================
# SETTINGS FUNCTIONS
# ==========================================
def get_settings():
    conn = get_db()
    cursor = conn.cursor()
    cursor.execute("SELECT key, value FROM system_settings")
    settings = {row['key']: row['value'] for row in cursor.fetchall()}
    conn.close()
    return settings

def update_setting(key, value):
    conn = get_db()
    cursor = conn.cursor()
    cursor.execute('''
        INSERT INTO system_settings (key, value) VALUES (?, ?)
        ON CONFLICT(key) DO UPDATE SET value=excluded.value
    ''', (key, str(value)))
    conn.commit()
    conn.close()

def get_system_health():
    conn = get_db()
    cursor = conn.cursor()
    cursor.execute("SELECT COUNT(*) FROM detections")
    det_count = cursor.fetchone()[0]
    cursor.execute("SELECT COUNT(*) FROM users")
    user_count = cursor.fetchone()[0]
    conn.close()
    
    file_size_bytes = os.path.getsize(DB_PATH) if os.path.exists(DB_PATH) else 0
    file_size_kb = round(file_size_bytes / 1024, 2)

    return {
        "database": {"status": "Online", "records": det_count, "users": user_count, "size_kb": file_size_kb},
        "model": {"name": "best.pt", "status": "Loaded", "classes": 4, "device": "CPU / Edge Vector"},
        "api": {"status": "Online", "port": 8000},
        "camera": {"source": "Logitech C270 HD Webcam", "status": "Ready"}
    }

def export_all_detections():
    conn = get_db()
    cursor = conn.cursor()
    cursor.execute("SELECT * FROM detections ORDER BY id ASC")
    rows = [dict(row) for row in cursor.fetchall()]
    conn.close()
    return rows

def reseed_database():
    conn = get_db()
    cursor = conn.cursor()
    cursor.execute("DELETE FROM detections")
    seed_data(cursor)
    conn.commit()
    
    cursor.execute("SELECT COUNT(*) FROM detections")
    count = cursor.fetchone()[0]
    conn.close()
    return {"status": "reseeded", "total_records": count}
