/**
 * VisionaryAI Detection History Module
 * Displays audited log of product detections captured via Live Camera
 * with exact product name, confidence percentage, date, time, and CSV import/export capabilities.
 */

const HistoryModule = {
  currentPage: 1,
  pageSize: 15,
  totalItems: 0,
  currentFilters: {
    product: 'All',
    source: 'All',
    min_conf: 0.70, // Hard 0.70 minimum default
    search: '',
    date_from: null,
    date_to: null
  },

  init() {
    // Filter Elements
    const searchInput = document.getElementById('histSearch');
    const prodSelect = document.getElementById('histProductFilter');
    const confSlider = document.getElementById('histConfSlider');
    const confLabel = document.getElementById('histConfVal');
    const btnPrev = document.getElementById('histBtnPrev');
    const btnNext = document.getElementById('histBtnNext');
    const btnExportAllCsv = document.getElementById('histBtnExportAllCsv');
    const fileInputCsv = document.getElementById('histFileInputCsv');
    const btnCloseModal = document.getElementById('btnCloseDetModal');
    const modal = document.getElementById('detectionModal');

    if (searchInput) {
      searchInput.addEventListener('input', (e) => {
        this.currentFilters.search = e.target.value;
        this.currentPage = 1;
        this.loadHistory();
      });
    }

    if (prodSelect) {
      prodSelect.addEventListener('change', (e) => {
        this.currentFilters.product = e.target.value;
        this.currentPage = 1;
        this.loadHistory();
      });
    }

    if (confSlider) {
      confSlider.value = "70";
      if (confLabel) confLabel.textContent = "70%";
      this.currentFilters.min_conf = 0.70;

      confSlider.addEventListener('input', (e) => {
        const val = parseFloat(e.target.value);
        this.currentFilters.min_conf = val / 100;
        if (confLabel) confLabel.textContent = `${val}%`;
        this.currentPage = 1;
        this.loadHistory();
      });
    }

    if (btnPrev) {
      btnPrev.addEventListener('click', () => {
        if (this.currentPage > 1) {
          this.currentPage--;
          this.loadHistory();
        }
      });
    }

    if (btnNext) {
      btnNext.addEventListener('click', () => {
        if (this.currentPage * this.pageSize < this.totalItems) {
          this.currentPage++;
          this.loadHistory();
        }
      });
    }

    if (btnExportAllCsv) {
      btnExportAllCsv.addEventListener('click', () => this.exportAllCsv());
    }

    if (fileInputCsv) {
      fileInputCsv.addEventListener('change', (e) => this.importCsv(e));
    }

    if (btnCloseModal && modal) {
      btnCloseModal.addEventListener('click', () => {
        modal.classList.add('hidden');
      });

      modal.addEventListener('click', (e) => {
        if (e.target === modal) modal.classList.add('hidden');
      });
    }
  },

  formatDate(dateStr) {
    if (!dateStr) return '-';
    if (dateStr.includes(' ')) {
      return dateStr.split(' ')[0];
    }
    const d = new Date(dateStr);
    return isNaN(d.getTime()) ? dateStr : d.toISOString().split('T')[0];
  },

  formatTime(dateStr) {
    if (!dateStr) return '-';
    if (dateStr.includes(' ')) {
      return dateStr.split(' ')[1];
    }
    const d = new Date(dateStr);
    return isNaN(d.getTime()) ? dateStr : d.toLocaleTimeString([], { hour12: false });
  },

  async loadHistory() {
    const tbody = document.getElementById('historyTbody');
    const pageInfo = document.getElementById('histPageInfo');
    const btnPrev = document.getElementById('histBtnPrev');
    const btnNext = document.getElementById('histBtnNext');

    if (!tbody) return;

    const offset = (this.currentPage - 1) * this.pageSize;
    const params = {
      limit: this.pageSize,
      offset: offset,
      ...this.currentFilters
    };

    try {
      const res = await Api.getDetections(params);
      const items = res.items || [];
      this.totalItems = res.total || items.length;

      if (pageInfo) {
        const totalPages = Math.ceil(this.totalItems / this.pageSize) || 1;
        pageInfo.textContent = `Page ${this.currentPage} of ${totalPages} (${this.totalItems} live detections)`;
      }

      if (btnPrev) btnPrev.disabled = this.currentPage <= 1;
      if (btnNext) btnNext.disabled = this.currentPage * this.pageSize >= this.totalItems;

      if (items.length === 0) {
        tbody.innerHTML = `<tr><td colspan="6" style="text-align: center; padding: 2.5rem; color: #94A3B8;">No live product detections matching criteria.</td></tr>`;
        return;
      }

      tbody.innerHTML = items.map(det => {
        const pClass = det.product_name.toLowerCase();
        const confPct = Math.round(det.confidence * 100);
        const dateFormatted = this.formatDate(det.created_at);
        const timeFormatted = this.formatTime(det.created_at);
        const sourceLabel = det.source || 'Live Camera';

        return `
          <tr data-det-id="${det.id}">
            <td style="font-family: var(--font-mono); font-weight: 600; color: #64748B;">#${det.id}</td>
            <td><span class="product-badge ${pClass}">${det.product_name}</span></td>
            <td><span class="conf-pill" style="color: ${confPct >= 90 ? '#059669' : '#D97706'}">${confPct}%</span></td>
            <td><span class="health-pill online" style="padding: 0.15rem 0.5rem; font-size: 0.72rem;"><span class="status-dot"></span> ${sourceLabel}</span></td>
            <td style="font-family: var(--font-mono); font-size: 0.85rem; color: var(--text-title);">${dateFormatted}</td>
            <td style="font-family: var(--font-mono); font-size: 0.85rem; color: #0284C7; font-weight: 600;">${timeFormatted}</td>
          </tr>
        `;
      }).join('');

    } catch (err) {
      console.error('Failed to load history:', err);
    }
  },

  async exportAllCsv() {
    try {
      let items = [];
      const res = await Api.exportAllDatabaseDetections();
      if (res && res.detections) {
        items = res.detections;
      } else if (res && res.items) {
        items = res.items;
      } else if (Array.isArray(res)) {
        items = res;
      }

      if (!items || items.length === 0) {
        alert("No detection history available to export.");
        return;
      }

      // UTF-8 BOM for Excel / Google Sheets compatibility
      let csvContent = "\uFEFF";
      csvContent += "Detection ID,Product Name,Confidence,Source,Date,Time,Timestamp,Model Name,BBox Normalized\n";

      items.forEach(det => {
        const id = det.id || '';
        const rawName = det.product_name || det.product || '';
        const prod = `"${rawName.replace(/"/g, '""')}"`;
        
        let confVal = det.confidence || 0;
        let confPct = typeof confVal === 'number' ? `${Math.round(confVal > 1.0 ? confVal : confVal * 100)}%` : `"${confVal}"`;
        
        const rawSource = det.source || 'Live Camera';
        const source = `"${rawSource.replace(/"/g, '""')}"`;
        const createdAt = det.created_at || '';
        const date = this.formatDate(createdAt);
        const time = this.formatTime(createdAt);
        const timestamp = `"${createdAt}"`;
        
        const rawModel = det.model_name || 'Ultralytics-YOLOv8-FinalDetector';
        const modelName = `"${rawModel.replace(/"/g, '""')}"`;
        
        const bbox = `"[${det.x1 !== undefined ? det.x1 : 0}, ${det.y1 !== undefined ? det.y1 : 0}, ${det.x2 !== undefined ? det.x2 : 0}, ${det.y2 !== undefined ? det.y2 : 0}]"`;

        csvContent += `${id},${prod},${confPct},${source},${date},${time},${timestamp},${modelName},${bbox}\n`;
      });

      const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.setAttribute('href', url);
      link.setAttribute('download', `visionaryai_all_detections_history_${new Date().toISOString().split('T')[0]}.csv`);
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);

      if (typeof showToast === 'function') {
        showToast(`${items.length} detection records exported successfully.`, 'success');
      }
    } catch (err) {
      console.error('Export All CSV failed:', err);
      if (typeof showToast === 'function') {
        showToast('Failed to export detection history.', 'danger');
      } else {
        alert('Failed to export detection history.');
      }
    }
  },

  async importCsv(event) {
    const file = event.target.files ? event.target.files[0] : null;
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async (e) => {
      const text = e.target.result;
      const lines = text.split(/\r?\n/).filter(line => line.trim() !== '');

      if (lines.length <= 1) {
        if (typeof showToast === 'function') {
          showToast('CSV file is empty or missing data rows.', 'warning');
        } else {
          alert('CSV file is empty or missing data rows.');
        }
        return;
      }

      const headers = lines[0].split(',').map(h => h.trim().replace(/^"|"$/g, ''));
      const itemsToImport = [];

      for (let i = 1; i < lines.length; i++) {
        const cols = lines[i].split(',').map(c => c.trim().replace(/^"|"$/g, ''));
        if (cols.length < 2) continue;

        let item = {};
        headers.forEach((h, idx) => {
          item[h] = cols[idx];
        });

        // Normalize item properties
        const prod = item.Product || item['Product Name'] || item.product_name || cols[1] || 'Trident';
        const conf = item.Confidence || item.confidence || '85%';
        const source = item.Source || item.source || 'Imported CSV';
        const date = item.Date || item.date || '';
        const time = item.Time || item.time || '';

        itemsToImport.push({
          product_name: prod,
          confidence: conf,
          source: source,
          Date: date,
          Time: time
        });
      }

      if (itemsToImport.length > 0) {
        try {
          const res = await Api.importDetectionsCsv(itemsToImport);
          const count = res.imported || itemsToImport.length;
          if (typeof showToast === 'function') {
            showToast(`${count} detection records imported successfully.`, 'success');
          } else {
            alert(`Successfully imported ${count} detection records from CSV!`);
          }
          this.currentPage = 1;
          this.loadHistory();
        } catch (err) {
          console.error('Import CSV failed:', err);
          if (typeof showToast === 'function') {
            showToast('Error importing CSV records into database.', 'danger');
          } else {
            alert('Error importing CSV records into database.');
          }
        }
      } else {
        if (typeof showToast === 'function') {
          showToast('No valid records found in CSV file.', 'warning');
        } else {
          alert('No valid records found in CSV file.');
        }
      }

      // Reset file input
      event.target.value = '';
    };

    reader.readAsText(file);
  }
};

document.addEventListener('DOMContentLoaded', () => {
  HistoryModule.init();
});
