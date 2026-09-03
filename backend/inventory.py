"""
VisionaryAI Inventory / Stock Management

Stock is decremented in exactly one place: decrement_stock_for_exit(), called
from backend/tracking.py at the moment a tracked physical product's EXIT
EVENT is confirmed (never on a per-frame detection, never from the
frontend). The decrement is atomic (floored at 0, never negative) and
idempotent per detection_id — a duplicate call for the same already-saved
detection is a safe no-op, enforced by a UNIQUE constraint on
inventory_transactions.detection_id, not just an in-memory check.
"""

import sqlite3

import database

VALID_PRODUCTS = ("Trident", "Donut", "Pickers", "Bahia")


def _log(msg):
    print(f"[INVENTORY] {msg}")


def get_inventory():
    """Real current state of every product's stock, from the database."""
    conn = database.get_db()
    try:
        cursor = conn.cursor()
        cursor.execute('''
            SELECT product_name, stock_quantity, initial_stock, updated_at
            FROM inventory ORDER BY product_name
        ''')
        return [dict(row) for row in cursor.fetchall()]
    finally:
        conn.close()


def get_transactions(product_name=None, limit=50):
    conn = database.get_db()
    try:
        cursor = conn.cursor()
        if product_name:
            cursor.execute('''
                SELECT * FROM inventory_transactions
                WHERE product_name = ? ORDER BY id DESC LIMIT ?
            ''', (product_name, limit))
        else:
            cursor.execute('''
                SELECT * FROM inventory_transactions ORDER BY id DESC LIMIT ?
            ''', (limit,))
        return [dict(row) for row in cursor.fetchall()]
    finally:
        conn.close()


def decrement_stock_for_exit(product_name, detection_id):
    """
    Atomically decrements stock by exactly 1 for a confirmed tracking EXIT
    EVENT, floored at 0 (never negative), and idempotent per detection_id.

    Returns a dict describing what happened:
      {"decremented": True,  "stock_before": N, "stock_after": N-1}
      {"decremented": False, "reason": "duplicate_exit_event"}
      {"decremented": False, "reason": "out_of_stock", "stock": 0}
      {"decremented": False, "reason": "unknown_product"}
    """
    if product_name not in VALID_PRODUCTS:
        _log(f"decrement skipped: unknown product '{product_name}'")
        return {"decremented": False, "reason": "unknown_product"}

    conn = database.get_db()
    try:
        cursor = conn.cursor()
        cursor.execute("BEGIN IMMEDIATE")

        # Idempotency: a real UNIQUE constraint on detection_id backs this,
        # not just this check — see the INSERT below, which is what actually
        # prevents a race from double-decrementing.
        cursor.execute(
            "SELECT id FROM inventory_transactions WHERE detection_id = ?",
            (detection_id,)
        )
        if cursor.fetchone() is not None:
            conn.rollback()
            _log(f"decrement skipped: duplicate exit event for detection_id={detection_id}")
            return {"decremented": False, "reason": "duplicate_exit_event"}

        cursor.execute(
            "SELECT stock_quantity FROM inventory WHERE product_name = ?",
            (product_name,)
        )
        row = cursor.fetchone()
        if row is None:
            conn.rollback()
            _log(f"decrement skipped: no inventory row for '{product_name}'")
            return {"decremented": False, "reason": "unknown_product"}

        stock_before = row["stock_quantity"]

        cursor.execute(
            "UPDATE inventory SET stock_quantity = stock_quantity - 1, "
            "updated_at = CURRENT_TIMESTAMP "
            "WHERE product_name = ? AND stock_quantity > 0",
            (product_name,)
        )

        if cursor.rowcount == 0:
            conn.commit()
            _log(f"'{product_name}' already at 0 — stock floor held, no decrement")
            return {"decremented": False, "reason": "out_of_stock", "stock": 0}

        stock_after = stock_before - 1

        try:
            cursor.execute(
                "INSERT INTO inventory_transactions "
                "(product_name, event_type, quantity_change, stock_before, stock_after, detection_id) "
                "VALUES (?, 'EXIT', -1, ?, ?, ?)",
                (product_name, stock_before, stock_after, detection_id)
            )
        except sqlite3.IntegrityError:
            # Lost a race against another call for the same detection_id
            # between the SELECT check above and here — the UNIQUE constraint
            # is the real guarantee; undo the decrement we just made.
            conn.rollback()
            _log(f"decrement rolled back: concurrent duplicate for detection_id={detection_id}")
            return {"decremented": False, "reason": "duplicate_exit_event"}

        conn.commit()
        _log(f"'{product_name}' {stock_before} -> {stock_after} (detection_id={detection_id})")
        return {"decremented": True, "stock_before": stock_before, "stock_after": stock_after}
    except Exception:
        conn.rollback()
        raise
    finally:
        conn.close()


def set_stock(product_name, stock_quantity):
    """Explicit admin action: restock/set both current AND initial stock to
    the given value (a fresh baseline), never triggered automatically."""
    if product_name not in VALID_PRODUCTS:
        raise ValueError(f"Unknown product: {product_name}")
    if not isinstance(stock_quantity, int) or stock_quantity < 0:
        raise ValueError("stock_quantity must be a non-negative integer")

    conn = database.get_db()
    try:
        cursor = conn.cursor()
        cursor.execute("BEGIN IMMEDIATE")

        cursor.execute(
            "SELECT stock_quantity FROM inventory WHERE product_name = ?",
            (product_name,)
        )
        row = cursor.fetchone()
        stock_before = row["stock_quantity"] if row else 0

        cursor.execute('''
            INSERT INTO inventory (product_name, stock_quantity, initial_stock, updated_at)
            VALUES (?, ?, ?, CURRENT_TIMESTAMP)
            ON CONFLICT(product_name) DO UPDATE SET
                stock_quantity = excluded.stock_quantity,
                initial_stock = excluded.initial_stock,
                updated_at = CURRENT_TIMESTAMP
        ''', (product_name, stock_quantity, stock_quantity))

        cursor.execute(
            "INSERT INTO inventory_transactions "
            "(product_name, event_type, quantity_change, stock_before, stock_after, detection_id) "
            "VALUES (?, 'ADMIN_SET', ?, ?, ?, NULL)",
            (product_name, stock_quantity - stock_before, stock_before, stock_quantity)
        )

        conn.commit()
        _log(f"ADMIN_SET '{product_name}' {stock_before} -> {stock_quantity}")
        return {"product_name": product_name, "stock_quantity": stock_quantity, "initial_stock": stock_quantity}
    except Exception:
        conn.rollback()
        raise
    finally:
        conn.close()
