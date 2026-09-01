/**
 * VisionaryAI Image Detection Studio Module
 * Handles file drag-and-drop, sample image loading, bounding box canvas drawing,
 * and detection results reporting.
 */

const ImageDetectModule = {
  canvasEl: null,
  ctx: null,
  dropzoneEl: null,
  fileInputEl: null,
  currentImage: null,

  init() {
    this.canvasEl = document.getElementById('imageDetectionCanvas');
    this.dropzoneEl = document.getElementById('imageDropzone');
    this.fileInputEl = document.getElementById('imageFileInput');
    if (!this.canvasEl || !this.dropzoneEl) return;
    this.ctx = this.canvasEl.getContext('2d');

    // Drag and Drop
    this.dropzoneEl.addEventListener('dragover', (e) => {
      e.preventDefault();
      this.dropzoneEl.classList.add('dragover');
    });

    this.dropzoneEl.addEventListener('dragleave', () => {
      this.dropzoneEl.classList.remove('dragover');
    });

    this.dropzoneEl.addEventListener('drop', (e) => {
      e.preventDefault();
      this.dropzoneEl.classList.remove('dragover');
      const files = e.dataTransfer.files;
      if (files.length > 0) this.handleFile(files[0]);
    });

    this.dropzoneEl.addEventListener('click', () => {
      if (this.fileInputEl) this.fileInputEl.click();
    });

    if (this.fileInputEl) {
      this.fileInputEl.addEventListener('change', (e) => {
        if (e.target.files.length > 0) this.handleFile(e.target.files[0]);
      });
    }

    // Sample Image Buttons
    document.querySelectorAll('.btn-sample').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const sampleUrl = btn.getAttribute('data-sample');
        this.loadSampleImage(sampleUrl);
      });
    });
  },

  handleFile(file) {
    const validTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp'];
    const errorEl = document.getElementById('imageUploadError');
    if (errorEl) errorEl.classList.add('hidden');

    if (!validTypes.includes(file.type)) {
      if (errorEl) {
        errorEl.classList.remove('hidden');
        errorEl.textContent = 'Please upload a valid JPG, JPEG, PNG, or WEBP image.';
      }
      return;
    }

    const reader = new FileReader();
    reader.onload = (e) => {
      this.processImageSource(e.target.result);
    };
    reader.readAsDataURL(file);
  },

  loadSampleImage(url) {
    const img = new Image();
    img.crossOrigin = "Anonymous";
    img.onload = () => {
      const c = document.createElement('canvas');
      c.width = img.width;
      c.height = img.height;
      const cx = c.getContext('2d');
      cx.drawImage(img, 0, 0);
      const dataUrl = c.toDataURL('image/jpeg', 0.85);
      this.processImageSource(dataUrl);
    };
    img.src = url;
  },

  async processImageSource(dataUrl) {
    const loadingEl = document.getElementById('imageInferenceLoading');
    const resultsContainer = document.getElementById('imageResultsContainer');
    const emptyState = document.getElementById('imageEmptyState');

    if (loadingEl) loadingEl.classList.remove('hidden');
    if (emptyState) emptyState.classList.add('hidden');

    const img = new Image();
    img.onload = async () => {
      this.currentImage = img;
      
      try {
        const result = await Api.detectImage(dataUrl, 'Uploaded Image', 0.70);
        if (loadingEl) loadingEl.classList.add('hidden');
        if (resultsContainer) resultsContainer.classList.remove('hidden');

        const rawDets = result.detections || [];
        const validDets = rawDets.filter(d => {
          const c = typeof d.confidence === 'number' ? (d.confidence > 1 ? d.confidence / 100 : d.confidence) : parseFloat(d.confidence);
          return c >= 0.70;
        });

        result.detections = validDets;
        this.renderDetectedImage(img, validDets);
        this.renderResultsList(result);
      } catch (err) {
        console.error('Image detection failed:', err);
        if (loadingEl) loadingEl.classList.add('hidden');
      }
    };
    img.src = dataUrl;
  },

  renderDetectedImage(img, detections) {
    if (!this.ctx || !this.canvasEl) return;

    // Match aspect ratio
    const maxWidth = 760;
    const scale = Math.min(maxWidth / img.width, 500 / img.height, 1);
    const renderW = Math.round(img.width * scale);
    const renderH = Math.round(img.height * scale);

    this.canvasEl.width = renderW;
    this.canvasEl.height = renderH;

    // Draw Image
    this.ctx.drawImage(img, 0, 0, renderW, renderH);

    // Draw Bounding Boxes
    detections.forEach(det => {
      const [x1, y1, x2, y2] = det.bbox;
      const bx = x1 * renderW;
      const by = y1 * renderH;
      const bw = (x2 - x1) * renderW;
      const bh = (y2 - y1) * renderH;

      const color = det.color || '#0284C7';
      const confPct = Math.round(det.confidence * 100);

      // Bounding Box
      this.ctx.strokeStyle = color;
      this.ctx.lineWidth = 3;
      this.ctx.strokeRect(bx, by, bw, bh);

      // Corner Accents
      const cornerLen = 12;
      this.ctx.lineWidth = 4;
      this.ctx.beginPath();
      this.ctx.moveTo(bx, by + cornerLen);
      this.ctx.lineTo(bx, by);
      this.ctx.lineTo(bx + cornerLen, by);
      this.ctx.moveTo(bx + bw - cornerLen, by);
      this.ctx.lineTo(bx + bw, by);
      this.ctx.lineTo(bx + bw, by + cornerLen);
      this.ctx.moveTo(bx, by + bh - cornerLen);
      this.ctx.lineTo(bx, by + bh);
      this.ctx.lineTo(bx + cornerLen, by + bh);
      this.ctx.moveTo(bx + bw - cornerLen, by + bh);
      this.ctx.lineTo(bx + bw, by + bh);
      this.ctx.lineTo(bx + bw, by + bh - cornerLen);
      this.ctx.stroke();

      // Label Badge
      const label = `${det.class} ${confPct}%`;
      this.ctx.font = "bold 13px 'Plus Jakarta Sans', sans-serif";
      const textWidth = this.ctx.measureText(label).width;

      this.ctx.fillStyle = color;
      this.ctx.beginPath();
      this.ctx.roundRect(bx, by - 26, textWidth + 14, 24, [4, 4, 0, 0]);
      this.ctx.fill();

      this.ctx.fillStyle = "#FFFFFF";
      this.ctx.fillText(label, bx + 7, by - 9);
    });
  },

  renderResultsList(result) {
    const listEl = document.getElementById('imageDetectionsList');
    const totalEl = document.getElementById('imageTotalDetected');
    const latencyEl = document.getElementById('imageLatencyVal');
    const modelEl = document.getElementById('imageModelVal');

    const dets = result.detections || [];
    if (totalEl) totalEl.textContent = `${dets.length} object${dets.length === 1 ? '' : 's'}`;
    if (latencyEl) latencyEl.textContent = `${result.inference_latency_ms || 14}ms`;
    if (modelEl) modelEl.textContent = result.model || 'Ultralytics YOLOv8';

    if (!listEl) return;

    if (dets.length === 0) {
      listEl.innerHTML = `<div style="color: #94A3B8; text-align: center; padding: 1.5rem;">No products recognized above confidence threshold.</div>`;
      return;
    }

    listEl.innerHTML = dets.map(det => {
      const pClass = det.class.toLowerCase();
      const confPct = Math.round(det.confidence * 100);
      const bboxStr = det.bbox.map(b => (b * 100).toFixed(1) + '%').join(', ');

      return `
        <div class="detection-result-item">
          <div>
            <span class="product-badge ${pClass}">${det.class}</span>
            <div style="font-size: 0.75rem; color: #64748B; margin-top: 0.25rem; font-family: var(--font-mono);">
              BBox: [${bboxStr}]
            </div>
          </div>
          <div style="text-align: right;">
            <span class="conf-pill" style="color: ${confPct >= 90 ? '#059669' : '#D97706'}; font-size: 0.95rem;">${confPct}%</span>
            <div style="font-size: 0.7rem; color: #10B981; font-weight: 600;">Saved to DB</div>
          </div>
        </div>
      `;
    }).join('');
  }
};

document.addEventListener('DOMContentLoaded', () => {
  ImageDetectModule.init();
});
