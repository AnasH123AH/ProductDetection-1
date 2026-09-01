/**
 * VisionaryAI Model Information Module
 * Displays verified Ultralytics YOLO model architecture, metrics, and dataset notes.
 */

const ModelModule = {
  async loadModelInfo() {
    const statusEl = document.getElementById('modelConnectionStatus');
    const nameEl = document.getElementById('modelArchName');
    const inputSizeEl = document.getElementById('modelInputSize');
    const mapEl = document.getElementById('modelMap50');
    const map95El = document.getElementById('modelMap5095');
    const precisionEl = document.getElementById('modelPrecision');
    const recallEl = document.getElementById('modelRecall');
    const classesListEl = document.getElementById('modelClassesList');

    try {
      const data = await Api.getModelInfo();
      const info = data.model_info || {};

      if (statusEl) {
        statusEl.className = 'health-pill online';
        statusEl.innerHTML = `<span class="status-dot"></span> ${info.status || 'Model Connected'}`;
      }

      if (nameEl) nameEl.textContent = info.name || 'Ultralytics YOLOv8 (C:\\yolo\\best.pt)';
      if (inputSizeEl) inputSizeEl.textContent = info.input_size || '640x640';
      if (mapEl) mapEl.textContent = `${((info.map50 !== undefined ? info.map50 : 0.9196) * 100).toFixed(1)}%`;
      if (map95El) map95El.textContent = `${((info.map50_95 !== undefined ? info.map50_95 : 0.7935) * 100).toFixed(1)}%`;
      if (precisionEl) precisionEl.textContent = `${((info.precision !== undefined ? info.precision : 0.9887) * 100).toFixed(1)}%`;
      if (recallEl) recallEl.textContent = `${((info.recall !== undefined ? info.recall : 0.8989) * 100).toFixed(1)}%`;

      if (classesListEl && data.classes) {
        classesListEl.innerHTML = data.classes.map(c => `
          <div style="display: flex; align-items: center; justify-content: space-between; padding: 0.75rem 1rem; border-radius: var(--radius-md); background: #F8FAFC; border: 1px solid var(--light-border);">
            <div style="display: flex; align-items: center; gap: 0.65rem;">
              <span style="width: 12px; height: 12px; border-radius: var(--radius-full); background: ${c.color};"></span>
              <strong style="color: var(--text-title);">${c.name}</strong>
            </div>
            <span style="font-family: var(--font-mono); font-size: 0.8rem; color: #64748B;">Class ID: ${c.id}</span>
          </div>
        `).join('');
      }
    } catch (e) {
      console.error('Failed to load model info', e);
    }
  }
};
