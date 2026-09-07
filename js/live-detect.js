/**
 * VisionaryAI Live Camera Detection Engine
 * Integrates WebRTC camera stream with Ultralytics YOLO detection pipeline (C:\yolo\best.pt),
 * canvas bounding box rendering, telemetry tickers, and presentation HUD.
 * 
 * Configured Professional Settings:
 * - Model: C:\yolo\best.pt (Trident, Donut, Pickers, Bahia)
 * - Minimum Hard Confidence Threshold: 0.70 (70%)
 * - IoU Threshold: 0.45
 * - Maximum Detections: 10
 * - Minimum Detection Size: 20 px
 * - Detection Stability: ON (Required Stable Detection: 3 consecutive frames)
 * - Duplicate Detection Prevention: ON (Detection Cooldown: 1.0 second)
 * - Save Detection History: ON
 * - Save Detection Images: OFF (Camera frames/images are NOT saved automatically)
 * - Display: Bounding Boxes (ON), Confidence Score (ON), Product Name (ON), FPS Counter (ON)
 * - Camera Source: Logitech C270 HD Webcam (1280x720 @ 30 FPS)
 */

const LiveDetectModule = {
  videoEl: null,
  canvasEl: null,
  ctx: null,
  stream: null,
  isRunning: false,
  isPaused: false,
  wasDetecting: false,

  // Live Settings (Synced with SettingsModule & LocalStorage / API)
  settings: {
    confidence_threshold: 0.70,
    iou_threshold: 0.45,
    max_detections: 10,
    min_detection_size: 20,
    detection_stability: "ON",
    required_stable_frames: 3,
    duplicate_prevention: "ON",
    detection_cooldown: 1.0,
    object_tracking_enabled: "ON",
    max_missed_frames: 5,
    save_detection_history: "ON",
    save_detection_images: "OFF",
    display_bounding_boxes: "ON",
    display_confidence_score: "ON",
    display_product_name: "ON",
    fps_counter: "ON",
    camera_source: "Logitech C270 HD Webcam",
    resolution: "1280x720",
    frame_rate: 30,
    camera_orientation: "Normal",
    mirror_camera: "OFF",
    auto_exposure: "ON",
    auto_focus: "ON"
  },

  // Object identity/lifecycle (WAITING -> TRACKING -> EXIT -> RESET) is tracked
  // server-side per physical product (see backend/tracking.py) — the frontend
  // just samples frames and reflects whatever the backend reports back.
  animationFrameId: null,
  lastInferenceTime: 0,
  fpsCounter: 0,
  frameCount: 0,
  lastFpsTimestamp: performance.now(),
  currentDetections: [],

  parseConfidence(val) {
    if (val === null || val === undefined) return 0.0;
    if (typeof val === 'string') {
      val = parseFloat(val.replace('%', ''));
    }
    if (typeof val !== 'number' || isNaN(val)) return 0.0;
    if (val > 1.0) {
      val = val / 100.0;
    }
    return Math.max(0.0, Math.min(1.0, val));
  },

  init() {
    this.videoEl = document.getElementById('liveVideo');
    this.canvasEl = document.getElementById('liveOverlayCanvas');
    if (!this.canvasEl || !this.videoEl) return;
    this.ctx = this.canvasEl.getContext('2d');

    // This module's init() is called both on page load (js/live-detect.js's own
    // DOMContentLoaded listener below) and every time the user navigates to the
    // Live Detection tab (dashboard.js's switchView). Guard the one-time wiring
    // so repeated visits don't stack duplicate click/resize listeners, which
    // would otherwise fire startCamera()/stopCamera() multiple times per click.
    if (!this._listenersBound) {
      this._listenersBound = true;

      // Controls
      const btnStart = document.getElementById('btnStartCamera');
      const btnStop = document.getElementById('btnStopCamera');
      const btnPause = document.getElementById('btnPauseCamera');
      const btnSnapshot = document.getElementById('btnCaptureSnapshot');
      const btnFullscreen = document.getElementById('btnFullscreenLive');
      const confSlider = document.getElementById('liveConfSlider');
      const confValLabel = document.getElementById('liveConfVal');

      if (btnStart) btnStart.addEventListener('click', () => this.startCamera());
      if (btnStop) btnStop.addEventListener('click', () => this.stopCamera());
      if (btnPause) btnPause.addEventListener('click', () => this.togglePause());
      if (btnSnapshot) btnSnapshot.addEventListener('click', () => this.captureSnapshot());
      if (btnFullscreen) btnFullscreen.addEventListener('click', () => this.toggleFullscreen());

      if (confSlider) {
        confSlider.value = "70";
        confSlider.min = "70";
        confSlider.max = "95";
        if (confValLabel) confValLabel.textContent = "70%";
        this.settings.confidence_threshold = 0.70;

        confSlider.addEventListener('input', (e) => {
          const val = parseFloat(e.target.value);
          this.settings.confidence_threshold = Math.max(0.70, val / 100);
          if (confValLabel) confValLabel.textContent = `${Math.round(this.settings.confidence_threshold * 100)}%`;
        });
      }

      // Window resize observer
      window.addEventListener('resize', () => this.resizeCanvas());
    }

    // Re-sync settings every time the view is entered (e.g. after editing them
    // on the Settings page), even though listeners only attach once above.
    this.loadSavedSettings();
  },

  loadSavedSettings() {
    const stored = localStorage.getItem('visionaryai_settings');
    if (stored) {
      try {
        const parsed = JSON.parse(stored);
        this.applySettings(parsed);
      } catch (e) {}
    }
  },

  applySettings(newSettings) {
    if (!newSettings) return;

    if (newSettings.confidence_threshold) {
      this.settings.confidence_threshold = Math.max(0.70, parseFloat(newSettings.confidence_threshold));
    }
    if (newSettings.iou_threshold) {
      this.settings.iou_threshold = parseFloat(newSettings.iou_threshold);
    }
    if (newSettings.max_detections) {
      this.settings.max_detections = parseInt(newSettings.max_detections, 10);
    }
    if (newSettings.min_detection_size) {
      this.settings.min_detection_size = parseFloat(newSettings.min_detection_size);
    }

    this.settings.detection_stability = newSettings.detection_stability || "ON";
    this.settings.required_stable_frames = parseInt(newSettings.required_stable_frames || "3", 10);
    this.settings.duplicate_prevention = newSettings.duplicate_prevention || "ON";
    this.settings.detection_cooldown = parseFloat(newSettings.detection_cooldown || "1.0");
    this.settings.object_tracking_enabled = newSettings.object_tracking_enabled || "ON";
    this.settings.max_missed_frames = parseInt(newSettings.max_missed_frames || "5", 10);
    this.settings.save_detection_history = newSettings.save_detection_history || "ON";
    this.settings.save_detection_images = newSettings.save_detection_images || "OFF";

    this.settings.display_bounding_boxes = newSettings.display_bounding_boxes || "ON";
    this.settings.display_confidence_score = newSettings.display_confidence_score || "ON";
    this.settings.display_product_name = newSettings.display_product_name || "ON";
    this.settings.fps_counter = newSettings.fps_counter || "ON";

    this.settings.camera_source = newSettings.camera_source || "Logitech C270 HD Webcam";
    this.settings.resolution = newSettings.resolution || "1280x720";
    this.settings.frame_rate = parseInt(newSettings.frame_rate || "30", 10);
    this.settings.camera_orientation = newSettings.camera_orientation || "Normal";
    this.settings.mirror_camera = newSettings.mirror_camera || "OFF";
    this.settings.auto_exposure = newSettings.auto_exposure || "ON";
    this.settings.auto_focus = newSettings.auto_focus || "ON";

    // FPS Display toggle
    const fpsEl = document.getElementById('liveFpsVal');
    if (fpsEl) {
      fpsEl.style.display = this.settings.fps_counter === 'ON' ? 'inline-block' : 'none';
    }

    // Camera transform styling
    if (this.videoEl) {
      let transformStr = '';
      if (this.settings.mirror_camera === 'ON') {
        transformStr += 'scaleX(-1) ';
      }
      if (this.settings.camera_orientation === '90deg') transformStr += 'rotate(90deg) ';
      if (this.settings.camera_orientation === '180deg') transformStr += 'rotate(180deg) ';
      if (this.settings.camera_orientation === '270deg') transformStr += 'rotate(270deg) ';
      
      this.videoEl.style.transform = transformStr.trim();
    }
  },

  resizeCanvas() {
    if (!this.canvasEl || !this.videoEl) return;
    const rect = this.videoEl.getBoundingClientRect();
    this.canvasEl.width = rect.width;
    this.canvasEl.height = rect.height;
  },

  async startCamera() {
    const placeholder = document.getElementById('videoPlaceholder');
    const errorBanner = document.getElementById('cameraErrorBanner');
    if (errorBanner) errorBanner.classList.add('hidden');

    let [targetW, targetH] = [1280, 720];
    if (this.settings.resolution) {
      const parts = this.settings.resolution.split('x');
      if (parts.length === 2) {
        targetW = parseInt(parts[0], 10);
        targetH = parseInt(parts[1], 10);
      }
    }

    const videoConstraints = {
      width: { ideal: targetW },
      height: { ideal: targetH },
      frameRate: { ideal: this.settings.frame_rate || 30 },
      facingMode: 'environment'
    };

    // Try finding specified camera device (e.g. Logitech C270)
    try {
      const devices = await navigator.mediaDevices.enumerateDevices();
      const match = devices.find(d => d.kind === 'videoinput' && (d.deviceId === this.settings.camera_source || d.label.includes('C270')));
      if (match) {
        videoConstraints.deviceId = { exact: match.deviceId };
      }
    } catch (e) {}

    try {
      this.stream = await navigator.mediaDevices.getUserMedia({
        video: videoConstraints,
        audio: false
      });

      this.videoEl.srcObject = this.stream;
      await this.videoEl.play();

      this.isRunning = true;
      this.isPaused = false;
      if (placeholder) placeholder.classList.add('hidden');

      this.updateButtonStates();
      this.resizeCanvas();
      // Fresh session -> fresh WAITING state server-side, so no stale track IDs
      // from a previous session ever leak in.
      Api.resetTracking().catch(() => {});
      this.runDetectionLoop();
    } catch (err) {
      console.warn('Primary camera access note, falling back to default video input:', err);
      // Fallback camera constraints if exact device/resolution rejected
      try {
        this.stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
        this.videoEl.srcObject = this.stream;
        await this.videoEl.play();
        this.isRunning = true;
        this.isPaused = false;
        if (placeholder) placeholder.classList.add('hidden');
        this.updateButtonStates();
        this.resizeCanvas();
        Api.resetTracking().catch(() => {});
        this.runDetectionLoop();
      } catch (fallbackErr) {
        console.error('Camera access failed:', fallbackErr);
        if (errorBanner) {
          errorBanner.classList.remove('hidden');
          errorBanner.textContent = 'Camera feed unavailable. Please check camera permissions or USB webcam connection.';
        }
      }
    }
  },

  stopCamera() {
    if (this.stream) {
      this.stream.getTracks().forEach(track => track.stop());
      this.stream = null;
    }
    this.isRunning = false;
    this.isPaused = false;
    this.currentDetections = [];
    this._backendOfflineNotified = false;

    if (this.animationFrameId) {
      cancelAnimationFrame(this.animationFrameId);
    }

    const placeholder = document.getElementById('videoPlaceholder');
    if (placeholder) placeholder.classList.remove('hidden');

    if (this.ctx && this.canvasEl) {
      this.ctx.clearRect(0, 0, this.canvasEl.width, this.canvasEl.height);
    }

    this.updateButtonStates();
    this.updateTelemetry(null, 0, 0);
  },

  togglePause() {
    if (!this.isRunning) return;
    this.isPaused = !this.isPaused;
    if (this.isPaused) {
      this.videoEl.pause();
    } else {
      this.videoEl.play();
      this.runDetectionLoop();
    }
    this.updateButtonStates();
  },

  updateButtonStates() {
    const btnStart = document.getElementById('btnStartCamera');
    const btnStop = document.getElementById('btnStopCamera');
    const btnPause = document.getElementById('btnPauseCamera');
    const pauseText = document.getElementById('pauseBtnText');
    const feedCard = document.getElementById('videoFeedCard');

    if (btnStart) btnStart.disabled = this.isRunning;
    if (btnStop) btnStop.disabled = !this.isRunning;
    if (btnPause) {
      btnPause.disabled = !this.isRunning;
      if (pauseText) pauseText.textContent = this.isPaused ? 'Resume' : 'Pause';
    }
    if (feedCard) feedCard.classList.toggle('is-live', this.isRunning && !this.isPaused);
  },

  runDetectionLoop() {
    if (!this.isRunning || this.isPaused) return;

    // Calculate FPS
    const now = performance.now();
    this.frameCount++;
    if (now - this.lastFpsTimestamp >= 1000) {
      this.fpsCounter = Math.round((this.frameCount * 1000) / (now - this.lastFpsTimestamp));
      this.frameCount = 0;
      this.lastFpsTimestamp = now;
      const fpsEl = document.getElementById('liveFpsVal');
      if (fpsEl && this.settings.fps_counter === 'ON') {
        fpsEl.style.display = 'inline-block';
        fpsEl.textContent = `${this.fpsCounter} FPS`;
      }
    }

    // Sample inference frame every 240ms
    if (now - this.lastInferenceTime > 240) {
      this.lastInferenceTime = now;
      this.processVideoFrame();
    }

    // Render Bounding Boxes
    this.renderBoundingBoxes();

    this.animationFrameId = requestAnimationFrame(() => this.runDetectionLoop());
  },

  async processVideoFrame() {
    if (!this.videoEl || this.videoEl.readyState < 2) return;

    // Draw frame to offscreen canvas
    const offCanvas = document.createElement('canvas');
    offCanvas.width = 640;
    offCanvas.height = 480;
    const offCtx = offCanvas.getContext('2d');
    offCtx.drawImage(this.videoEl, 0, 0, offCanvas.width, offCanvas.height);
    const frameData = offCanvas.toDataURL('image/jpeg', 0.8);

    const startTime = performance.now();
    try {
      const effectiveConf = Math.max(0.70, this.settings.confidence_threshold);
      const effectiveIou = this.settings.iou_threshold || 0.45;
      const effectiveMaxDet = this.settings.max_detections || 10;
      const effectiveMinSize = this.settings.min_detection_size || 20;

      // A physical product = ONE Detection History record, written by the
      // backend's object tracker only once it genuinely leaves the camera
      // zone (see backend/tracking.py) — not once per frame it's visible in.
      // `track: true` tells the backend to run the tracker instead of a
      // stateless single-frame detect; the resulting exit events (if any)
      // come back in `result.exited`.
      const result = await Api.detectImage(
        frameData,
        'Live Camera',
        effectiveConf,
        effectiveIou,
        this.settings.save_detection_history === 'ON',
        this.settings.save_detection_images === 'ON',
        {
          track: true,
          object_tracking_enabled: this.settings.object_tracking_enabled,
          max_missed_frames: this.settings.max_missed_frames,
          detection_stability: this.settings.detection_stability,
          required_stable_frames: this.settings.required_stable_frames,
          duplicate_prevention: this.settings.duplicate_prevention,
          detection_cooldown: this.settings.detection_cooldown
        }
      );
      const latency = Math.round(performance.now() - startTime);

      // Api.detectImage() swallows network/HTTP failures and returns
      // { status: "offline" } with an empty detections array so the detection
      // loop never throws. Left unchecked this is indistinguishable from
      // "camera sees nothing" — surface it explicitly instead of staying silent.
      if (result && result.status === 'offline') {
        this.handleBackendOffline();
        return;
      }
      this.clearBackendOfflineState();

      const rawDetections = (result && result.detections) ? result.detections : [];
      const activeTracks = (result && result.active_tracks) ? result.active_tracks : [];
      const exitedTracks = (result && result.exited) ? result.exited : [];

      // Hard confidence & min-size filtering — for the live bounding-box overlay only.
      // Whether a product ever gets SAVED to history is decided entirely
      // server-side by the tracker's lifecycle, not by anything here.
      const validDetections = [];
      for (const det of rawDetections) {
        const normConf = this.parseConfidence(det.confidence);
        const [x1, y1, x2, y2] = det.bbox || [0, 0, 0, 0];
        const boxW = (x2 - x1) * offCanvas.width;
        const boxH = (y2 - y1) * offCanvas.height;

        if (normConf >= 0.70 && normConf >= effectiveConf && boxW >= effectiveMinSize && boxH >= effectiveMinSize) {
          det.confidence = normConf;
          validDetections.push(det);
        }
      }

      this.currentDetections = validDetections.slice(0, effectiveMaxDet);

      // Prefer a track that's actually reached TRACKING state (confirmed
      // stable) for the telemetry readout, so the UI doesn't flicker onto a
      // not-yet-confirmed candidate.
      const confirmedTrack = activeTracks.find(t => t.state === 'TRACKING');

      if (this.currentDetections.length > 0) {
        this.updateTelemetry(this.currentDetections[0], latency, this.currentDetections.length, confirmedTrack);
      } else {
        this.updateTelemetry(null, latency, 0, null);
      }

      if (exitedTracks.length > 0) {
        this.handleExitEvents(exitedTracks);
      }
    } catch (e) {
      console.warn('Frame detection skipped:', e);
      this.currentDetections = [];
      this.updateTelemetry(null, 0, 0, null);
    }
  },

  handleExitEvents(exitedTracks) {
    exitedTracks.forEach(ev => {
      if (typeof showToast === 'function') {
        showToast(`${ev.class} left the camera zone — saved to Detection History.`, 'success', 3000);
      }
    });

    const trackIdEl = document.getElementById('liveTrackingId');
    if (trackIdEl && exitedTracks.length > 0) {
      trackIdEl.classList.remove('hidden');
      trackIdEl.textContent = `${exitedTracks[0].class} — EXIT DETECTED`;
      // updateTelemetry() runs every ~240ms and would otherwise immediately
      // overwrite this with the current tracking-id state (or hide it) on
      // the very next frame — hold it off until the flash window elapses.
      this._exitFlashUntil = Date.now() + 1500;
      clearTimeout(this._exitFlashTimeout);
      this._exitFlashTimeout = setTimeout(() => {
        this._exitFlashUntil = 0;
        trackIdEl.classList.add('hidden');
      }, 1500);
    }
  },

  renderBoundingBoxes() {
    if (!this.ctx || !this.canvasEl) return;
    this.ctx.clearRect(0, 0, this.canvasEl.width, this.canvasEl.height);

    // If Bounding Boxes display toggle is OFF, return early
    if (this.settings.display_bounding_boxes === 'OFF') return;

    if (!this.currentDetections || this.currentDetections.length === 0) return;

    const w = this.canvasEl.width;
    const h = this.canvasEl.height;
    const effectiveConf = Math.max(0.70, this.settings.confidence_threshold);

    this.currentDetections.forEach(det => {
      const conf = this.parseConfidence(det.confidence);

      // Strict filter: ignore anything < 0.70
      if (conf < 0.70 || conf < effectiveConf) return;

      const [x1, y1, x2, y2] = det.bbox;
      const bx = x1 * w;
      const by = y1 * h;
      const bw = (x2 - x1) * w;
      const bh = (y2 - y1) * h;

      const color = det.color || '#0284C7';
      const confPct = Math.round(conf * 100);

      // Draw Rectangle Box
      this.ctx.strokeStyle = color;
      this.ctx.lineWidth = 3;
      this.ctx.strokeRect(bx, by, bw, bh);

      // Corner Accents
      const cornerLen = 16;
      this.ctx.lineWidth = 4;
      this.ctx.beginPath();
      // Top-Left
      this.ctx.moveTo(bx, by + cornerLen);
      this.ctx.lineTo(bx, by);
      this.ctx.lineTo(bx + cornerLen, by);
      // Top-Right
      this.ctx.moveTo(bx + bw - cornerLen, by);
      this.ctx.lineTo(bx + bw, by);
      this.ctx.lineTo(bx + bw, by + cornerLen);
      // Bottom-Left
      this.ctx.moveTo(bx, by + bh - cornerLen);
      this.ctx.lineTo(bx, by + bh);
      this.ctx.lineTo(bx + cornerLen, by + bh);
      // Bottom-Right
      this.ctx.moveTo(bx + bw - cornerLen, by + bh);
      this.ctx.lineTo(bx + bw, by + bh);
      this.ctx.lineTo(bx + bw, by + bh - cornerLen);
      this.ctx.stroke();

      // Build Label Text according to Display Settings
      let labelParts = [];
      if (this.settings.display_product_name !== 'OFF') {
        labelParts.push(det.class);
      }
      if (this.settings.display_confidence_score !== 'OFF') {
        labelParts.push(`${confPct}%`);
      }

      if (labelParts.length > 0) {
        const label = labelParts.join(' ');
        this.ctx.font = "bold 13px 'Plus Jakarta Sans', sans-serif";
        const textWidth = this.ctx.measureText(label).width;

        this.ctx.fillStyle = color;
        this.ctx.beginPath();
        this.ctx.roundRect(bx, Math.max(0, by - 26), textWidth + 14, 24, [4, 4, 0, 0]);
        this.ctx.fill();

        this.ctx.fillStyle = "#FFFFFF";
        this.ctx.fillText(label, bx + 7, Math.max(16, by - 9));
      }
    });
  },

  handleBackendOffline() {
    const statusEl = document.getElementById('liveDetectionStatus');
    const prodNameEl = document.getElementById('liveCurrentProduct');
    if (statusEl) {
      statusEl.className = 'health-pill offline';
      statusEl.innerHTML = '<span class="status-dot"></span> Backend Offline';
    }
    if (prodNameEl) prodNameEl.textContent = 'Detection backend unreachable';

    if (!this._backendOfflineNotified) {
      this._backendOfflineNotified = true;
      if (typeof showToast === 'function') {
        showToast('Detection backend unreachable — start python backend/app.py to resume live detection.', 'danger', 6000);
      }
      console.error('[LiveDetect] /api/detect is unreachable. The camera is running but no frames are being analyzed. Make sure "python backend/app.py" is running.');
    }
  },

  clearBackendOfflineState() {
    if (this._backendOfflineNotified) {
      this._backendOfflineNotified = false;
      if (typeof showToast === 'function') {
        showToast('Detection backend reconnected.', 'success', 3000);
      }
    }
  },

  updateTelemetry(topDetection, latencyMs, totalObjects, trackInfo) {
    const prodNameEl = document.getElementById('liveCurrentProduct');
    const confValEl = document.getElementById('liveCurrentConfidence');
    const confBarEl = document.getElementById('liveConfidenceBar');
    const latencyEl = document.getElementById('liveLatencyVal');
    const countEl = document.getElementById('liveObjectCount');
    const statusEl = document.getElementById('liveDetectionStatus');
    const detectionBox = document.getElementById('currentDetectionBox');
    const trackIdEl = document.getElementById('liveTrackingId');

    // Let a just-fired "EXIT DETECTED" flash finish its own 1.5s window
    // instead of being immediately overwritten by this frame's state.
    if (trackIdEl && !(this._exitFlashUntil && Date.now() < this._exitFlashUntil)) {
      if (trackInfo && trackInfo.track_id !== undefined && trackInfo.track_id !== null) {
        trackIdEl.classList.remove('hidden');
        trackIdEl.textContent = `Tracking ID: ${trackInfo.track_id}`;
      } else {
        trackIdEl.classList.add('hidden');
      }
    }

    let validTop = null;
    if (topDetection) {
      const conf = this.parseConfidence(topDetection.confidence);
      if (conf >= 0.70 && conf >= this.settings.confidence_threshold) {
        validTop = { ...topDetection, confidence: conf };
      }
    }

    if (validTop) {
      const confPct = Math.round(validTop.confidence * 100);
      if (prodNameEl) prodNameEl.textContent = validTop.class;
      if (confValEl) confValEl.textContent = `${confPct}%`;
      if (confBarEl) confBarEl.style.width = `${confPct}%`;
      if (statusEl) {
        statusEl.className = 'health-pill online';
        statusEl.innerHTML = '<span class="status-dot"></span> Detected';
      }
      if (detectionBox) {
        detectionBox.classList.add('is-detecting');
        // Only replay the confirmation pulse on the rising edge (new detection),
        // never every frame while a product stays in view.
        if (!this.wasDetecting) {
          detectionBox.classList.remove('detect-flash');
          void detectionBox.offsetWidth; // restart the CSS animation
          detectionBox.classList.add('detect-flash');
        }
      }
      this.wasDetecting = true;
    } else {
      if (prodNameEl) prodNameEl.textContent = 'No product detected';
      if (confValEl) confValEl.textContent = '0%';
      if (confBarEl) confBarEl.style.width = '0%';
      if (statusEl) {
        statusEl.className = 'health-pill';
        statusEl.innerHTML = '<span class="status-dot"></span> Standby';
      }
      if (detectionBox) detectionBox.classList.remove('is-detecting', 'detect-flash');
      this.wasDetecting = false;
    }

    if (latencyEl) latencyEl.textContent = `${latencyMs || 0}ms`;
    if (countEl) countEl.textContent = `${totalObjects || 0} Products`;
  },

  captureSnapshot() {
    if (!this.videoEl || !this.isRunning) return;
    const snapCanvas = document.createElement('canvas');
    snapCanvas.width = this.videoEl.videoWidth || 640;
    snapCanvas.height = this.videoEl.videoHeight || 480;
    const sCtx = snapCanvas.getContext('2d');
    sCtx.drawImage(this.videoEl, 0, 0);

    const dataUrl = snapCanvas.toDataURL('image/jpeg', 0.9);
    Api.detectImage(
      dataUrl,
      'Camera Snapshot',
      Math.max(0.70, this.settings.confidence_threshold),
      this.settings.iou_threshold || 0.45,
      true,
      this.settings.save_detection_images === 'ON'
    ).then(res => {
      const dets = (res.detections || []).filter(d => this.parseConfidence(d.confidence) >= 0.70);
      if (dets.length > 0) {
        const names = dets.map(d => `${d.class} (${Math.round(this.parseConfidence(d.confidence) * 100)}%)`).join(', ');
        alert(`Snapshot captured! Detected: ${names}. Saved to history.`);
      } else {
        alert('Snapshot captured! No product detected with confidence ≥ 70%.');
      }
    }).catch(err => {
      console.error('Snapshot failed', err);
    });
  },

  toggleFullscreen() {
    const card = document.getElementById('videoFeedCard');
    if (!card) return;

    if (!document.fullscreenElement) {
      if (card.requestFullscreen) {
        card.requestFullscreen();
      }
      card.classList.add('is-fullscreen');
    } else {
      if (document.exitFullscreen) {
        document.exitFullscreen();
      }
      card.classList.remove('is-fullscreen');
    }
    setTimeout(() => this.resizeCanvas(), 200);
  }
};

document.addEventListener('DOMContentLoaded', () => {
  LiveDetectModule.init();
});
