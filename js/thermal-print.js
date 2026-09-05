/**
 * VisionaryAI Print Engine
 *
 * Two completely separate print pipelines, both driven by the SAME real
 * report/detection data already used elsewhere in the app (Api.getReportData,
 * Api.getDetections) — never demo data:
 *
 *   printA4(report)                    -> A4 (210 x 297mm), css/a4-print.css
 *   printThermal(report, formatKey)    -> POS-80C, css/thermal-print.css
 *   printThermalReceipt(detection)     -> POS-80C, single record, auto height
 *
 * IMPORTANT ARCHITECTURE NOTE (browser print, not raw ESC/POS):
 * This project has no ESC/POS communication mechanism (no WebUSB, WebSerial,
 * Electron, QZ Tray, PrintNode, or backend printer bridge) — only the
 * browser is available. "Thermal printing" here means opening a standalone
 * HTML document sized for the POS-80C's 80mm roll / 72.1mm printable width
 * and calling window.print() on it, exactly as the printer would be used as
 * a normal Windows-installed printer. It is NOT raw ESC/POS byte
 * communication — see the POS-80C configuration notes shipped alongside
 * this feature for what true ESC/POS support would additionally require.
 *
 * Each print opens a fresh, isolated popup document (rather than injecting
 * print CSS into the live dashboard) so the thermal and A4 layouts can never
 * bleed into each other or into the app's own screen styles, and so
 * print-preview always shows exactly the same markup that will print.
 */

const PrintEngine = {
  // css/a4-print.css and css/thermal-print.css are fetched once, well ahead
  // of any actual print action (right when this module loads), and cached
  // here as raw text. Every generated print document then embeds that text
  // directly in an inline <style> tag instead of a <link rel="stylesheet">
  // — removing any dependency on a network/cache round-trip completing
  // between opening the print popup and calling window.print(). If the
  // prefetch hasn't finished yet (e.g. print clicked within the first
  // instant after page load) or failed, a <link> is used as a fallback, so
  // this can never leave a document completely unstyled.
  _cssCache: {},

  _prefetchCss(name, path) {
    fetch(`${window.location.origin}${path}`)
      .then(r => (r.ok ? r.text() : Promise.reject(new Error(`HTTP ${r.status}`))))
      .then(text => { this._cssCache[name] = text; })
      .catch(() => {}); // silent — the <link> fallback covers this
  },

  _stylesheetTag(name, path) {
    const cached = this._cssCache[name];
    if (cached) return `<style>${cached}</style>`;
    return `<link rel="stylesheet" href="${window.location.origin}${path}">`;
  },

  _escape(str) {
    const div = document.createElement('div');
    div.textContent = str === null || str === undefined ? '' : String(str);
    return div.innerHTML;
  },

  _fmtDateLong(isoDate) {
    if (!isoDate) return '—';
    const d = new Date(`${isoDate}T00:00:00`);
    if (isNaN(d.getTime())) return isoDate;
    return d.toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' });
  },

  _fmtGeneratedAt(iso) {
    if (!iso) return '—';
    const d = new Date(iso);
    if (isNaN(d.getTime())) return iso;
    return d.toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' }) +
      ' ' + d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
  },

  _fmtDetectionDate(createdAt) {
    if (!createdAt) return { date: '—', time: '—' };
    const [date, time] = String(createdAt).split(' ');
    return { date: date || '—', time: time || '—' };
  },

  // Belt-and-suspenders: css/a4-print.css and css/thermal-print.css are the
  // real source of truth for layout, but if either fails to load (a stale
  // cache, a proxy hiccup, a future routing change) the browser silently
  // falls back to its own default page size — Letter, not A4 or 80mm,
  // confirmed directly by blocking each stylesheet in testing. These few
  // physically-critical rules (the @page size itself, and — for thermal —
  // the 72.1mm content width) are duplicated inline in every generated
  // document's <head> so the correct paper size and no-overflow guarantee
  // hold even if the linked stylesheet never loads at all.
  _criticalA4Style() {
    return `<style>
      @page { size: A4; margin: 18mm 16mm; }
      html, body { margin: 0; padding: 0; }
      .a4-report { max-width: 178mm; margin: 0 auto; box-sizing: border-box; }
    </style>`;
  },

  _criticalThermalStyle() {
    return `<style>
      html, body { width: ${PRINTER_CONFIG.paperWidth}mm; margin: 0; padding: 0; }
      .thermal-receipt { width: ${PRINTER_CONFIG.printableWidth}mm; max-width: ${PRINTER_CONFIG.printableWidth}mm; margin: 0 auto; box-sizing: border-box; }
      .thermal-receipt * { max-width: 100%; box-sizing: border-box; }
    </style>`;
  },

  // -------------------------------------------------------------------
  // A4 — Inventory & Product Exit Report
  // -------------------------------------------------------------------

  buildA4ReportDocument(report, opts = {}) {
    const s = report.summary;

    const inventoryRows = report.inventory_table.map(r => `
      <tr>
        <td>${this._escape(r.product_name)}</td>
        <td>${r.current_stock}</td>
        <td>${r.initial_stock}</td>
        <td>${r.exited_in_period}</td>
      </tr>`).join('');
    const invTotals = report.inventory_table.reduce((a, r) => ({
      current: a.current + r.current_stock, initial: a.initial + r.initial_stock, exited: a.exited + r.exited_in_period
    }), { current: 0, initial: 0, exited: 0 });

    const exitRows = report.exit_table.map(r => `
      <tr>
        <td>${this._escape(r.product_name)}</td>
        <td>${r.exits}</td>
        <td>${r.pct}%</td>
      </tr>`).join('');

    let breakdownHtml = '';
    if (report.breakdown && report.breakdown.length > 0) {
      const granLabel = report.breakdown_granularity === 'monthly' ? 'Monthly' : 'Daily';
      const products = report.exit_table.map(r => r.product_name);
      const rows = report.breakdown.map(entry => `
        <tr>
          <td>${this._escape(entry.bucket)}</td>
          ${products.map(p => `<td>${entry[p] || 0}</td>`).join('')}
          <td>${entry.total}</td>
        </tr>`).join('');
      breakdownHtml = `
        <div class="a4-section-title">${granLabel} Breakdown</div>
        <table class="a4-table">
          <thead><tr><th>${granLabel === 'Daily' ? 'Date' : 'Month'}</th>${products.map(p => `<th>${this._escape(p)}</th>`).join('')}<th>Total</th></tr></thead>
          <tbody>${rows}</tbody>
        </table>`;
    }

    return `<!doctype html>
<html><head><meta charset="utf-8">
<title>VisionaryAI Inventory Report — ${this._escape(report.start_date)} to ${this._escape(report.end_date)}</title>
${this._stylesheetTag('a4', '/css/a4-print.css')}
${this._criticalA4Style()}
</head><body>
<div class="a4-report">
  <div class="a4-header">
    <div class="brand">VISIONARYAI</div>
    <div class="subtitle">Product Detection &amp; Inventory Report</div>
  </div>
  <div class="a4-meta">
    <div><strong>Period:</strong> ${this._fmtDateLong(report.start_date)} &mdash; ${this._fmtDateLong(report.end_date)} (${this._escape(report.period_label)}, ${report.days_included} day${report.days_included !== 1 ? 's' : ''})</div>
    <div><strong>Generated:</strong> ${this._fmtGeneratedAt(report.generated_at)}</div>
  </div>

  <div class="a4-section-title">Executive Summary</div>
  <div class="a4-summary-grid">
    <div class="a4-stat-card"><div class="stat-label">Total Exited</div><div class="stat-value">${s.total_exited}</div></div>
    <div class="a4-stat-card"><div class="stat-label">Current Total Stock</div><div class="stat-value">${s.total_current_stock}</div></div>
    <div class="a4-stat-card"><div class="stat-label">Most Exited Product</div><div class="stat-value" style="font-size:14px;">${this._escape(s.most_exited_product || '—')}</div></div>
    <div class="a4-stat-card"><div class="stat-label">Average Daily Exits</div><div class="stat-value">${s.avg_daily_exits}</div></div>
  </div>

  <div class="a4-section-title">Current Inventory</div>
  <table class="a4-table">
    <thead><tr><th>Product</th><th>Current Stock</th><th>Initial Stock</th><th>Exited During Period</th></tr></thead>
    <tbody>${inventoryRows}</tbody>
    <tfoot><tr><td>TOTAL</td><td>${invTotals.current}</td><td>${invTotals.initial}</td><td>${invTotals.exited}</td></tr></tfoot>
  </table>

  <div class="a4-section-title">Exit Activity &mdash; ${this._escape(report.period_label)}</div>
  ${s.total_exited === 0 ? '<div class="a4-note">No product exit events were recorded during this period.</div>' : ''}
  <table class="a4-table">
    <thead><tr><th>Product</th><th>Exits</th><th>% of Total</th></tr></thead>
    <tbody>${exitRows}</tbody>
    <tfoot><tr><td>TOTAL</td><td>${s.total_exited}</td><td>${s.total_exited > 0 ? '100%' : '0%'}</td></tr></tfoot>
  </table>

  ${breakdownHtml}

  <div class="a4-footer">
    <span>VisionaryAI — Product Detection &amp; Inventory Report</span>
    <span>Not for financial use — no price data is tracked by this system.</span>
  </div>
</div>
</body></html>`;
  },

  // -------------------------------------------------------------------
  // Thermal — full report on the POS-80C
  // -------------------------------------------------------------------

  buildThermalReportDocument(report, formatKey, opts = {}) {
    const format = getThermalFormatByKey(formatKey);
    if (!format) throw new Error(`Unknown thermal format: ${formatKey}`);
    const s = report.summary;

    const inventoryRows = report.inventory_table.map(r => `
      <tr><td>${this._escape(r.product_name)}</td><td>${r.current_stock}</td><td>${r.initial_stock}</td><td>${r.exited_in_period}</td></tr>`).join('');
    const exitRows = report.exit_table.map(r => `
      <tr><td>${this._escape(r.product_name)}</td><td>${r.exits}</td><td>${r.pct}%</td></tr>`).join('');

    return `<!doctype html>
<html><head><meta charset="utf-8">
<title>VisionaryAI Thermal Report — ${this._escape(report.start_date)} to ${this._escape(report.end_date)}</title>
${this._stylesheetTag('thermal', '/css/thermal-print.css')}
<style id="thermalPageSize">@page { size: ${PRINTER_CONFIG.paperWidth}mm ${format.height}mm; margin: 0; }</style>
${this._criticalThermalStyle()}
</head><body>
<div class="thermal-receipt" style="min-height: ${format.height}mm;">
  <div class="thermal-header">
    <div class="brand">VISIONARYAI</div>
    <div class="subtitle">Inventory &amp; Exit Report</div>
  </div>
  <div class="thermal-meta">
    <div><span class="meta-label">Period</span><span class="meta-value">${this._escape(report.start_date)} to ${this._escape(report.end_date)}</span></div>
    <div><span class="meta-label">Days</span><span class="meta-value">${report.days_included}</span></div>
    <div><span class="meta-label">Generated</span><span class="meta-value">${this._fmtGeneratedAt(report.generated_at)}</span></div>
  </div>
  <hr class="thermal-divider">

  <div class="thermal-section-title">Summary</div>
  <div class="thermal-summary">
    <div class="thermal-summary-row"><span class="label">Total Exited</span><span class="value">${s.total_exited}</span></div>
    <div class="thermal-summary-row"><span class="label">Current Stock</span><span class="value">${s.total_current_stock}</span></div>
    <div class="thermal-summary-row"><span class="label">Most Exited</span><span class="value">${this._escape(s.most_exited_product || '—')}</span></div>
    <div class="thermal-summary-row"><span class="label">Avg Daily Exits</span><span class="value">${s.avg_daily_exits}</span></div>
  </div>
  <hr class="thermal-divider">

  <div class="thermal-section-title">Current Inventory</div>
  <table class="thermal-table">
    <thead><tr><th>Product</th><th>Cur</th><th>Init</th><th>Exit</th></tr></thead>
    <tbody>${inventoryRows}</tbody>
  </table>
  <hr class="thermal-divider">

  <div class="thermal-section-title">Exit Activity</div>
  ${s.total_exited === 0 ? '<div class="thermal-note">No exit events in this period.</div>' : ''}
  <table class="thermal-table">
    <thead><tr><th>Product</th><th>Exits</th><th>%</th></tr></thead>
    <tbody>${exitRows}</tbody>
    <tfoot><tr><td>TOTAL</td><td>${s.total_exited}</td><td>${s.total_exited > 0 ? '100%' : '0%'}</td></tr></tfoot>
  </table>

  <div class="thermal-footer">VisionaryAI &middot; ${format.label}</div>
</div>
</body></html>`;
  },

  // -------------------------------------------------------------------
  // Thermal — single Detection History record (compact receipt)
  //
  // Rendered as a single pre-composed <canvas> PNG rather than reflowable
  // HTML/CSS. Root cause of the persistent blank gap above the receipt in
  // real-world printing: window.print()'s CSS/@page pipeline was measured
  // and found correct in every reproducible test here (real Print-button
  // clicks, page.pdf() with displayHeaderFooter matching the user's own
  // screenshots, file:// loads with the network fully blocked) — the gap
  // never appeared in any of those. That points at the OS-level printer
  // driver's own HTML/CSS layout pass (a different pipeline than Chrome's
  // PDF engine, and one this sandbox cannot access or reproduce) silently
  // reinterpreting the flex/box layout and inserting space before content.
  // A driver can reinterpret text+CSS; it cannot reinterpret a bitmap. So
  // the receipt is fully measured and drawn once, client-side, into a
  // <canvas>, exported as a PNG data URL, and the print document that
  // actually reaches the driver contains nothing but that single <img> at
  // its exact physical size — there is no layout left for any driver to
  // get wrong. See renderThermalReceiptImage() below for the drawing code
  // and buildThermalReceiptImageDocument() for the minimal print document.
  // -------------------------------------------------------------------

  // Px-per-mm at the CSS-spec-fixed 96px = 1in = 25.4mm ratio (DPI-independent).
  _MM_PX: 96 / 25.4,

  // Vertical center of a text line within its CSS line-box, expressed as a
  // fillText baseline offset from the line's top — mirrors how a browser
  // centers a font's glyphs within `line-height` (half-leading), using a
  // fixed 0.8 cap-height ratio (accurate enough for the monospace fallback
  // stack used here; exactness isn't required, only visual fidelity).
  _baselineY(y, lineHeightPx, fontSizePx) {
    return y + (lineHeightPx - fontSizePx) / 2 + fontSizePx * 0.8;
  },

  // Wraps text to fit maxWidthPx using ctx's currently-set font, mirroring
  // CSS `overflow-wrap: break-word` / `word-break: break-word`: break on
  // spaces where possible, and fall back to a character-level split for any
  // single word that alone still exceeds maxWidthPx (e.g. a long product or
  // model name with no spaces).
  _wrapText(ctx, text, maxWidthPx) {
    const words = String(text == null ? '' : text).split(/\s+/).filter(Boolean);
    if (words.length === 0) return [''];
    const lines = [];
    let current = '';
    for (const word of words) {
      const candidate = current ? `${current} ${word}` : word;
      if (ctx.measureText(candidate).width <= maxWidthPx) {
        current = candidate;
        continue;
      }
      if (current) { lines.push(current); current = ''; }
      if (ctx.measureText(word).width <= maxWidthPx) {
        current = word;
        continue;
      }
      let chunk = '';
      for (const ch of word) {
        const test = chunk + ch;
        if (ctx.measureText(test).width <= maxWidthPx || !chunk) {
          chunk = test;
        } else {
          lines.push(chunk);
          chunk = ch;
        }
      }
      current = chunk;
    }
    if (current) lines.push(current);
    return lines.length ? lines : [''];
  },

  // Header block: brand + subtitle, centered. Metrics match
  // css/thermal-print.css .thermal-header / .brand / .subtitle exactly.
  _buildHeaderBlock(fontFamily) {
    const MM = this._MM_PX;
    const brandFS = 20, brandLH = brandFS * 1.5;
    const subFS = 11, subLH = subFS * 1.5, subMarginTop = 1 * MM;
    const height = brandLH + subMarginTop + subLH;
    return {
      marginTop: 0, marginBottom: 2.5 * MM, height,
      draw: (ctx, left, y, width) => {
        ctx.textAlign = 'center';
        ctx.font = `700 ${brandFS}px ${fontFamily}`;
        ctx.letterSpacing = `${0.06 * brandFS}px`;
        ctx.fillText('VISIONARYAI', left + width / 2, this._baselineY(y, brandLH, brandFS));
        ctx.font = `700 ${subFS}px ${fontFamily}`;
        ctx.letterSpacing = '0px';
        ctx.fillText('Product Detection', left + width / 2, this._baselineY(y + brandLH + subMarginTop, subLH, subFS));
      }
    };
  },

  // Dashed divider: matches .thermal-divider (1px solid-drawn-as-dashed rule, 2.5mm margin above/below).
  _buildDividerBlock() {
    const MM = this._MM_PX;
    return {
      marginTop: 2.5 * MM, marginBottom: 2.5 * MM, height: 1,
      draw: (ctx, left, y, width) => {
        ctx.save();
        ctx.strokeStyle = '#000000';
        ctx.lineWidth = 1;
        ctx.setLineDash([3, 2]);
        ctx.beginPath();
        ctx.moveTo(left, y + 0.5);
        ctx.lineTo(left + width, y + 0.5);
        ctx.stroke();
        ctx.restore();
      }
    };
  },

  // Label-over-value field: matches .thermal-field / .thermal-field-label /
  // .thermal-field-value(.secondary). Value may wrap to multiple lines.
  _buildFieldBlock(mctx, label, value, { secondary = false, contentWidthPx, fontFamily }) {
    const MM = this._MM_PX;
    const labelFS = 9.5, labelLH = labelFS * 1.5;
    const valueFS = secondary ? 11 : 15, valueLH = valueFS * 1.5;
    const valueMarginTop = 0.5 * MM;
    mctx.font = `700 ${valueFS}px ${fontFamily}`;
    const lines = this._wrapText(mctx, value, contentWidthPx);
    const height = labelLH + valueMarginTop + lines.length * valueLH;
    return {
      marginTop: 0, marginBottom: 2.5 * MM, height,
      draw: (ctx, left, y, width) => {
        ctx.textAlign = 'left';
        ctx.font = `700 ${labelFS}px ${fontFamily}`;
        ctx.letterSpacing = `${0.05 * labelFS}px`;
        ctx.fillText(String(label).toUpperCase(), left, this._baselineY(y, labelLH, labelFS));
        ctx.letterSpacing = '0px';
        ctx.font = `700 ${valueFS}px ${fontFamily}`;
        const valueTop = y + labelLH + valueMarginTop;
        lines.forEach((line, i) => {
          ctx.fillText(line, left, this._baselineY(valueTop + i * valueLH, valueLH, valueFS));
        });
      }
    };
  },

  // Centered footer line: matches .thermal-footer.
  _buildFooterBlock(text, fontFamily) {
    const MM = this._MM_PX;
    const fs = 11, lh = fs * 1.5;
    return {
      marginTop: 3.5 * MM, marginBottom: 0, height: lh,
      draw: (ctx, left, y, width) => {
        ctx.textAlign = 'center';
        ctx.font = `700 ${fs}px ${fontFamily}`;
        ctx.fillText(text, left + width / 2, this._baselineY(y, lh, fs));
      }
    };
  },

  _buildReceiptBlocks(detection, mctx, contentWidthPx, fontFamily) {
    const { date, time } = this._fmtDetectionDate(detection.created_at);
    const confPct = typeof detection.confidence === 'number'
      ? Math.round((detection.confidence > 1 ? detection.confidence : detection.confidence * 100))
      : detection.confidence;
    const field = (label, value, opts) => this._buildFieldBlock(mctx, label, value, { contentWidthPx, fontFamily, ...opts });

    return [
      this._buildHeaderBlock(fontFamily),
      this._buildDividerBlock(),
      field('Product', detection.product_name),
      field('Confidence', `${confPct}%`),
      field('Status', 'EXIT · Confirmed'),
      field('Source', detection.source || 'Live Camera'),
      field('Date', date),
      field('Time', time),
      this._buildDividerBlock(),
      field('Detection ID', `#${detection.id}`, { secondary: true }),
      field('Model', detection.model_name || '—', { secondary: true }),
      this._buildDividerBlock(),
      this._buildFooterBlock('Thank you', fontFamily),
      this._buildFooterBlock(`VisionaryAI · ${PRINTER_CONFIG.printerName}`, fontFamily)
    ];
  },

  // Measures then draws the full receipt in one synchronous pass (no async
  // iframe round-trip, and so no race with it) and returns a ready-to-print
  // PNG plus its exact physical size. DEVICE_SCALE renders at 4x the CSS-px
  // grid so text stays crisp at real thermal-printer resolution; the <img>
  // in the print document is still sized to the true mm dimensions below,
  // so this only affects pixel density, never the physical output size.
  renderThermalReceiptImage(detection) {
    const MM = this._MM_PX;
    const DEVICE_SCALE = 4;
    const fontFamily = `'Courier New', monospace`;
    const pageWidthMm = PRINTER_CONFIG.paperWidth;
    const contentWidthMm = PRINTER_CONFIG.printableWidth;
    const paddingMm = 3;

    const pageWidthPx = pageWidthMm * MM;
    const contentWidthPx = contentWidthMm * MM;
    const contentLeftPx = (pageWidthPx - contentWidthPx) / 2;
    const paddingPx = paddingMm * MM;

    const measureCanvas = document.createElement('canvas');
    const mctx = measureCanvas.getContext('2d');
    const blocks = this._buildReceiptBlocks(detection, mctx, contentWidthPx, fontFamily);

    let contentHeightPx = 0;
    let prevMarginBottom = 0;
    blocks.forEach((b, i) => {
      contentHeightPx += (i === 0 ? 0 : Math.max(prevMarginBottom, b.marginTop)) + b.height;
      prevMarginBottom = b.marginBottom;
    });

    const pageHeightPx = paddingPx * 2 + contentHeightPx;
    const pageHeightMm = pageHeightPx / MM;

    const canvas = document.createElement('canvas');
    canvas.width = Math.ceil(pageWidthPx * DEVICE_SCALE);
    canvas.height = Math.ceil(pageHeightPx * DEVICE_SCALE);
    const ctx = canvas.getContext('2d');
    ctx.scale(DEVICE_SCALE, DEVICE_SCALE);
    ctx.fillStyle = '#FFFFFF';
    ctx.fillRect(0, 0, pageWidthPx, pageHeightPx);
    ctx.fillStyle = '#000000';
    ctx.textBaseline = 'alphabetic';

    let y = paddingPx;
    prevMarginBottom = 0;
    blocks.forEach((b, i) => {
      if (i > 0) y += Math.max(prevMarginBottom, b.marginTop);
      b.draw(ctx, contentLeftPx, y, contentWidthPx);
      y += b.height;
      prevMarginBottom = b.marginBottom;
    });

    return {
      dataUrl: canvas.toDataURL('image/png'),
      widthMm: pageWidthMm,
      heightMm: pageHeightMm
    };
  },

  // Minimal print document: nothing but the pre-rendered receipt <img> at
  // its true physical size. No flex/grid, no fonts, no reflow — there is
  // nothing left in this document for a printer driver's own layout pass
  // to misinterpret.
  buildThermalReceiptImageDocument(dataUrl, widthMm, heightMm) {
    return `<!doctype html>
<html><head><meta charset="utf-8">
<title>VisionaryAI Detection Receipt</title>
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  @page { size: ${widthMm}mm ${heightMm}mm; margin: 0; }
  html, body { width: ${widthMm}mm; height: ${heightMm}mm; background: #FFFFFF; }
  img { display: block; width: ${widthMm}mm; height: ${heightMm}mm; }
</style>
</head><body>
<img src="${dataUrl}" alt="VisionaryAI Detection Receipt" width="${widthMm}" height="${heightMm}">
</body></html>`;
  },

  // -------------------------------------------------------------------
  // Popup window handling (shared by every print* entry point)
  // -------------------------------------------------------------------

  _openPrintWindow(html) {
    const win = window.open('', '_blank', 'width=900,height=1000');
    if (!win) {
      throw new Error('Could not open the print window. Check your browser\'s popup blocker.');
    }
    win.document.open();
    win.document.write(html);
    win.document.close();
    return win;
  },

  _printWindow(win) {
    const doPrint = () => {
      win.focus();
      win.print();
    };
    // Wait for the linked stylesheet to actually apply before printing —
    // printing too early can hand the browser an unstyled (or A4-default)
    // page, which is exactly the failure mode this feature exists to avoid.
    // Two nested requestAnimationFrame calls guarantee at least one full
    // style-recalc + layout + paint cycle has actually completed (a fixed
    // setTimeout alone doesn't guarantee that on a slower machine), plus a
    // small extra buffer on top for real-world safety margin.
    const waitForPaintThenPrint = () => {
      win.requestAnimationFrame(() => {
        win.requestAnimationFrame(() => setTimeout(doPrint, 150));
      });
    };
    if (win.document.readyState === 'complete') {
      waitForPaintThenPrint();
    } else {
      win.addEventListener('load', waitForPaintThenPrint);
    }
  },

  printA4(report) {
    const win = this._openPrintWindow(this.buildA4ReportDocument(report));
    this._printWindow(win);
    return win;
  },

  printThermal(report, formatKey) {
    const win = this._openPrintWindow(this.buildThermalReportDocument(report, formatKey));
    this._printWindow(win);
    return win;
  },

  printThermalReceipt(detection) {
    const { dataUrl, widthMm, heightMm } = this.renderThermalReceiptImage(detection);
    const win = this._openPrintWindow(this.buildThermalReceiptImageDocument(dataUrl, widthMm, heightMm));
    this._printWindow(win);
    return win;
  }
};

// Kick off both prefetches immediately as this module loads (i.e. when
// app.html loads) — by the time a user actually opens the print dialog,
// seconds or minutes later, the CSS text is already cached and every
// generated document embeds it directly instead of a <link>.
PrintEngine._prefetchCss('a4', '/css/a4-print.css');
PrintEngine._prefetchCss('thermal', '/css/thermal-print.css');
