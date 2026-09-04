/**
 * VisionaryAI Printer Configuration
 * Single source of truth for every physical paper/printer dimension used by
 * the printing system (js/thermal-print.js, js/print-dialog.js). Nothing
 * else in the app should hard-code 80, 72.1, 210, 297, 3276, or "POS-80C" —
 * read them from here instead.
 */

// The POS-80C's roll is 80mm wide, but its actual printable area is 72.1mm
// (the rest is unprintable margin built into the mechanism/driver) — the
// two numbers are deliberately different and must never be conflated.
const PRINTER_CONFIG = {
  printerName: "POS-80C",
  paperWidth: 80,        // mm — physical roll width
  printableWidth: 72.1,  // mm — actual printable content width
  supportedHeights: [210, 297, 3276],
  unit: "mm"
};

// The three supported thermal paper lengths for full reports. A single
// detection receipt does not use these — it auto-sizes to its own content
// height instead (see THERMAL_RECEIPT_FORMAT).
const THERMAL_FORMATS = {
  SMALL: {
    key: "80x210",
    label: "80 × 210 mm",
    paperWidth: PRINTER_CONFIG.paperWidth,
    printableWidth: PRINTER_CONFIG.printableWidth,
    height: 210
  },
  MEDIUM: {
    key: "80x297",
    label: "80 × 297 mm",
    paperWidth: PRINTER_CONFIG.paperWidth,
    printableWidth: PRINTER_CONFIG.printableWidth,
    height: 297
  },
  LONG: {
    key: "80x3276",
    label: "80 × 3276 mm",
    paperWidth: PRINTER_CONFIG.paperWidth,
    printableWidth: PRINTER_CONFIG.printableWidth,
    height: 3276
  }
};

// A single Detection History receipt: same 80mm roll / 72.1mm printable
// width, but no fixed length — height should follow the content, which is
// what @page { size: 80mm auto } asks the browser/driver to do.
const THERMAL_RECEIPT_FORMAT = {
  key: "80xauto",
  label: "80 mm (auto height)",
  paperWidth: PRINTER_CONFIG.paperWidth,
  printableWidth: PRINTER_CONFIG.printableWidth,
  height: "auto"
};

const A4_FORMAT = {
  key: "a4",
  label: "A4 (210 × 297 mm)",
  width: 210,
  height: 297
};

function getThermalFormatByKey(key) {
  return Object.values(THERMAL_FORMATS).find(f => f.key === key) || null;
}
