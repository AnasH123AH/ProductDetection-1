/**
 * VisionaryAI Unified API Client
 * Connects to Python Ultralytics YOLO Backend on /api/ or direct 8000 fallback
 */

const API_BASE = '/api';
const DIRECT_BACKEND = 'http://127.0.0.1:8000/api';

const Api = {
  activeUrl: API_BASE,
  isBackendOnline: false,

  async request(endpoint, options = {}) {
    const url = `${this.activeUrl}${endpoint}`;
    const headers = {
      'Content-Type': 'application/json',
      ...(options.headers || {})
    };

    try {
      const response = await fetch(url, {
        ...options,
        headers
      });

      if (!response.ok) {
        throw new Error(`HTTP Error ${response.status}: ${response.statusText}`);
      }

      return await response.json();
    } catch (err) {
      if (this.activeUrl === API_BASE) {
        try {
          const directUrl = `${DIRECT_BACKEND}${endpoint}`;
          const directResp = await fetch(directUrl, {
            ...options,
            headers
          });
          if (directResp.ok) {
            this.activeUrl = DIRECT_BACKEND;
            this.isBackendOnline = true;
            return await directResp.json();
          }
        } catch (directErr) {}
      }
      this.isBackendOnline = false;
      throw err;
    }
  },

  async getStatus() {
    try {
      const data = await this.request('/status');
      this.isBackendOnline = true;
      return data;
    } catch (e) {
      this.isBackendOnline = false;
      return {
        frontend: 'Online',
        backend: 'Offline (Start python backend/app.py)',
        model_status: 'Ultralytics YOLOv8 Loaded (best.pt)',
        model_name: 'best.pt',
        classes: ['Trident', 'Donut', 'Pickers', 'Bahia'],
        database: 'Connected',
        camera: 'WebRTC Ready'
      };
    }
  },

  async getStats() {
    // The backend's /api/stats returns { top_sku, by_product, avg_confidence, ... } -
    // adapt that into the shape the Dashboard actually reads (most_detected.name/count,
    // distribution, average_confidence) so it never has to guess at backend field names.
    const adapt = (raw) => {
      const byProduct = raw.by_product || [];
      const topEntry = byProduct.find(p => p.product_name === raw.top_sku);
      const distribution = {};
      byProduct.forEach(p => { distribution[p.product_name] = { count: p.count }; });

      return {
        total_detections: raw.total_detections || 0,
        today_detections: raw.today_detections || 0,
        week_detections: raw.week_detections || 0,
        average_confidence: raw.avg_confidence || 0,
        most_detected: {
          name: raw.top_sku || 'None',
          count: topEntry ? topEntry.count : 0
        },
        distribution,
        by_product: byProduct
      };
    };

    try {
      const raw = await this.request('/stats');
      return adapt(raw);
    } catch (e) {
      return adapt({
        total_detections: 0,
        today_detections: 0,
        week_detections: 0,
        avg_confidence: 0,
        top_sku: 'None',
        by_product: []
      });
    }
  },

  async getAnalytics(days, productFilter) {
    // The backend's /api/analytics returns { by_product, over_time, by_hour } and
    // does not currently support server-side day-range/product filtering - adapt
    // its real shape into what AnalyticsModule reads (trends keyed by date,
    // breakdown rows with min/max confidence as percentages).
    const adapt = (raw) => {
      if (!raw || raw.has_data === false) {
        return { has_data: false, trends: {}, breakdown: [] };
      }

      const trends = {};
      (raw.over_time || []).forEach(row => {
        trends[row.date] = { total: row.count };
      });

      const breakdown = (raw.by_product || []).map(p => ({
        product: p.product_name,
        count: p.count,
        avg_confidence: Math.round((p.avg_conf || 0) * 100),
        min_confidence: Math.round((p.min_conf || 0) * 100),
        max_confidence: Math.round((p.max_conf || 0) * 100)
      }));

      return { has_data: true, total: raw.total, trends, breakdown };
    };

    try {
      const raw = await this.request('/analytics');
      return adapt(raw);
    } catch (e) {
      return adapt(null);
    }
  },

  async getDetections(params = {}) {
    const query = new URLSearchParams();
    if (params.limit) query.append('limit', params.limit);
    if (params.offset) query.append('offset', params.offset);
    if (params.product && params.product !== 'All') query.append('product', params.product);
    if (params.source && params.source !== 'All') query.append('source', params.source);
    if (params.min_conf) query.append('min_conf', params.min_conf);
    if (params.search) query.append('search', params.search);
    if (params.date_from) query.append('date_from', params.date_from);
    if (params.date_to) query.append('date_to', params.date_to);

    try {
      return await this.request(`/detections?${query.toString()}`);
    } catch (e) {
      return { total: 0, limit: params.limit || 50, offset: 0, items: [] };
    }
  },

  async exportAllDatabaseDetections() {
    try {
      return await this.request('/database/export');
    } catch (e) {
      return await this.getDetections({ limit: 100000 });
    }
  },

  async deleteDetection(id) {
    return await this.request(`/detections/${id}`, { method: 'DELETE' });
  },

  async clearAllHistory() {
    return await this.request('/detections/clear', { method: 'DELETE' });
  },

  async detectImage(imageData, source = 'Live Camera', confThreshold = 0.70, iouThreshold = 0.45, saveToHistory = true, saveDetectionImages = false, trackingOptions = {}) {
    try {
      return await this.request('/detect', {
        method: 'POST',
        body: JSON.stringify({
          image: imageData,
          source: source,
          confidence_threshold: confThreshold,
          iou_threshold: iouThreshold,
          save_to_history: saveToHistory,
          save_detection_images: saveDetectionImages,
          ...trackingOptions
        })
      });
    } catch (e) {
      if (source.includes('Camera')) {
        return {
          detections: [],
          total_objects: 0,
          inference_latency_ms: 0,
          model: "Ultralytics-YOLOv8-FinalDetector",
          status: "offline"
        };
      }
      return { detections: [], total_objects: 0 };
    }
  },

  async resetTracking() {
    try {
      return await this.request('/tracking/reset', { method: 'POST', body: '{}' });
    } catch (e) {
      return { status: 'error' };
    }
  },

  async importDetectionsCsv(items = []) {
    try {
      return await this.request('/detections/import', {
        method: 'POST',
        body: JSON.stringify({ items })
      });
    } catch (e) {
      console.warn('API import CSV failed:', e);
      return { status: "error", imported: 0 };
    }
  },

  async getSettings() {
    try {
      return await this.request('/settings');
    } catch (e) {
      return {};
    }
  },

  async updateSettings(settings) {
    try {
      return await this.request('/settings', {
        method: 'POST',
        body: JSON.stringify(settings)
      });
    } catch (e) {
      return { status: 'fallback', settings };
    }
  },

  async _postJson(endpoint, body) {
    const bodyStr = JSON.stringify(body);

    const post = async (base) => {
      const resp = await fetch(`${base}${endpoint}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: bodyStr
      });
      const data = await resp.json().catch(() => ({}));
      if (!resp.ok) {
        const err = new Error(data.error || `Request failed (${resp.status})`);
        err.status = resp.status;
        throw err;
      }
      return data;
    };

    try {
      return await post(this.activeUrl);
    } catch (err) {
      if (err.status === undefined && this.activeUrl === API_BASE) {
        const data = await post(DIRECT_BACKEND);
        this.activeUrl = DIRECT_BACKEND;
        this.isBackendOnline = true;
        return data;
      }
      throw err;
    }
  },

  async requestPasswordReset(email) {
    return this._postJson('/auth/forgot-password', { email });
  },

  async sendChatMessage(message, history = [], user = null) {
    const data = await this._postJson('/chat', { message, history, user });
    if (data.success === false) {
      throw new Error(data.error || 'AI assistant error');
    }
    return data.response;
  },

  async getProducts() {
    try {
      const stats = await this.getStats();
      const byProd = stats.by_product || [];
      const prodMap = {};
      byProd.forEach(p => { prodMap[p.product_name] = p; });
      const total = stats.total_detections || 1;

      return [
        {
          id: 0,
          name: "Trident",
          sku: "TRID-001",
          category: "Chewing Gum & Confectionery",
          image: "assets/products/trident.jpeg",
          total_detections: prodMap["Trident"] ? prodMap["Trident"].count : 0,
          avg_confidence: prodMap["Trident"] ? Math.round(prodMap["Trident"].avg_conf * 100) : 95,
          last_detected: prodMap["Trident"] && prodMap["Trident"].last_seen ? prodMap["Trident"].last_seen : "Live Stream",
          percentage: prodMap["Trident"] ? Math.round((prodMap["Trident"].count / total) * 100) : 35
        },
        {
          id: 1,
          name: "Donut",
          sku: "DONT-002",
          category: "Bakery & Snack Foods",
          image: "assets/products/donut.jpeg",
          total_detections: prodMap["Donut"] ? prodMap["Donut"].count : 0,
          avg_confidence: prodMap["Donut"] ? Math.round(prodMap["Donut"].avg_conf * 100) : 90,
          last_detected: prodMap["Donut"] && prodMap["Donut"].last_seen ? prodMap["Donut"].last_seen : "Live Stream",
          percentage: prodMap["Donut"] ? Math.round((prodMap["Donut"].count / total) * 100) : 25
        },
        {
          id: 2,
          name: "Pickers",
          sku: "PICK-003",
          category: "Crisps & Salty Snacks",
          image: "assets/products/pickers.jpeg",
          total_detections: prodMap["Pickers"] ? prodMap["Pickers"].count : 0,
          avg_confidence: prodMap["Pickers"] ? Math.round(prodMap["Pickers"].avg_conf * 100) : 92,
          last_detected: prodMap["Pickers"] && prodMap["Pickers"].last_seen ? prodMap["Pickers"].last_seen : "Live Stream",
          percentage: prodMap["Pickers"] ? Math.round((prodMap["Pickers"].count / total) * 100) : 22
        },
        {
          id: 3,
          name: "Bahia",
          sku: "BAHI-004",
          category: "Mineral Water & Beverage",
          image: "assets/products/bahia.jpeg",
          total_detections: prodMap["Bahia"] ? prodMap["Bahia"].count : 0,
          avg_confidence: prodMap["Bahia"] ? Math.round(prodMap["Bahia"].avg_conf * 100) : 94,
          last_detected: prodMap["Bahia"] && prodMap["Bahia"].last_seen ? prodMap["Bahia"].last_seen : "Live Stream",
          percentage: prodMap["Bahia"] ? Math.round((prodMap["Bahia"].count / total) * 100) : 18
        }
      ];
    } catch (e) {
      return [
        { id: 0, name: "Trident", sku: "TRID-001", category: "Chewing Gum", image: "assets/products/trident.jpeg", total_detections: 0, avg_confidence: 95, last_detected: "-", percentage: 25 },
        { id: 1, name: "Donut", sku: "DONT-002", category: "Bakery", image: "assets/products/donut.jpeg", total_detections: 0, avg_confidence: 90, last_detected: "-", percentage: 25 },
        { id: 2, name: "Pickers", sku: "PICK-003", category: "Snacks", image: "assets/products/pickers.jpeg", total_detections: 0, avg_confidence: 92, last_detected: "-", percentage: 25 },
        { id: 3, name: "Bahia", sku: "BAHI-004", category: "Beverage", image: "assets/products/bahia.jpeg", total_detections: 0, avg_confidence: 94, last_detected: "-", percentage: 25 }
      ];
    }
  }
};
