"""
VisionaryAI Inventory & Product Exit Reports

Aggregates REAL data for a selected date range and renders a professional
PDF. No parallel/fake reporting database — this reads the existing tables:

  - Current inventory comes from inventory.get_inventory() (backend/inventory.py),
    the same source GET /api/inventory uses.
  - "Products exited" for the period is COUNTED FROM ROWS in the `detections`
    table, not from raw per-frame model output. backend/tracking.py's EXIT
    branch (see tracking.process_frame()) writes exactly ONE `detections` row
    per physical product exit, however many frames that product was visible
    for — that's what makes Detection History (GET /api/detections) already
    show one row per real exit, not one per frame. Grouping those rows by
    product_name and date range is therefore already "physical exits", with
    no extra bookkeeping needed.
"""

import io
from datetime import datetime, timedelta

import database
import inventory

VALID_PRODUCTS = inventory.VALID_PRODUCTS  # ("Trident", "Donut", "Pickers", "Bahia")

PERIOD_LABELS = {
    "last_3_days": "Last 3 Days",
    "last_7_days": "Last 7 Days",
    "last_30_days": "Last 30 Days",
    "this_month": "This Month",
    "last_month": "Last Month",
    "this_year": "This Year",
    "last_year": "Last Year",
    "custom": "Custom Range",
}

MAX_RANGE_DAYS = 5 * 365          # 5 years — generous, but bounded
MONTHLY_BREAKDOWN_THRESHOLD_DAYS = 62  # beyond ~2 months, aggregate by month


class ReportError(ValueError):
    """A user-correctable input error (bad/missing dates, bad period, etc)."""


def _parse_date(raw, field_name):
    if not raw or not str(raw).strip():
        raise ReportError(f"Missing {field_name} date.")
    try:
        return datetime.strptime(str(raw).strip(), "%Y-%m-%d").date()
    except ValueError:
        raise ReportError(f"Invalid {field_name} date: {raw!r}. Expected YYYY-MM-DD.")


def resolve_period(period, start=None, end=None):
    """Turns a period keyword (+ optional custom start/end) into a concrete,
    validated (start_date, end_date) pair of date objects, inclusive."""
    today = datetime.now().date()

    if period == "custom":
        start_date = _parse_date(start, "start")
        end_date = _parse_date(end, "end")
    elif period == "last_3_days":
        end_date, start_date = today, today - timedelta(days=2)
    elif period == "last_7_days":
        end_date, start_date = today, today - timedelta(days=6)
    elif period == "last_30_days":
        end_date, start_date = today, today - timedelta(days=29)
    elif period == "this_month":
        end_date, start_date = today, today.replace(day=1)
    elif period == "last_month":
        first_of_this_month = today.replace(day=1)
        end_date = first_of_this_month - timedelta(days=1)
        start_date = end_date.replace(day=1)
    elif period == "this_year":
        end_date, start_date = today, today.replace(month=1, day=1)
    elif period == "last_year":
        end_date = today.replace(month=1, day=1) - timedelta(days=1)
        start_date = end_date.replace(month=1, day=1)
    else:
        raise ReportError(
            f"Unknown period: {period!r}. Expected one of "
            f"{sorted(PERIOD_LABELS.keys())}."
        )

    if start_date > end_date:
        raise ReportError("Start date must not be after end date.")
    if start_date > today:
        raise ReportError("Start date is in the future.")
    if (end_date - start_date).days > MAX_RANGE_DAYS:
        raise ReportError(f"Date range too large (maximum {MAX_RANGE_DAYS} days).")

    # A future end date (e.g. a custom range typed past today) is clamped,
    # never used to invent data that can't exist yet.
    if end_date > today:
        end_date = today

    return start_date, end_date


def generate_report_data(period, start=None, end=None):
    """Real, database-backed report payload for the resolved period.
    Raises ReportError on invalid input; never fabricates data."""
    start_date, end_date = resolve_period(period, start, end)
    days_included = (end_date - start_date).days + 1

    date_from = f"{start_date.isoformat()} 00:00:00"
    date_to = f"{end_date.isoformat()} 23:59:59"

    conn = database.get_db()
    try:
        cursor = conn.cursor()

        # One row in `detections` == one confirmed physical EXIT event.
        cursor.execute(
            """
            SELECT product_name, COUNT(*) as exits
            FROM detections
            WHERE created_at >= ? AND created_at <= ?
            GROUP BY product_name
            """,
            (date_from, date_to),
        )
        exits_by_product_raw = {row["product_name"]: row["exits"] for row in cursor.fetchall()}

        aggregate_monthly = days_included > MONTHLY_BREAKDOWN_THRESHOLD_DAYS
        bucket_expr = "strftime('%Y-%m', created_at)" if aggregate_monthly else "strftime('%Y-%m-%d', created_at)"
        cursor.execute(
            f"""
            SELECT {bucket_expr} as bucket, product_name, COUNT(*) as exits
            FROM detections
            WHERE created_at >= ? AND created_at <= ?
            GROUP BY bucket, product_name
            ORDER BY bucket ASC
            """,
            (date_from, date_to),
        )
        breakdown_rows = cursor.fetchall()
    finally:
        conn.close()

    exits_by_product = {p: exits_by_product_raw.get(p, 0) for p in VALID_PRODUCTS}
    total_exits = sum(exits_by_product.values())

    breakdown_map = {}
    for row in breakdown_rows:
        bucket = row["bucket"]
        counts = breakdown_map.setdefault(bucket, {p: 0 for p in VALID_PRODUCTS})
        if row["product_name"] in counts:
            counts[row["product_name"]] += row["exits"]
    breakdown_list = [
        {"bucket": b, **counts, "total": sum(counts.values())}
        for b, counts in sorted(breakdown_map.items())
    ]

    current_inventory = inventory.get_inventory()  # same source as GET /api/inventory
    inv_by_product = {row["product_name"]: row for row in current_inventory}
    total_current_stock = sum(row["stock_quantity"] for row in current_inventory)

    inventory_table = [
        {
            "product_name": p,
            "current_stock": (inv_by_product.get(p) or {}).get("stock_quantity", 0),
            "initial_stock": (inv_by_product.get(p) or {}).get("initial_stock", 0),
            "exited_in_period": exits_by_product[p],
        }
        for p in VALID_PRODUCTS
    ]

    exit_table = [
        {
            "product_name": p,
            "exits": exits_by_product[p],
            "pct": round((exits_by_product[p] / total_exits) * 100, 1) if total_exits > 0 else 0.0,
        }
        for p in VALID_PRODUCTS
    ]

    if total_exits > 0:
        most_exited_product = max(exits_by_product, key=lambda p: exits_by_product[p])
        least_exited_product = min(exits_by_product, key=lambda p: exits_by_product[p])
    else:
        most_exited_product = None
        least_exited_product = None

    return {
        "period": period,
        "period_label": PERIOD_LABELS.get(period, period),
        "start_date": start_date.isoformat(),
        "end_date": end_date.isoformat(),
        "days_included": days_included,
        "generated_at": datetime.now().isoformat(),
        "summary": {
            "total_exited": total_exits,
            "total_current_stock": total_current_stock,
            "most_exited_product": most_exited_product,
            "least_exited_product": least_exited_product,
            "avg_daily_exits": round(total_exits / days_included, 1) if days_included > 0 else 0.0,
        },
        "inventory_table": inventory_table,
        "exit_table": exit_table,
        "breakdown": breakdown_list,
        "breakdown_granularity": "monthly" if aggregate_monthly else "daily",
    }


# ---------------------------------------------------------------------------
# PDF rendering
# ---------------------------------------------------------------------------

BRAND_PRIMARY = "#0284C7"
BRAND_PRIMARY_DARK = "#0369A1"
BRAND_INK = "#0F172A"
BRAND_MUTED = "#64748B"
BRAND_BORDER = "#E2E8F0"
BRAND_SURFACE = "#F8FAFC"


def _fmt_date_long(d):
    dt = datetime.strptime(d, "%Y-%m-%d")
    # Cross-platform day-of-month without leading zero (no %-d on Windows).
    return f"{dt.strftime('%B')} {dt.day}, {dt.year}"


def _fmt_bucket_label(bucket, granularity):
    if granularity == "monthly":
        dt = datetime.strptime(bucket, "%Y-%m")
        return dt.strftime("%B %Y")
    dt = datetime.strptime(bucket, "%Y-%m-%d")
    return f"{dt.strftime('%b')} {dt.day}, {dt.year}"


def render_pdf(data):
    """Renders `data` (from generate_report_data) into PDF bytes."""
    from reportlab.lib import colors
    from reportlab.lib.pagesizes import A4
    from reportlab.lib.units import cm
    from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
    from reportlab.lib.enums import TA_LEFT, TA_CENTER
    from reportlab.platypus import (
        SimpleDocTemplate, Table, TableStyle, Paragraph, Spacer, Frame,
    )
    from reportlab.pdfgen import canvas as pdfcanvas
    from reportlab.graphics.shapes import Drawing
    from reportlab.graphics.charts.barcharts import VerticalBarChart

    buf = io.BytesIO()

    styles = getSampleStyleSheet()
    h_title = ParagraphStyle("VAITitle", parent=styles["Heading1"], fontSize=20, leading=24,
                              textColor=colors.HexColor(BRAND_INK), spaceAfter=2)
    h_sub = ParagraphStyle("VAISub", parent=styles["Normal"], fontSize=11, leading=14,
                            textColor=colors.HexColor(BRAND_MUTED), spaceAfter=0)
    h_section = ParagraphStyle("VAISection", parent=styles["Heading2"], fontSize=13, leading=16,
                                textColor=colors.HexColor(BRAND_INK), spaceBefore=14, spaceAfter=8)
    p_body = ParagraphStyle("VAIBody", parent=styles["Normal"], fontSize=9.5, leading=13,
                             textColor=colors.HexColor(BRAND_INK))
    p_muted = ParagraphStyle("VAIMuted", parent=styles["Normal"], fontSize=9, leading=12,
                              textColor=colors.HexColor(BRAND_MUTED))
    stat_label = ParagraphStyle("VAIStatLabel", parent=styles["Normal"], fontSize=8, leading=10,
                                 textColor=colors.white, alignment=TA_CENTER)
    stat_value = ParagraphStyle("VAIStatValue", parent=styles["Normal"], fontSize=18, leading=22,
                                 textColor=colors.white, alignment=TA_CENTER, fontName="Helvetica-Bold")

    story = []

    # --- Header block (title + period + generated timestamp) -------------
    story.append(Paragraph("VISIONARYAI", h_title))
    story.append(Paragraph("Product Detection &amp; Inventory Report", h_sub))
    story.append(Spacer(1, 10))

    period_text = f"<b>Period:</b> {_fmt_date_long(data['start_date'])} &mdash; {_fmt_date_long(data['end_date'])} ({data['period_label']}, {data['days_included']} day{'s' if data['days_included'] != 1 else ''})"
    generated_dt = datetime.fromisoformat(data["generated_at"])
    generated_text = f"<b>Generated:</b> {generated_dt.strftime('%B')} {generated_dt.day}, {generated_dt.year} {generated_dt.strftime('%H:%M')}"
    story.append(Paragraph(period_text, p_body))
    story.append(Paragraph(generated_text, p_body))
    story.append(Spacer(1, 16))

    # --- Executive summary (4 stat cards) ----------------------------------
    story.append(Paragraph("Executive Summary", h_section))
    summary = data["summary"]
    cards = [
        ("TOTAL PRODUCTS EXITED", str(summary["total_exited"])),
        ("CURRENT TOTAL STOCK", str(summary["total_current_stock"])),
        ("MOST EXITED PRODUCT", summary["most_exited_product"] or "—"),
        ("AVERAGE DAILY EXITS", f"{summary['avg_daily_exits']:g}"),
    ]
    card_table = Table(
        [[Paragraph(lbl, stat_label) for lbl, _ in cards], [Paragraph(val, stat_value) for _, val in cards]],
        colWidths=[4.15 * cm] * 4,
        rowHeights=[18, 30],
    )
    card_table.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, -1), colors.HexColor(BRAND_PRIMARY_DARK)),
        ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
        ("TOPPADDING", (0, 0), (-1, 0), 8),
        ("BOTTOMPADDING", (0, -1), (-1, -1), 10),
        ("LINEAFTER", (0, 0), (-2, -1), 1, colors.white),
        ("BOX", (0, 0), (-1, -1), 0.5, colors.HexColor(BRAND_PRIMARY_DARK)),
    ]))
    story.append(card_table)
    story.append(Spacer(1, 18))

    # --- Current Inventory (NOW) vs Exit Activity (PERIOD) — kept explicit
    story.append(Paragraph("Current Inventory", h_section))
    story.append(Paragraph(
        "Stock currently in the database, as of the moment this report was generated &mdash; "
        "not limited to the selected period.", p_muted))
    story.append(Spacer(1, 6))

    inv_header = ["Product", "Current Stock", "Initial Stock", "Exited During Period"]
    inv_rows = [inv_header]
    for row in data["inventory_table"]:
        inv_rows.append([row["product_name"], str(row["current_stock"]), str(row["initial_stock"]), str(row["exited_in_period"])])
    inv_total_current = sum(r["current_stock"] for r in data["inventory_table"])
    inv_total_initial = sum(r["initial_stock"] for r in data["inventory_table"])
    inv_total_exited = sum(r["exited_in_period"] for r in data["inventory_table"])
    inv_rows.append(["TOTAL", str(inv_total_current), str(inv_total_initial), str(inv_total_exited)])

    inv_table = Table(inv_rows, colWidths=[5 * cm, 4 * cm, 4 * cm, 4.5 * cm], hAlign="LEFT")
    inv_table.setStyle(_table_style(header=True, total_row=len(inv_rows) - 1))
    story.append(inv_table)
    story.append(Spacer(1, 16))

    # --- Exit Activity for the selected period ------------------------------
    story.append(Paragraph(f"Exit Activity — {data['period_label']}", h_section))
    if summary["total_exited"] == 0:
        story.append(Paragraph(
            "No product exit events were recorded during this period.", p_body))
        story.append(Spacer(1, 6))

    exit_header = ["Product", "Exits", "% of Total"]
    exit_rows = [exit_header]
    for row in data["exit_table"]:
        exit_rows.append([row["product_name"], str(row["exits"]), f"{row['pct']:g}%"])
    exit_rows.append(["TOTAL", str(summary["total_exited"]), "100%" if summary["total_exited"] > 0 else "0%"])

    exit_table_flowable = Table(exit_rows, colWidths=[6 * cm, 4 * cm, 4 * cm], hAlign="LEFT")
    exit_table_flowable.setStyle(_table_style(header=True, total_row=len(exit_rows) - 1))
    story.append(exit_table_flowable)
    story.append(Spacer(1, 16))

    # --- Product exits bar chart (only when there is something to show) ----
    if summary["total_exited"] > 0:
        story.append(Paragraph("Exits by Product", h_section))
        chart_values = [row["exits"] for row in data["exit_table"]]
        chart_labels = [row["product_name"] for row in data["exit_table"]]
        drawing = Drawing(420, 160)
        chart = VerticalBarChart()
        chart.x, chart.y = 40, 20
        chart.width, chart.height = 360, 120
        chart.data = [chart_values]
        chart.categoryAxis.categoryNames = chart_labels
        chart.categoryAxis.labels.fontSize = 9
        chart.valueAxis.valueMin = 0
        max_val = max(chart_values) if chart_values else 1
        chart.valueAxis.valueMax = max(1, max_val + max(1, round(max_val * 0.15)))
        chart.valueAxis.labels.fontSize = 8
        chart.bars[0].fillColor = colors.HexColor(BRAND_PRIMARY)
        chart.barWidth = 14
        chart.groupSpacing = 20
        drawing.add(chart)
        story.append(drawing)
        story.append(Spacer(1, 16))

    # --- Daily/Monthly breakdown ---------------------------------------------
    granularity_label = "Monthly" if data["breakdown_granularity"] == "monthly" else "Daily"
    story.append(Paragraph(f"{granularity_label} Breakdown", h_section))
    if not data["breakdown"]:
        story.append(Paragraph("No product exit events were recorded during this period.", p_body))
    else:
        bd_header = ["Date" if granularity_label == "Daily" else "Month"] + list(VALID_PRODUCTS) + ["Total"]
        bd_rows = [bd_header]
        for entry in data["breakdown"]:
            label = _fmt_bucket_label(entry["bucket"], data["breakdown_granularity"])
            bd_rows.append([label] + [str(entry[p]) for p in VALID_PRODUCTS] + [str(entry["total"])])
        bd_table = Table(bd_rows, colWidths=[3.6 * cm] + [2.6 * cm] * 4 + [2.2 * cm], hAlign="LEFT")
        bd_table.setStyle(_table_style(header=True, total_row=None))
        story.append(bd_table)

        # Optional monthly trend line/bar when we're already in monthly mode
        if data["breakdown_granularity"] == "monthly" and len(data["breakdown"]) > 1:
            story.append(Spacer(1, 14))
            story.append(Paragraph("Monthly Exit Trend (Total)", h_section))
            trend_values = [entry["total"] for entry in data["breakdown"]]
            trend_labels = [_fmt_bucket_label(e["bucket"], "monthly") for e in data["breakdown"]]
            drawing2 = Drawing(480, 160)
            chart2 = VerticalBarChart()
            chart2.x, chart2.y = 40, 20
            chart2.width, chart2.height = 420, 120
            chart2.data = [trend_values]
            chart2.categoryAxis.categoryNames = trend_labels
            chart2.categoryAxis.labels.fontSize = 7
            chart2.categoryAxis.labels.angle = 30
            chart2.categoryAxis.labels.dy = -8
            chart2.valueAxis.valueMin = 0
            max_val2 = max(trend_values) if trend_values else 1
            chart2.valueAxis.valueMax = max(1, max_val2 + max(1, round(max_val2 * 0.15)))
            chart2.valueAxis.labels.fontSize = 8
            chart2.bars[0].fillColor = colors.HexColor(BRAND_PRIMARY_DARK)
            chart2.barWidth = 10
            drawing2.add(chart2)
            story.append(drawing2)

    # --- Build with header/footer + page numbers ----------------------------
    class _NumberedCanvas(pdfcanvas.Canvas):
        def __init__(self, *args, **kwargs):
            pdfcanvas.Canvas.__init__(self, *args, **kwargs)
            self._saved_page_states = []

        def showPage(self):
            self._saved_page_states.append(dict(self.__dict__))
            self._startPage()

        def save(self):
            total_pages = len(self._saved_page_states)
            for state in self._saved_page_states:
                self.__dict__.update(state)
                self._draw_footer(total_pages)
                pdfcanvas.Canvas.showPage(self)
            pdfcanvas.Canvas.save(self)

        def _draw_footer(self, total_pages):
            self.saveState()
            self.setStrokeColor(colors.HexColor(BRAND_BORDER))
            self.setLineWidth(0.5)
            self.line(2 * cm, 1.6 * cm, A4[0] - 2 * cm, 1.6 * cm)
            self.setFont("Helvetica", 8)
            self.setFillColor(colors.HexColor(BRAND_MUTED))
            self.drawString(2 * cm, 1.2 * cm, "VisionaryAI — Product Detection & Inventory Report")
            self.drawRightString(A4[0] - 2 * cm, 1.2 * cm, f"Page {self._pageNumber} of {total_pages}")
            self.restoreState()

    doc = SimpleDocTemplate(
        buf, pagesize=A4,
        leftMargin=2 * cm, rightMargin=2 * cm, topMargin=1.8 * cm, bottomMargin=2.2 * cm,
        title="VisionaryAI Inventory & Product Exit Report",
        author="VisionaryAI",
    )
    doc.build(story, canvasmaker=_NumberedCanvas)

    return buf.getvalue()


def _table_style(header=True, total_row=None):
    from reportlab.lib import colors
    from reportlab.platypus import TableStyle

    style = [
        ("FONTSIZE", (0, 0), (-1, -1), 9),
        ("TOPPADDING", (0, 0), (-1, -1), 5),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 5),
        ("GRID", (0, 0), (-1, -1), 0.5, colors.HexColor(BRAND_BORDER)),
        ("ALIGN", (1, 0), (-1, -1), "RIGHT"),
        ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
    ]
    if header:
        style += [
            ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor(BRAND_PRIMARY)),
            ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
            ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
        ]
    if total_row is not None:
        style += [
            ("BACKGROUND", (0, total_row), (-1, total_row), colors.HexColor(BRAND_SURFACE)),
            ("FONTNAME", (0, total_row), (-1, total_row), "Helvetica-Bold"),
        ]
    return TableStyle(style)
