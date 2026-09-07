/**
 * VisionaryAI Settings Module
 * Manages live detection parameters, inference controls, camera source, and user profile.
 */

const SettingsModule = {
  activeSettings: {
    confidence_threshold: "0.70",
    iou_threshold: "0.45",
    max_detections: "10",
    min_detection_size: "20",
    detection_stability: "ON",
    required_stable_frames: "3",
    duplicate_prevention: "ON",
    detection_cooldown: "1.0",
    object_tracking_enabled: "ON",
    max_missed_frames: "5",
    save_detection_history: "ON",
    save_detection_images: "OFF",
    display_bounding_boxes: "ON",
    display_confidence_score: "ON",
    display_product_name: "ON",
    fps_counter: "ON",
    camera_source: "Logitech C270 HD Webcam",
    resolution: "1280x720",
    frame_rate: "30",
    camera_orientation: "Normal",
    mirror_camera: "OFF",
    auto_exposure: "ON",
    auto_focus: "ON"
  },

  init() {
    const form = document.getElementById('settingsForm');
    const profileForm = document.getElementById('profileForm');
    const confSlider = document.getElementById('settingConfSlider');
    const confVal = document.getElementById('settingConfVal');
    const iouSlider = document.getElementById('settingIouSlider');
    const iouVal = document.getElementById('settingIouVal');

    if (confSlider && confVal) {
      confSlider.addEventListener('input', (e) => {
        confVal.textContent = `${e.target.value}%`;
      });
    }

    if (iouSlider && iouVal) {
      iouSlider.addEventListener('input', (e) => {
        iouVal.textContent = `${e.target.value}%`;
      });
    }

    if (form) {
      form.addEventListener('submit', async (e) => {
        e.preventDefault();
        
        const updated = {
          confidence_threshold: (Math.max(70, parseFloat(confSlider ? confSlider.value : 70)) / 100).toString(),
          iou_threshold: (parseFloat(iouSlider ? iouSlider.value : 45) / 100).toString(),
          max_detections: document.getElementById('settingMaxDetections')?.value || "10",
          min_detection_size: document.getElementById('settingMinDetectionSize')?.value || "20",
          detection_stability: document.getElementById('settingDetectionStability')?.value || "ON",
          required_stable_frames: document.getElementById('settingRequiredStableFrames')?.value || "3",
          duplicate_prevention: document.getElementById('settingDuplicatePrevention')?.value || "ON",
          detection_cooldown: document.getElementById('settingDetectionCooldown')?.value || "1.0",
          object_tracking_enabled: document.getElementById('settingObjectTracking')?.value || "ON",
          max_missed_frames: document.getElementById('settingMaxMissedFrames')?.value || "5",
          save_detection_history: document.getElementById('settingSaveDetectionHistory')?.value || "ON",
          save_detection_images: document.getElementById('settingSaveDetectionImages')?.value || "OFF",
          display_bounding_boxes: document.getElementById('settingDisplayBoundingBoxes')?.value || "ON",
          display_confidence_score: document.getElementById('settingDisplayConfidenceScore')?.value || "ON",
          display_product_name: document.getElementById('settingDisplayProductName')?.value || "ON",
          fps_counter: document.getElementById('settingFpsCounter')?.value || "ON",
          camera_source: document.getElementById('settingCameraSource')?.value || "Logitech C270 HD Webcam",
          resolution: document.getElementById('settingResolution')?.value || "1280x720",
          frame_rate: document.getElementById('settingFrameRate')?.value || "30",
          camera_orientation: document.getElementById('settingCameraOrientation')?.value || "Normal",
          mirror_camera: document.getElementById('settingMirrorCamera')?.value || "OFF",
          auto_exposure: document.getElementById('settingAutoExposure')?.value || "ON",
          auto_focus: document.getElementById('settingAutoFocus')?.value || "ON"
        };

        this.activeSettings = { ...this.activeSettings, ...updated };
        localStorage.setItem('visionaryai_settings', JSON.stringify(this.activeSettings));

        try {
          await Api.updateSettings(updated);
        } catch (err) {
          console.warn('Backend settings sync skipped:', err);
        }

        if (window.LiveDetectModule && LiveDetectModule.applySettings) {
          LiveDetectModule.applySettings(this.activeSettings);
        }

        if (typeof showToast === 'function') {
          showToast('Live Detection Settings saved & applied successfully.', 'success');
        } else {
          alert('Live Detection Settings saved & applied successfully.');
        }
      });
    }

    if (profileForm) {
      profileForm.addEventListener('submit', (e) => {
        e.preventDefault();
        const nameInput = document.getElementById('profileNameInput')?.value;
        const emailInput = document.getElementById('profileEmailInput')?.value;

        if (Auth && Auth.updateProfile) {
          Auth.updateProfile(nameInput, emailInput);
        }
        if (typeof showToast === 'function') {
          showToast('Profile details updated successfully.', 'success');
        } else {
          alert('Profile details updated for Anas Hamma.');
        }
      });
    }

    this.populateCameraDevices();
    this.loadSettings();
    this.loadInventory();
  },

  async loadInventory() {
    const list = document.getElementById('inventoryManageList');
    if (!list) return;

    try {
      const items = await Api.getInventory();
      if (!items || items.length === 0) {
        list.innerHTML = `<div style="text-align: center; padding: var(--space-6); color: var(--text-muted);">No inventory data available.</div>`;
        return;
      }

      list.innerHTML = items.map(item => `
        <div class="inventory-manage-row" data-product="${item.product_name}">
          <span class="inventory-manage-label">${item.product_name} <span style="color: var(--text-subtle); font-weight: 400;">(currently ${item.stock_quantity})</span></span>
          <input type="number" class="inventory-manage-input" min="0" step="1" value="${item.stock_quantity}" aria-label="Set stock for ${item.product_name}">
          <button type="button" class="btn-ctrl">Update</button>
        </div>
      `).join('');

      list.querySelectorAll('.inventory-manage-row').forEach(row => {
        const product = row.getAttribute('data-product');
        const input = row.querySelector('.inventory-manage-input');
        const btn = row.querySelector('button');

        btn.addEventListener('click', async () => {
          const value = parseInt(input.value, 10);
          if (isNaN(value) || value < 0 || String(value) !== input.value.trim()) {
            if (typeof showToast === 'function') showToast('Stock must be a non-negative whole number.', 'danger');
            return;
          }

          btn.disabled = true;
          const originalText = btn.textContent;
          btn.textContent = 'Saving…';

          try {
            await Api.updateInventory(product, value);
            if (typeof showToast === 'function') {
              showToast(`${product} stock set to ${value}.`, 'success');
            }
            const label = row.querySelector('.inventory-manage-label');
            if (label) label.innerHTML = `${product} <span style="color: var(--text-subtle); font-weight: 400;">(currently ${value})</span>`;
            if (window.updateInventoryDisplay) window.updateInventoryDisplay();
          } catch (err) {
            if (typeof showToast === 'function') {
              showToast(err.message || 'Failed to update inventory.', 'danger');
            }
          } finally {
            btn.disabled = false;
            btn.textContent = originalText;
          }
        });
      });
    } catch (e) {
      list.innerHTML = `<div style="text-align: center; padding: var(--space-6); color: var(--color-rose);">Unable to load inventory. Check the backend connection.</div>`;
    }
  },

  async populateCameraDevices() {
    const select = document.getElementById('settingCameraSource');
    if (!select || !navigator.mediaDevices || !navigator.mediaDevices.enumerateDevices) return;

    try {
      const devices = await navigator.mediaDevices.enumerateDevices();
      const videoDevices = devices.filter(d => d.kind === 'videoinput');

      if (videoDevices.length > 0) {
        select.innerHTML = videoDevices.map((d, i) => {
          const label = d.label || (d.label.includes('C270') ? 'Logitech C270 HD Webcam' : `Camera ${i + 1}`);
          return `<option value="${d.deviceId}">${label}</option>`;
        }).join('');
      }
    } catch (e) {
      console.warn('Camera device enumeration skipped:', e);
    }
  },

  async loadSettings() {
    // 1. Check LocalStorage
    const stored = localStorage.getItem('visionaryai_settings');
    if (stored) {
      try {
        this.activeSettings = { ...this.activeSettings, ...JSON.parse(stored) };
      } catch (e) {}
    }

    // 2. Fetch from backend if available
    try {
      const backendSettings = await Api.getSettings();
      if (backendSettings && Object.keys(backendSettings).length > 0) {
        this.activeSettings = { ...this.activeSettings, ...backendSettings };
      }
    } catch (err) {}

    // Enforce 0.70 minimum
    if (parseFloat(this.activeSettings.confidence_threshold) < 0.70) {
      this.activeSettings.confidence_threshold = "0.70";
    }

    // Populate UI elements
    const setVal = (id, val) => {
      const el = document.getElementById(id);
      if (el) el.value = val;
    };

    const confSlider = document.getElementById('settingConfSlider');
    const confVal = document.getElementById('settingConfVal');
    const iouSlider = document.getElementById('settingIouSlider');
    const iouVal = document.getElementById('settingIouVal');

    if (confSlider) {
      const pct = Math.max(70, Math.round(parseFloat(this.activeSettings.confidence_threshold) * 100));
      confSlider.value = pct;
      if (confVal) confVal.textContent = `${pct}%`;
    }

    if (iouSlider) {
      const pct = Math.round(parseFloat(this.activeSettings.iou_threshold) * 100);
      iouSlider.value = pct;
      if (iouVal) iouVal.textContent = `${pct}%`;
    }

    setVal('settingMaxDetections', this.activeSettings.max_detections);
    setVal('settingMinDetectionSize', this.activeSettings.min_detection_size);
    setVal('settingDetectionStability', this.activeSettings.detection_stability);
    setVal('settingRequiredStableFrames', this.activeSettings.required_stable_frames);
    setVal('settingDuplicatePrevention', this.activeSettings.duplicate_prevention);
    setVal('settingDetectionCooldown', this.activeSettings.detection_cooldown);
    setVal('settingObjectTracking', this.activeSettings.object_tracking_enabled);
    setVal('settingMaxMissedFrames', this.activeSettings.max_missed_frames);
    setVal('settingSaveDetectionHistory', this.activeSettings.save_detection_history);
    setVal('settingSaveDetectionImages', this.activeSettings.save_detection_images);
    setVal('settingDisplayBoundingBoxes', this.activeSettings.display_bounding_boxes);
    setVal('settingDisplayConfidenceScore', this.activeSettings.display_confidence_score);
    setVal('settingDisplayProductName', this.activeSettings.display_product_name);
    setVal('settingFpsCounter', this.activeSettings.fps_counter);
    setVal('settingCameraSource', this.activeSettings.camera_source);
    setVal('settingResolution', this.activeSettings.resolution);
    setVal('settingFrameRate', this.activeSettings.frame_rate);
    setVal('settingCameraOrientation', this.activeSettings.camera_orientation);
    setVal('settingMirrorCamera', this.activeSettings.mirror_camera);
    setVal('settingAutoExposure', this.activeSettings.auto_exposure);
    setVal('settingAutoFocus', this.activeSettings.auto_focus);

    // Apply to LiveDetectModule
    if (window.LiveDetectModule && LiveDetectModule.applySettings) {
      LiveDetectModule.applySettings(this.activeSettings);
    }
  }
};

document.addEventListener('DOMContentLoaded', () => {
  SettingsModule.init();
});
