/**
 * VisionaryAI Print Dialog
 * Shared UI controller for the #printDialog modal — used by both the
 * Export Report card (mode: 'report', A4 or Thermal POS-80C with a paper
 * size choice) and Detection History's per-record receipt button (mode:
 * 'receipt', thermal-only, auto height, no paper size choice).
 *
 * The dialog's preview (an <iframe>) is rendered with the exact same HTML
 * PrintEngine.print*() will send to window.print() — a real WYSIWYG
 * preview, not a separate approximation. Note: the iframe itself may be
 * visually shrunk to fit the on-screen modal (a preview convenience only);
 * the actual printed/PDF output always comes from PrintEngine's own,
 * unscaled popup window, never from this iframe.
 */

const PrintDialog = {
  _mode: null,           // 'report' | 'receipt'
  _getReportParams: null,
  _detection: null,
  _thermalFormatKey: THERMAL_FORMATS.MEDIUM.key,

  init() {
    const dialog = document.getElementById('printDialog');
    const closeBtn = document.getElementById('printDialogCloseBtn');
    const previewBtn = document.getElementById('printDialogPreviewBtn');
    const printBtn = document.getElementById('printDialogPrintBtn');
    const debugToggle = document.getElementById('printDebugToggle');
    const paperSizeSelect = document.getElementById('paperSizeSelect');

    if (!dialog) return;

    // A dropdown shows only the currently selected paper size — the other
    // two options exist but aren't visible at once, unlike a radio row.
    paperSizeSelect.innerHTML = Object.values(THERMAL_FORMATS).map(f => `
      <option value="${f.key}" ${f.key === this._thermalFormatKey ? 'selected' : ''}>${this._escape(f.label)}</option>
    `).join('');

    document.querySelectorAll('input[name="printerType"]').forEach(radio => {
      radio.addEventListener('change', () => {
        this._syncSectionVisibility();
        this.refreshPreview();
      });
    });
    paperSizeSelect.addEventListener('change', () => {
      this._thermalFormatKey = paperSizeSelect.value;
      this.refreshPreview();
    });

    if (debugToggle) {
      debugToggle.addEventListener('change', () => this.refreshPreview());
    }

    if (closeBtn) closeBtn.addEventListener('click', () => this.close());
    dialog.addEventListener('click', (e) => {
      if (e.target === dialog) this.close();
    });
    if (previewBtn) previewBtn.addEventListener('click', () => this.refreshPreview());
    if (printBtn) printBtn.addEventListener('click', () => this.doPrint());
  },

  _escape(str) {
    const div = document.createElement('div');
    div.textContent = str === null || str === undefined ? '' : String(str);
    return div.innerHTML;
  },

  _isThermal() {
    if (this._mode === 'receipt') return true;
    const checked = document.querySelector('input[name="printerType"]:checked');
    return checked ? checked.value === 'thermal' : false;
  },

  _syncSectionVisibility() {
    const printerTypeSection = document.getElementById('printerTypeSection');
    const paperSizeSection = document.getElementById('paperSizeSection');
    if (this._mode === 'receipt') {
      printerTypeSection.style.display = 'none';
      paperSizeSection.style.display = 'none';
    } else {
      printerTypeSection.style.display = '';
      paperSizeSection.style.display = this._isThermal() ? '' : 'none';
    }
  },

  openForReport(getReportParams) {
    this._mode = 'report';
    this._getReportParams = getReportParams;
    this._detection = null;

    document.getElementById('printDialogTitle').textContent = 'Print Report';
    document.getElementById('printDialogSubtitle').textContent =
      'Choose A4/PDF or the POS-80C thermal printer, then preview or print the current report.';

    const a4Radio = document.querySelector('input[name="printerType"][value="a4"]');
    if (a4Radio) a4Radio.checked = true;

    this._syncSectionVisibility();
    this._show();
    this.refreshPreview();
  },

  openForReceipt(detection) {
    this._mode = 'receipt';
    this._detection = detection;
    this._getReportParams = null;

    document.getElementById('printDialogTitle').textContent = `Print Receipt #${detection.id}`;
    document.getElementById('printDialogSubtitle').textContent =
      'POS-80C thermal receipt for this single detection record (auto height).';

    this._syncSectionVisibility();
    this._show();
    this.refreshPreview();
  },

  _show() {
    document.getElementById('printDialog').classList.remove('hidden');
  },

  close() {
    document.getElementById('printDialog').classList.add('hidden');
  },

  async _currentReportData() {
    const params = this._getReportParams();
    return Api.getReportData(params);
  },

  async refreshPreview() {
    const frame = document.getElementById('printPreviewFrame');
    const debugPanel = document.getElementById('printDebugPanel');
    const debugToggle = document.getElementById('printDebugToggle');
    const showDebug = !!(debugToggle && debugToggle.checked);

    try {
      let html, widthMm, heightMm, selectedHeightLabel, printMode;

      if (this._mode === 'receipt') {
        // Same measurement PrintEngine.printThermalReceipt() uses for the
        // real print, so the preview's height is never a guess that could
        // drift from what actually prints.
        const measuredHeightMm = await PrintEngine.measureThermalReceiptHeightMm(this._detection, { debug: showDebug });
        html = PrintEngine.buildThermalReceiptDocument(this._detection, { debug: showDebug, heightMm: measuredHeightMm });
        widthMm = PRINTER_CONFIG.printableWidth;
        heightMm = measuredHeightMm;
        selectedHeightLabel = `${measuredHeightMm}mm (auto, content-sized)`;
        printMode = 'THERMAL';
      } else if (this._isThermal()) {
        const format = getThermalFormatByKey(this._thermalFormatKey);
        const report = await this._currentReportData();
        html = PrintEngine.buildThermalReportDocument(report, this._thermalFormatKey, { debug: showDebug });
        widthMm = PRINTER_CONFIG.printableWidth;
        heightMm = format.height;
        selectedHeightLabel = `${format.height}mm`;
        printMode = 'THERMAL';
      } else {
        const report = await this._currentReportData();
        html = PrintEngine.buildA4ReportDocument(report, { debug: showDebug });
        widthMm = A4_FORMAT.width;
        heightMm = A4_FORMAT.height;
        selectedHeightLabel = `${A4_FORMAT.height}mm (A4)`;
        printMode = 'A4';
      }

      frame.style.width = `${widthMm}mm`;
      frame.style.height = `${heightMm}mm`;
      frame.srcdoc = html;

      if (showDebug) {
        debugPanel.hidden = false;
        debugPanel.textContent =
          `Paper Width: ${PRINTER_CONFIG.paperWidth}mm\n` +
          `Printable Width: ${PRINTER_CONFIG.printableWidth}mm\n` +
          `Selected Height: ${selectedHeightLabel}\n` +
          `Printer: ${printMode === 'A4' ? 'A4 / PDF (browser)' : PRINTER_CONFIG.printerName}\n` +
          `Print Mode: ${printMode}`;
      } else {
        debugPanel.hidden = true;
      }
    } catch (err) {
      frame.srcdoc = `<p style="font-family: sans-serif; color: #B91C1C; padding: 12px;">${this._escape(err.message || 'Failed to build preview.')}</p>`;
      if (typeof showToast === 'function') showToast(err.message || 'Failed to build print preview.', 'danger');
    }
  },

  async doPrint() {
    const printBtn = document.getElementById('printDialogPrintBtn');
    printBtn.disabled = true;
    const original = printBtn.textContent;
    printBtn.textContent = 'Preparing…';

    try {
      if (this._mode === 'receipt') {
        await PrintEngine.printThermalReceipt(this._detection);
      } else if (this._isThermal()) {
        const report = await this._currentReportData();
        PrintEngine.printThermal(report, this._thermalFormatKey);
      } else {
        const report = await this._currentReportData();
        PrintEngine.printA4(report);
      }
      if (typeof showToast === 'function') showToast('Print window opened.', 'success');
    } catch (err) {
      if (typeof showToast === 'function') {
        showToast(err.message || 'Failed to print.', 'danger');
      } else {
        alert(err.message || 'Failed to print.');
      }
    } finally {
      printBtn.disabled = false;
      printBtn.textContent = original;
    }
  }
};

document.addEventListener('DOMContentLoaded', () => {
  PrintDialog.init();
});
