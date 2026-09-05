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
  // -------------------------------------------------------------------

  // opts.heightMm is the receipt's real content height, already measured by
  // measureThermalReceiptHeightMm() — @page is written with that concrete
  // value from the very first paint. There is no placeholder-then-patch
  // step for the copy that actually gets printed: window.print()'s own
  // preview/print pipeline was found to sometimes snapshot @page before an
  // async DOM mutation lands (verified against a real printed receipt that
  // showed a large blank gap at the top, consistent with the browser having
  // used a stale/placeholder page height for layout). Measuring first and
  // writing once removes that race entirely rather than tuning timeouts
  // around it. If heightMm is omitted (used internally by
  // measureThermalReceiptHeightMm's own measurement pass, which throws this
  // copy away and never prints or previews it), a generous placeholder is
  // used so the measurement pass itself never clips.
  buildThermalReceiptDocument(detection, opts = {}) {
    const { date, time } = this._fmtDetectionDate(detection.created_at);
    const confPct = typeof detection.confidence === 'number'
      ? Math.round((detection.confidence > 1 ? detection.confidence : detection.confidence * 100))
      : detection.confidence;
    const heightMm = opts.heightMm || THERMAL_FORMATS.LONG.height;

    return `<!doctype html>
<html><head><meta charset="utf-8">
<title>VisionaryAI Detection Receipt #${this._escape(detection.id)}</title>
${this._stylesheetTag('thermal', '/css/thermal-print.css')}
<style id="thermalPageSize">@page { size: ${PRINTER_CONFIG.paperWidth}mm ${heightMm}mm; margin: 0; }</style>
${this._criticalThermalStyle()}
</head><body>
<div class="thermal-receipt">
  <div class="thermal-header">
    <div class="brand">VISIONARYAI</div>
    <div class="subtitle">Product Detection</div>
  </div>
  <hr class="thermal-divider">

  <div class="thermal-field">
    <div class="thermal-field-label">Product</div>
    <div class="thermal-field-value">${this._escape(detection.product_name)}</div>
  </div>
  <div class="thermal-field">
    <div class="thermal-field-label">Confidence</div>
    <div class="thermal-field-value">${confPct}%</div>
  </div>
  <div class="thermal-field">
    <div class="thermal-field-label">Status</div>
    <div class="thermal-field-value">EXIT &middot; Confirmed</div>
  </div>
  <div class="thermal-field">
    <div class="thermal-field-label">Source</div>
    <div class="thermal-field-value">${this._escape(detection.source || 'Live Camera')}</div>
  </div>
  <div class="thermal-field">
    <div class="thermal-field-label">Date</div>
    <div class="thermal-field-value">${this._escape(date)}</div>
  </div>
  <div class="thermal-field">
    <div class="thermal-field-label">Time</div>
    <div class="thermal-field-value">${this._escape(time)}</div>
  </div>

  <hr class="thermal-divider">
  <div class="thermal-field">
    <div class="thermal-field-label">Detection ID</div>
    <div class="thermal-field-value secondary">#${this._escape(detection.id)}</div>
  </div>
  <div class="thermal-field">
    <div class="thermal-field-label">Model</div>
    <div class="thermal-field-value secondary">${this._escape(detection.model_name || '—')}</div>
  </div>

  <hr class="thermal-divider">
  <div class="thermal-footer">Thank you</div>
  <div class="thermal-footer">VisionaryAI &middot; ${PRINTER_CONFIG.printerName}</div>
</div>
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

  // CSS has no real "auto" page-length keyword usable alongside a fixed
  // width (`@page { size: 80mm auto }` is invalid and silently falls back
  // to the browser/driver's default page size — verified directly: it
  // produces a Letter-sized page, not an 80mm-wide one). So a single
  // Detection Receipt's height is measured from its own rendered content,
  // in a hidden, off-screen iframe, BEFORE the real print document is ever
  // created — see buildThermalReceiptDocument's opts.heightMm.
  _pxToMm(px) {
    return px / 96 * 25.4; // CSS spec: 96px == 1in == 25.4mm, always
  },

  measureThermalReceiptHeightMm(detection, opts = {}) {
    return new Promise((resolve) => {
      const probeHtml = this.buildThermalReceiptDocument(detection, opts);
      const iframe = document.createElement('iframe');
      iframe.setAttribute('aria-hidden', 'true');
      iframe.style.cssText = 'position:fixed; top:0; left:-99999px; width:80mm; height:50px; border:0; visibility:hidden;';
      // srcdoc MUST be set before the iframe is inserted into the DOM. An
      // iframe with no src/srcdoc yet starts loading about:blank the moment
      // it's attached, which fires its OWN 'load' event — a listener added
      // after insertion (or a 'once' listener added before but racing that
      // first navigation) can catch that empty about:blank load instead of
      // the real srcdoc content, resolving with an empty document and
      // silently falling through to the LONG-format fallback height.
      // Confirmed directly: body.innerHTML was "" when this happened.
      iframe.srcdoc = probeHtml;

      const cleanupAndResolve = (heightMm) => {
        if (iframe.parentNode) iframe.parentNode.removeChild(iframe);
        resolve(heightMm);
      };

      iframe.addEventListener('load', () => {
        try {
          const el = iframe.contentDocument.querySelector('.thermal-receipt');
          const heightMm = el ? Math.ceil(this._pxToMm(el.getBoundingClientRect().height)) + 3 : THERMAL_FORMATS.LONG.height;
          cleanupAndResolve(heightMm);
        } catch (e) {
          cleanupAndResolve(THERMAL_FORMATS.LONG.height); // fail-safe: never blocks printing
        }
      }, { once: true });

      document.body.appendChild(iframe);
    });
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

  async printThermalReceipt(detection) {
    const heightMm = await this.measureThermalReceiptHeightMm(detection);
    const win = this._openPrintWindow(this.buildThermalReceiptDocument(detection, { heightMm }));
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
