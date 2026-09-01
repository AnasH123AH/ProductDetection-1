/**
 * VisionaryAI Dashboard Controller
 * Handles SPA navigation, metrics rendering, interactive charts, and system health polling
 */

document.addEventListener('DOMContentLoaded', async () => {
  'use strict';

  // Enforce authentication
  Auth.requireAuth();
  const user = Auth.getUser();

  // Populate user badge in sidebar and topbar
  const userNameEl = document.getElementById('sidebarUserName');
  const userRoleEl = document.getElementById('sidebarUserRole');
  const userAvatarEl = document.getElementById('sidebarUserAvatar');
  const topbarAvatarEl = document.getElementById('topbarUserAvatar');

  if (userNameEl) userNameEl.textContent = user.name;
  if (userRoleEl) userRoleEl.textContent = user.role;
  if (userAvatarEl) userAvatarEl.textContent = user.avatar || user.name.charAt(0);
  if (topbarAvatarEl) topbarAvatarEl.textContent = user.avatar || user.name.charAt(0);

  // --- SPA Navigation ---
  const navItems = document.querySelectorAll('.nav-item');
  const viewSections = document.querySelectorAll('.view-section');
  const pageTitle = document.getElementById('pageTitle');
  const pageSubtitle = document.getElementById('pageSubtitle');

  const routeMetadata = {
    'dashboard': { title: 'Detection Dashboard', subtitle: 'Overview of automated CV product detection telemetry' },
    'live': { title: 'Live Camera Detection', subtitle: 'Real-time inference pipeline & edge camera ingestion' },
    'history': { title: 'Detection History', subtitle: 'Audited log of detected products with bounding boxes' },
    'products': { title: 'Products Catalog', subtitle: 'Target SKU definitions & model detection classes (Trident, Donut, Pickers, Bahia)' },
    'analytics': { title: 'Analytics & Insights', subtitle: 'Product distribution, detection trends, and confidence metrics' },
    'settings': { title: 'System Settings', subtitle: 'Detection thresholds, camera input, and account preferences' },
    'backend': { title: 'Backend & API Console', subtitle: 'Server health, SQLite database explorer, benchmark, and traffic logs' }
  };

  function switchView(routeId) {
    if (!routeMetadata[routeId]) routeId = 'dashboard';

    // Update Nav
    navItems.forEach(item => {
      if (item.getAttribute('data-route') === routeId) {
        item.classList.add('active');
      } else {
        item.classList.remove('active');
      }
    });

    // Update View Sections
    viewSections.forEach(section => {
      if (section.id === `view-${routeId}`) {
        section.classList.add('active');
      } else {
        section.classList.remove('active');
      }
    });

    // Update Titles
    if (pageTitle && routeMetadata[routeId]) {
      pageTitle.textContent = routeMetadata[routeId].title;
      pageSubtitle.textContent = routeMetadata[routeId].subtitle;
    }

    window.location.hash = routeId;

    // Trigger view-specific refreshes
    if (routeId === 'dashboard') loadDashboard();
    else if (routeId === 'live') { if (typeof LiveDetectModule !== 'undefined') LiveDetectModule.init(); }
    else if (routeId === 'history') { if (typeof HistoryModule !== 'undefined') HistoryModule.loadHistory(); }
    else if (routeId === 'products') { if (typeof ProductsModule !== 'undefined') ProductsModule.loadProducts(); }
    else if (routeId === 'analytics') { if (typeof AnalyticsModule !== 'undefined') AnalyticsModule.loadAnalytics(); }
    else if (routeId === 'settings') { if (typeof SettingsModule !== 'undefined') SettingsModule.loadSettings(); }
    else if (routeId === 'backend') { if (typeof BackendModule !== 'undefined') BackendModule.loadBackendView(); }
  }

  navItems.forEach(item => {
    item.addEventListener('click', (e) => {
      e.preventDefault();
      const route = item.getAttribute('data-route');
      switchView(route);
    });
  });

  // Handle URL Hash on load
  const currentHash = window.location.hash.replace('#', '') || 'dashboard';
  switchView(currentHash);

  // Logout Handlers
  const btnLogout = document.getElementById('btnLogout');
  if (btnLogout) {
    btnLogout.addEventListener('click', (e) => {
      e.preventDefault();
      Auth.logout();
    });
  }

  // Poll System Status
  async function updateSystemHealth() {
    try {
      const status = await Api.getStatus();
      const pillBackend = document.getElementById('pillBackend');
      const pillModel = document.getElementById('pillModel');
      const pillDb = document.getElementById('pillDb');

      if (pillBackend) {
        const isOnline = status.backend.toLowerCase().includes('online');
        pillBackend.className = `health-pill ${isOnline ? 'online' : 'warning'}`;
        pillBackend.innerHTML = `<span class="status-dot"></span> Backend: ${isOnline ? 'Online' : 'Standby'}`;
      }

      if (pillModel) {
        pillModel.className = 'health-pill online';
        pillModel.innerHTML = `<span class="status-dot"></span> YOLO: Ready (4 Classes)`;
      }

      if (pillDb) {
        pillDb.className = 'health-pill online';
        pillDb.innerHTML = `<span class="status-dot"></span> DB: Connected`;
      }
    } catch (e) {
      console.warn('System status poll failed', e);
    }
    
    // Mobile Sidebar Toggle
  }
  const btnToggleSidebar = document.getElementById('btnToggleSidebar');
  const sidebar = document.querySelector('.sidebar');
  if (btnToggleSidebar && sidebar) {
    btnToggleSidebar.addEventListener('click', (e) => {
      e.stopPropagation();
      sidebar.classList.toggle('mobile-open');
    });

    document.addEventListener('click', (e) => {
      if (sidebar.classList.contains('mobile-open') && !sidebar.contains(e.target)) {
        sidebar.classList.remove('mobile-open');
      }
    });
  }

  updateSystemHealth();
  setInterval(updateSystemHealth, 5000);

  // --- Dashboard Data Loading ---
  async function loadDashboard() {
    try {
      const stats = await Api.getStats();

      // Metric Cards
      const totalDetEl = document.getElementById('dashTotalDetections');
      const todayDetEl = document.getElementById('dashTodayDetections');
      const mostDetEl = document.getElementById('dashMostDetected');
      const avgConfEl = document.getElementById('dashAvgConfidence');

      if (totalDetEl) totalDetEl.textContent = stats.total_detections.toLocaleString();
      if (todayDetEl) todayDetEl.textContent = stats.today_detections.toLocaleString();
      if (mostDetEl) mostDetEl.textContent = `${stats.most_detected.name} (${stats.most_detected.count})`;
      if (avgConfEl) avgConfEl.textContent = `${stats.average_confidence}%`;

      // Render Charts
      renderProductDistributionChart(stats.distribution);
      renderRecentDetectionsTable(stats.recent_detections);
    } catch (e) {
      console.error('Failed to load dashboard data', e);
    }
  }

  function renderProductDistributionChart(dist) {
    const canvas = document.getElementById('chartDistribution');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    
    // Clear
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    const labels = ["Trident", "Donut", "Pickers", "Bahia"];
    const colors = ["#06B6D4", "#F59E0B", "#8B5CF6", "#10B981"];
    const values = labels.map(l => (dist[l] ? dist[l].count : 0));
    const maxVal = Math.max(...values, 10);

    const barWidth = 48;
    const gap = 36;
    const startX = 60;
    const chartHeight = 180;
    const baseY = 210;

    // Draw Grid lines
    ctx.strokeStyle = "#E2E8F0";
    ctx.lineWidth = 1;
    ctx.font = "11px 'Plus Jakarta Sans', sans-serif";
    ctx.fillStyle = "#94A3B8";

    for (let i = 0; i <= 4; i++) {
      const y = baseY - (chartHeight / 4) * i;
      const valLabel = Math.round((maxVal / 4) * i);
      ctx.beginPath();
      ctx.moveTo(startX - 10, y);
      ctx.lineTo(startX + (barWidth + gap) * 4, y);
      ctx.stroke();
      ctx.fillText(valLabel, startX - 35, y + 4);
    }

    // Draw Bars
    labels.forEach((label, i) => {
      const val = values[i];
      const barH = (val / maxVal) * chartHeight;
      const x = startX + i * (barWidth + gap);
      const y = baseY - barH;

      // Rounded Bar
      ctx.fillStyle = colors[i];
      ctx.beginPath();
      ctx.roundRect(x, y, barWidth, barH, [6, 6, 0, 0]);
      ctx.fill();

      // Value label on top
      ctx.fillStyle = "#0F172A";
      ctx.font = "bold 12px 'Plus Jakarta Sans', sans-serif";
      ctx.textAlign = "center";
      ctx.fillText(val, x + barWidth / 2, y - 8);

      // Product label on bottom
      ctx.fillStyle = "#64748B";
      ctx.font = "500 12px 'Plus Jakarta Sans', sans-serif";
      ctx.fillText(label, x + barWidth / 2, baseY + 20);
    });
  }

  function renderRecentDetectionsTable(recentList) {
    const tbody = document.getElementById('recentDetectionsTbody');
    if (!tbody) return;

    if (!recentList || recentList.length === 0) {
      tbody.innerHTML = `<tr><td colspan="5" style="text-align:center; padding: 2rem; color: #94A3B8;">No recent live detections. Start camera to begin ingestion.</td></tr>`;
      return;
    }

    tbody.innerHTML = recentList.map(item => {
      const pClass = item.product_name.toLowerCase();
      const confPct = Math.round(item.confidence * 100);
      const dateObj = new Date(item.created_at || Date.now());
      const dateStr = dateObj.toLocaleDateString();
      const timeStr = dateObj.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

      return `
        <tr data-det-id="${item.id}">
          <td><span class="product-badge ${pClass}">${item.product_name}</span></td>
          <td><span class="conf-pill" style="color: ${confPct >= 90 ? '#059669' : '#D97706'}">${confPct}%</span></td>
          <td>${dateStr}</td>
          <td>${timeStr}</td>
          <td><span class="health-pill online" style="padding: 0.15rem 0.5rem; font-size: 0.7rem;"><span class="status-dot"></span> ${item.source || 'Live Camera'}</span></td>
        </tr>
      `;
    }).join('');
  }

  // Initial load
  loadDashboard();
});
