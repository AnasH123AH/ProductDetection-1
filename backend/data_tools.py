"""
VisionaryAI Data Tools
A thin, parameter-validated tool layer the AI assistant's context builder
uses to fetch REAL application data. Every function here takes typed,
backend-computed parameters only — no arbitrary/AI-generated SQL is ever
executed. Reuses database.py wherever it already covers the need; adds a
few small parameterized queries only where nothing existing covers it
(date-scoped product breakdown / average confidence).
"""

from datetime import datetime

import database

PRODUCT_NAMES = ["Trident", "Donut", "Pickers", "Bahia"]


def _fmt(dt):
    return dt.strftime('%Y-%m-%d %H:%M:%S') if dt else None


def detect_product_in_text(text):
    """Case-insensitive substring match against the 4 configured product names."""
    lower = text.lower()
    for name in PRODUCT_NAMES:
        if name.lower() in lower:
            return name
    return None


def get_detection_count(date_from=None, date_to=None, product=None):
    """Real count of saved detections, optionally scoped to a date range/product.
    Reuses database.get_detections()'s own COUNT query rather than duplicating it."""
    res = database.get_detections(
        limit=1, offset=0, product=product,
        date_from=_fmt(date_from), date_to=_fmt(date_to)
    )
    return res.get('total', 0)


def get_recent_detections(limit=10):
    """Reuses database.get_detections()."""
    return database.get_detections(limit=limit, offset=0).get('items', [])


def get_latest_detection():
    items = get_recent_detections(limit=1)
    return items[0] if items else None


def get_product_breakdown(date_from=None, date_to=None):
    """Per-product count + average confidence within an optional date range.
    Not covered by an existing all-time-only function, so this is a small,
    parameterized, new query (no user/AI text is ever interpolated into it)."""
    conn = database.get_db()
    cursor = conn.cursor()
    query = "SELECT product_name, COUNT(*) as count, AVG(confidence) as avg_confidence FROM detections WHERE 1=1"
    params = []
    if date_from:
        query += " AND created_at >= ?"
        params.append(_fmt(date_from))
    if date_to:
        query += " AND created_at <= ?"
        params.append(_fmt(date_to))
    query += " GROUP BY product_name ORDER BY count DESC"
    cursor.execute(query, params)
    rows = [dict(row) for row in cursor.fetchall()]
    conn.close()
    return rows


def get_top_product(date_from=None, date_to=None):
    breakdown = get_product_breakdown(date_from, date_to)
    return breakdown[0] if breakdown else None


def get_average_confidence(date_from=None, date_to=None, product=None):
    conn = database.get_db()
    cursor = conn.cursor()
    query = "SELECT AVG(confidence) as avg_confidence, COUNT(*) as count FROM detections WHERE 1=1"
    params = []
    if product:
        query += " AND product_name = ?"
        params.append(product)
    if date_from:
        query += " AND created_at >= ?"
        params.append(_fmt(date_from))
    if date_to:
        query += " AND created_at <= ?"
        params.append(_fmt(date_to))
    cursor.execute(query, params)
    row = cursor.fetchone()
    conn.close()
    return {"avg_confidence": row['avg_confidence'], "count": row['count']}


def get_current_settings():
    """Reuses database.get_settings()."""
    return database.get_settings()


def get_dashboard_stats():
    """Reuses database.get_dashboard_stats()."""
    return database.get_dashboard_stats()


def get_system_status(model_info):
    return {
        "model_status": model_info.get("status"),
        "model_name": model_info.get("name"),
        "database": "Connected",
    }
