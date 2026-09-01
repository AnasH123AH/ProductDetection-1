/**
 * VisionaryAI Backend Management & API Console Module
 * Provides live server telemetry, interactive API console, database inspection & export,
 * model inference benchmarking, and real-time request traffic logging.
 */

const BackendModule = {
  logPollInterval: null,

  init() {
    this.initApiTester();
    this.initDatabaseControls();
    this.initModelBenchmark();
    this.initWeightsLoader();
  },

  async loadBackendView() {
    await this.loadServerTelemetry();
    await this.loadDatabaseInfo();
    await this.loadServerLogs();

    // Poll logs every 4 seconds while on backend page
    if (this.logPollInterval) clearInterval(this.logPollInterval);
    this.logPollInterval = setInterval(() => this.loadServerLogs(), 4000);
  },

  async loadServerTelemetry() {
    try {
      const status = await Api.getStatus();
      const statusBadge = document.getElementById('beServerStatusBadge');
      const uptimeEl = document.getElementById('beServerUptime');
      const engineEl = document.getElementById('beServerEngine');
      const portEl = document.getElementById('beServerPort');
      const modelStatusEl = document.getElementById('beModelStatus');

      const isOnline = status.backend && status.backend.toLowerCase().includes('online');
      if (statusBadge) {
        statusBadge.className = `health-pill ${isOnline ? 'online' : 'warning'}`;
        statusBadge.innerHTML = `<span class="status-dot"></span> ${isOnline ? 'Active & Ready' : 'Standby / Local'}`;
      }

      if (uptimeEl) uptimeEl.textContent = status.uptime_formatted || 'Active Session';
      if (engineEl) engineEl.textContent = 'Python 3.11 / REST Ingestion Engine';
      if (portEl) portEl.textContent = 'Port 8000 (Proxy 5500)';
      if (modelStatusEl) modelStatusEl.textContent = status.model_status || 'YOLOv8 Loaded';
    } catch (e) {
      console.warn('Failed loading backend status', e);
    }
  },

  async loadDatabaseInfo() {
    try {
      const db = await Api.getDatabaseStats();
      const sizeEl = document.getElementById('beDbSize');
      const totalRecEl = document.getElementById('beDbTotalRecords');
      const lastTxEl = document.getElementById('beDbLastTx');
      const pathEl = document.getElementById('beDbPath');

      if (sizeEl) sizeEl.textContent = `${db.size_kb} KB`;
      if (totalRecEl) totalRecEl.textContent = `${db.total_records} Records`;
      if (lastTxEl) lastTxEl.textContent = db.last_transaction || 'Just now';
      if (pathEl) pathEl.textContent = db.file_path || 'backend/detections.db';
    } catch (e) {
      console.warn('Failed loading database metadata', e);
    }
  },

  initApiTester() {
    const endpointSelect = document.getElementById('apiConsoleEndpoint');
    const methodBadge = document.getElementById('apiConsoleMethod');
    const payloadTextarea = document.getElementById('apiConsolePayload');
    const btnSend = document.getElementById('btnExecuteApi');
    const responseOutput = document.getElementById('apiConsoleResponse');
    const statusBadge = document.getElementById('apiResponseStatus');
    const timeBadge = document.getElementById('apiResponseTime');

    const samplePayloads = {
      'GET /api/status': { method: 'GET', body: '' },
      'GET /api/stats': { method: 'GET', body: '' },
      'GET /api/products': { method: 'GET', body: '' },
      'GET /api/detections?limit=5': { method: 'GET', body: '' },
      'GET /api/model': { method: 'GET', body: '' },
      'GET /api/analytics?days=7': { method: 'GET', body: '' },
      'GET /api/database/stats': { method: 'GET', body: '' },
      'GET /api/logs': { method: 'GET', body: '' },
      'POST /api/model/benchmark': { method: 'POST', body: JSON.stringify({ iterations: 5 }, null, 2) },
      'POST /api/settings': { method: 'POST', body: JSON.stringify({ confidence_threshold: "0.55", resolution: "640x640" }, null, 2) }
    };

    if (endpointSelect) {
      endpointSelect.addEventListener('change', () => {
        const val = endpointSelect.value;
        const config = samplePayloads[val] || { method: 'GET', body: '' };
        if (methodBadge) {
          methodBadge.textContent = config.method;
          methodBadge.className = `product-badge ${config.method === 'POST' ? 'donut' : 'trident'}`;
        }
        if (payloadTextarea) {
          payloadTextarea.value = config.body;
          payloadTextarea.disabled = config.method === 'GET';
        }
      });
    }

    if (btnSend) {
      btnSend.addEventListener('click', async () => {
        const fullEndpoint = endpointSelect.value;
        const [method, route] = fullEndpoint.split(' ');
        let body = null;

        if (method === 'POST' && payloadTextarea.value.trim()) {
          try {
            body = JSON.parse(payloadTextarea.value);
          } catch (err) {
            alert('Invalid JSON in Request Body.');
            return;
          }
        }

        btnSend.disabled = true;
        btnSend.textContent = 'Sending...';
        const t0 = performance.now();

        try {
          let respData;
          if (method === 'GET') {
            respData = await Api.request(route.replace('/api', ''));
          } else {
            respData = await Api.request(route.replace('/api', ''), {
              method: 'POST',
              body: JSON.stringify(body)
            });
          }

          const latency = Math.round(performance.now() - t0);
          if (statusBadge) {
            statusBadge.className = 'health-pill online';
            statusBadge.textContent = '200 OK';
          }
          if (timeBadge) timeBadge.textContent = `${latency}ms`;
          if (responseOutput) responseOutput.textContent = JSON.stringify(respData, null, 2);
        } catch (err) {
          const latency = Math.round(performance.now() - t0);
          if (statusBadge) {
            statusBadge.className = 'health-pill offline';
            statusBadge.textContent = 'Error';
          }
          if (timeBadge) timeBadge.textContent = `${latency}ms`;
          if (responseOutput) responseOutput.textContent = JSON.stringify({ error: err.message }, null, 2);
        } finally {
          btnSend.disabled = false;
          btnSend.textContent = 'Execute Request';
          this.loadServerLogs();
        }
      });
    }
  },

  initDatabaseControls() {
    const btnExportJson = document.getElementById('btnDbExportJson');
    const btnExportCsv = document.getElementById('btnDbExportCsv');
    const btnReseed = document.getElementById('btnDbReseed');

    if (btnExportJson) {
      btnExportJson.addEventListener('click', async () => {
        try {
          const data = await Api.exportDatabase();
          const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
          const url = URL.createObjectURL(blob);
          const a = document.createElement('a');
          a.href = url;
          a.download = `visionary_detections_backup_${new Date().toISOString().split('T')[0]}.json`;
          a.click();
        } catch (e) {
          alert('Export failed: ' + e.message);
        }
      });
    }

    if (btnExportCsv) {
      btnExportCsv.addEventListener('click', async () => {
        try {
          const data = await Api.exportDatabase();
          const list = data.detections || [];
          if (list.length === 0) return alert('No records to export');

          const keys = Object.keys(list[0]);
          const csvRows = [keys.join(',')];
          list.forEach(row => {
            csvRows.push(keys.map(k => JSON.stringify(row[k] || '')).join(','));
          });

          const blob = new Blob([csvRows.join('\n')], { type: 'text/csv' });
          const url = URL.createObjectURL(blob);
          const a = document.createElement('a');
          a.href = url;
          a.download = `visionary_detections_${new Date().toISOString().split('T')[0]}.csv`;
          a.click();
        } catch (e) {
          alert('CSV Export failed: ' + e.message);
        }
      });
    }

    if (btnReseed) {
      btnReseed.addEventListener('click', async () => {
        if (confirm('Reseed database with fresh 120 authentic dataset records?')) {
          await Api.reseedDatabase();
          alert('Database successfully reseeded.');
          this.loadDatabaseInfo();
        }
      });
    }
  },

  initModelBenchmark() {
    const btnRun = document.getElementById('btnRunBenchmark');
    const iterSelect = document.getElementById('benchmarkIterations');
    const meanEl = document.getElementById('benchMeanLatency');
    const fpsEl = document.getElementById('benchFps');
    const minEl = document.getElementById('benchMinLatency');
    const maxEl = document.getElementById('benchMaxLatency');

    if (btnRun) {
      btnRun.addEventListener('click', async () => {
        btnRun.disabled = true;
        btnRun.textContent = 'Benchmarking...';

        const iters = parseInt(iterSelect ? iterSelect.value : 10);
        try {
          const res = await Api.runModelBenchmark(iters);
          if (meanEl) meanEl.textContent = `${res.mean_latency_ms} ms`;
          if (fpsEl) fpsEl.textContent = `${res.estimated_fps} FPS`;
          if (minEl) minEl.textContent = `${res.min_latency_ms} ms`;
          if (maxEl) maxEl.textContent = `${res.max_latency_ms} ms`;

          this.renderBenchmarkChart(res.latencies || []);
        } catch (e) {
          alert('Benchmark error: ' + e.message);
        } finally {
          btnRun.disabled = false;
          btnRun.textContent = 'Run Benchmark';
        }
      });
    }
  },

  renderBenchmarkChart(latencies) {
    const canvas = document.getElementById('chartBenchmarkLatency');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    if (latencies.length === 0) return;

    const maxVal = Math.max(...latencies, 20);
    const w = canvas.width;
    const h = canvas.height;
    const padding = 30;
    const chartW = w - padding * 2;
    const chartH = h - padding * 2;
    const barWidth = Math.min(28, chartW / latencies.length - 8);

    // Draw baseline
    ctx.strokeStyle = "#E2E8F0";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(padding, h - padding);
    ctx.lineTo(w - padding, h - padding);
    ctx.stroke();

    latencies.forEach((lat, i) => {
      const barH = (lat / maxVal) * chartH;
      const x = padding + i * (chartW / latencies.length) + 6;
      const y = h - padding - barH;

      ctx.fillStyle = '#0284C7';
      ctx.beginPath();
      ctx.roundRect(x, y, barWidth, barH, [4, 4, 0, 0]);
      ctx.fill();

      // Text label
      ctx.fillStyle = '#64748B';
      ctx.font = "10px 'JetBrains Mono', monospace";
      ctx.textAlign = 'center';
      ctx.fillText(`${lat}`, x + barWidth / 2, y - 5);
      ctx.fillText(`#${i + 1}`, x + barWidth / 2, h - padding + 15);
    });
  },

  initWeightsLoader() {
    const btnLoad = document.getElementById('btnLoadWeights');
    const pathInput = document.getElementById('modelWeightsPathInput');

    if (btnLoad && pathInput) {
      btnLoad.addEventListener('click', async () => {
        const path = pathInput.value.trim();
        if (!path) return alert('Please enter a weights path (e.g., best.pt)');

        try {
          const res = await Api.reloadModelWeights(path);
          alert(res.message || 'Model weights updated.');
          this.loadServerTelemetry();
        } catch (e) {
          alert('Failed to load weights: ' + e.message);
        }
      });
    }
  },

  async loadServerLogs() {
    const listEl = document.getElementById('serverLogsList');
    if (!listEl) return;

    try {
      const data = await Api.getServerLogs();
      const logs = data.logs || [];

      if (logs.length === 0) {
        listEl.innerHTML = `<div style="color: #64748B; padding: 1rem;">No recent request traffic.</div>`;
        return;
      }

      listEl.innerHTML = logs.map(l => {
        const isPost = l.method === 'POST';
        const isOk = l.status >= 200 && l.status < 300;

        return `
          <div style="display: flex; align-items: center; justify-content: space-between; padding: 0.35rem 0.5rem; font-family: var(--font-mono); font-size: 0.78rem; border-bottom: 1px solid rgba(255,255,255,0.05);">
            <div style="display: flex; align-items: center; gap: 0.65rem;">
              <span style="color: #94A3B8;">${l.timestamp}</span>
              <span style="font-weight: 700; color: ${isPost ? '#F59E0B' : '#38BDF8'};">${l.method}</span>
              <span style="color: #F8FAFC;">${l.path}</span>
            </div>
            <div style="display: flex; align-items: center; gap: 0.75rem;">
              <span style="color: ${isOk ? '#10B981' : '#E11D48'}; font-weight: 700;">${l.status}</span>
              <span style="color: #64748B;">${l.latency_ms}ms</span>
            </div>
          </div>
        `;
      }).join('');
    } catch (e) {
      console.warn('Failed loading logs', e);
    }
  }
};

document.addEventListener('DOMContentLoaded', () => {
  BackendModule.init();
});
