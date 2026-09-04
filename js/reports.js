/**
 * VisionaryAI Inventory & Product Exit Report
 * Dashboard "Export Report" card: period selection -> real backend-generated
 * PDF (GET /api/reports/inventory/pdf) built from the live database, plus an
 * optional inline JSON preview (GET /api/reports/inventory).
 * Dashboard "Export Report" card: pick a Start/End date range. The preview
 * (summary cards + tables) loads automatically from the real database
 * whenever the range changes â€” there is no separate "Generate" step, only
 * Export PDF as an explicit action (GET /api/reports/inventory/pdf).
 */

const ReportsModule = {
  init() {
    const periodSelect = document.getElementById('reportPeriodSelect');
    const startWrap = document.getElementById('reportCustomRangeStart');
    const endWrap = document.getElementById('reportCustomRangeEnd');
    const startInput = document.getElementById('reportStartDate');
    const endInput = document.getElementById('reportEndDate');
    const exportBtn = document.getElementById('reportExportBtn');
    const preview = document.getElementById('reportPreview');
    const dateError = document.getElementById('reportDateError');

    if (!startInput || !endInput || !exportBtn || !periodSelect) return;

    const today = new Date().toISOString().slice(0, 10);
    const weekAgo = new Date(Date.now() - 6 * 86400000).toISOString().slice(0, 10);
    startInput.value = weekAgo;
    endInput.value = today;
    endInput.max = today;
    startInput.max = today;

    const syncCustomVisibility = () => {
      const isCustom = periodSelect.value === 'custom';
      if (startWrap) startWrap.style.display = isCustom ? 'block' : 'none';
      if (endWrap) endWrap.style.display = isCustom ? 'block' : 'none';
    };

    const validateRange = () => {
      const isCustom = periodSelect.value === 'custom';
      if (!isCustom) {
        if (dateError) { dateError.style.display = 'none'; dateError.textContent = ''; }
        startInput.classList.remove('report-date-invalid');
        endInput.classList.remove('report-date-invalid');
        exportBtn.disabled = false;
        return true;
      }
      const start = startInput.value;
      const end = endInput.value;
      let message = null;
      if (!start || !end) message = 'Both a Start Date and an End Date are required.';
      else if (end < start) message = 'The End Date cannot be before the Start Date.';
      const invalid = !!message;
      startInput.classList.toggle('report-date-invalid', invalid);
      endInput.classList.toggle('report-date-invalid', invalid);
      if (dateError) { dateError.style.display = invalid ? 'block' : 'none'; dateError.textContent = message || ''; }
      exportBtn.disabled = invalid;
      return !invalid;
    };

    const currentParams = () => {
      const period = periodSelect.value;
      if (period === 'custom') return { period, start: startInput.value, end: endInput.value };
      return { period };
    };

    const refresh = () => {
      if (validateRange()) this.refreshPreview(currentParams(), preview);
    };

    periodSelect.addEventListener('change', () => { syncCustomVisibility(); refresh(); });
    startInput.addEventListener('change', refresh);
    endInput.addEventListener('change', refresh);
    exportBtn.addEventListener('click', () => { if (validateRange()) this.exportPdf(currentParams(), exportBtn); });

    syncCustomVisibility();
    refresh();
  },

  async refreshPreview(params, preview) {
    try {
      const report = await Api.getReportData(params);
      this.renderPreview(preview, report);
    } catch (err) {
      preview.innerHTML = `<div style="padding: var(--space-4); color: var(--color-rose); font-size: var(--text-sm);">${this._escape(err.message || 'Failed to load report.')}</div>`;
      if (typeof showToast === 'function') showToast(err.message || 'Failed to load report.', 'danger');
    }
  },

  async exportPdf(params, btn) {
    if (btn.disabled) return;
    btn.disabled = true;
    const original = btn.textContent;
    btn.textContent = 'Exportingâ€¦';

    try {
      const blob = await Api.getReportPdfBlob(params);
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      const range = params.period === 'custom' ? `${params.start}_to_${params.end}` : params.period;
      a.href = url;
      a.download = `visionaryai_inventory_report_${range}.pdf`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 2000);
      if (typeof showToast === 'function') showToast('Report exported successfully.', 'success');
    } catch (err) {
      if (typeof showToast === 'function') {
        showToast(err.message || 'Failed to export PDF report.', 'danger');
      } else {
        alert(err.message || 'Failed to export PDF report.');
      }
    } finally {
      btn.disabled = false;
      btn.textContent = original;
    }
  },

  renderPreview(preview, report) {
    const s = report.summary;
    const inventoryRows = report.inventory_table.map(r => `
      <tr>
        <td>${r.product_name}</td>
        <td style="text-align:right;">${r.current_stock}</td>
        <td style="text-align:right;">${r.initial_stock}</td>
        <td style="text-align:right;">${r.exited_in_period}</td>
      </tr>`).join('');

    const exitRows = report.exit_table.map(r => `
      <tr>
        <td>${r.product_name}</td>
        <td style="text-align:right;">${r.exits}</td>
        <td style="text-align:right;">${r.pct}%</td>
      </tr>`).join('');

    preview.innerHTML = `
      <div style="border: 1px solid var(--light-border); border-radius: var(--radius-lg); padding: var(--space-5);">
        <div style="font-size: var(--text-xs); color: var(--text-muted); margin-bottom: var(--space-4);">
          Period: <strong>${report.period_label}</strong> (${report.start_date} &mdash; ${report.end_date}, ${report.days_included} day${report.days_included !== 1 ? 's' : ''})
        </div>
        <div style="display:grid; grid-template-columns: repeat(auto-fit, minmax(140px, 1fr)); gap: var(--space-3); margin-bottom: var(--space-5);">
          ${this._statCard('Total Products Exited', s.total_exited)}
          ${this._statCard('Current Total Stock', s.total_current_stock)}
          ${this._statCard('Most Exited Product', s.most_exited_product || 'â€”')}
          ${this._statCard('Average Daily Exits', s.avg_daily_exits)}
        </div>
        <div style="display:grid; grid-template-columns: 1fr 1fr; gap: var(--space-5);">
          <div>
            <div style="font-weight:600; font-size: var(--text-xs); color: var(--text-muted); margin-bottom: var(--space-2);">CURRENT INVENTORY</div>
            <table style="width:100%; border-collapse: collapse; font-size: var(--text-xs);">
              <thead><tr style="color: var(--text-muted); text-align:left;"><th>Product</th><th style="text-align:right;">Current</th><th style="text-align:right;">Initial</th><th style="text-align:right;">Exited</th></tr></thead>
              <tbody>${inventoryRows}</tbody>
            </table>
          </div>
          <div>
            <div style="font-weight:600; font-size: var(--text-xs); color: var(--text-muted); margin-bottom: var(--space-2);">EXIT ACTIVITY &mdash; ${report.period_label.toUpperCase()}</div>
            <table style="width:100%; border-collapse: collapse; font-size: var(--text-xs);">
              <thead><tr style="color: var(--text-muted); text-align:left;"><th>Product</th><th style="text-align:right;">Exits</th><th style="text-align:right;">% of Total</th></tr></thead>
              <tbody>${exitRows}</tbody>
            </table>
          </div>
        </div>
        ${s.total_exited === 0 ? '<div style="margin-top: var(--space-4); font-size: var(--text-xs); color: var(--text-muted);">No product exit events were recorded during this period.</div>' : ''}
      </div>
    `;
  },

  _statCard(label, value) {
    return `
      <div style="background: var(--light-surface-alt, #F8FAFC); border: 1px solid var(--light-border); border-radius: var(--radius-md); padding: var(--space-3); text-align:center;">
        <div style="font-size: 0.65rem; letter-spacing: 0.04em; color: var(--text-muted); text-transform: uppercase;">${label}</div>
        <div style="font-size: var(--text-lg); font-weight: 700; color: var(--text-title); margin-top: 2px;">${value}</div>
      </div>`;
  },

  _escape(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }
};

document.addEventListener('DOMContentLoaded', () => {
  ReportsModule.init();
});
