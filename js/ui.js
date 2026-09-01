/**
 * VisionaryAI Global UI Utilities
 * Shared components: Toast notifications, skeletons, loading states, badges
 * Must be loaded BEFORE all other modules.
 */

'use strict';

/* ============================================================
   TOAST NOTIFICATION SYSTEM
   ============================================================ */

const TOAST_ICONS = {
  success: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" width="18" height="18"><polyline points="20 6 9 17 4 12"/></svg>`,
  danger:  `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" width="18" height="18"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>`,
  error:   `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" width="18" height="18"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>`,
  warning: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" width="18" height="18"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>`,
  info:    `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" width="18" height="18"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>`,
};

function showToast(message, type = 'info', duration = 4000) {
  let container = document.getElementById('toastContainer');
  if (!container) {
    container = document.createElement('div');
    container.className = 'toast-container';
    container.id = 'toastContainer';
    container.setAttribute('aria-live', 'assertive');
    document.body.appendChild(container);
  }

  const icon = TOAST_ICONS[type] || TOAST_ICONS.info;
  const toast = document.createElement('div');
  toast.className = `toast toast-${type}`;
  toast.setAttribute('role', 'alert');
  toast.innerHTML = `
    <span class="toast-icon">${icon}</span>
    <span class="toast-message">${message}</span>
    <button type="button" class="toast-close" aria-label="Dismiss">&times;</button>
  `;

  container.appendChild(toast);

  const dismiss = () => {
    toast.classList.add('toast-fadeout');
    setTimeout(() => { if (toast.parentNode) toast.parentNode.removeChild(toast); }, 320);
  };

  toast.querySelector('.toast-close').addEventListener('click', dismiss);
  if (duration > 0) setTimeout(dismiss, duration);
  return toast;
}

/* ============================================================
   SKELETON / LOADING PLACEHOLDERS
   ============================================================ */

function renderSkeletonRows(tbodyEl, cols = 5, rows = 6) {
  if (!tbodyEl) return;
  const cell = `<td><div class="loading-skeleton" style="height:13px;width:${60 + Math.round(Math.random() * 30)}%;"></div></td>`;
  const row  = `<tr>${Array(cols).fill(cell).join('')}</tr>`;
  tbodyEl.innerHTML = Array(rows).fill(row).join('');
}

function renderEmptyState(container, { icon = 'inbox', title = 'No data found', message = 'Try adjusting your filters.' } = {}) {
  if (!container) return;
  const svgMap = {
    inbox: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" width="40" height="40"><polyline points="22 12 16 12 14 15 10 15 8 12 2 12"/><path d="M5.45 5.11L2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11z"/></svg>`,
    camera: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" width="40" height="40"><path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/><circle cx="12" cy="13" r="4"/></svg>`,
  };
  const svg = svgMap[icon] || svgMap.inbox;
  container.innerHTML = `
    <div class="empty-state">
      <div class="empty-state-icon">${svg}</div>
      <div class="empty-state-title">${title}</div>
      <p class="empty-state-message">${message}</p>
    </div>
  `;
}

/* ============================================================
   NUMBER COUNTER ANIMATION
   ============================================================ */

/**
 * Animates the text of `el` from its current numeric value to `target` over
 * `duration` ms. Cancels any counter already running on the element so
 * repeated calls (e.g. re-navigating to a view) never stack rAF loops.
 * `format` receives the interpolated number and must return the string to render.
 */
function animateCounter(el, target, { duration = 700, format = (n) => Math.round(n).toLocaleString() } = {}) {
  if (!el) return;
  if (el._counterRaf) cancelAnimationFrame(el._counterRaf);

  const targetNum = Number(target) || 0;
  const startNum = Number(String(el.textContent).replace(/[^0-9.\-]/g, '')) || 0;

  if (startNum === targetNum || duration <= 0) {
    el.textContent = format(targetNum);
    return;
  }

  const startTime = performance.now();
  const easeOutQuad = (t) => 1 - (1 - t) * (1 - t);

  const step = (now) => {
    const elapsed = now - startTime;
    const progress = Math.min(elapsed / duration, 1);
    const eased = easeOutQuad(progress);
    el.textContent = format(startNum + (targetNum - startNum) * eased);

    if (progress < 1) {
      el._counterRaf = requestAnimationFrame(step);
    } else {
      el._counterRaf = null;
    }
  };

  el._counterRaf = requestAnimationFrame(step);
}

/* ============================================================
   BADGE HELPERS
   ============================================================ */

function confBadge(conf) {
  const pct = typeof conf === 'number'
    ? (conf <= 1 ? Math.round(conf * 100) : Math.round(conf))
    : parseInt(conf, 10) || 0;
  let cls = 'badge-success';
  if (pct < 85) cls = 'badge-warning';
  if (pct < 70) cls = 'badge-danger';
  return `<span class="badge ${cls}">${pct}%</span>`;
}

function productBadge(name) {
  const key = (name || '').toLowerCase();
  const map = { trident: 'badge-cyan', donut: 'badge-amber', pickers: 'badge-violet', bahia: 'badge-emerald' };
  return `<span class="badge ${map[key] || 'badge-neutral'}">${name}</span>`;
}

/* ============================================================
   DATE / TIME FORMATTERS
   ============================================================ */

function formatDateUI(iso) {
  if (!iso) return '—';
  try { return new Date(iso).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: '2-digit' }); }
  catch { return iso; }
}

function formatTimeUI(iso) {
  if (!iso) return '—';
  try { return new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }); }
  catch { return iso; }
}

/* ============================================================
   PRODUCT COLOUR REGISTRY
   ============================================================ */

const PRODUCT_COLORS = {
  'Trident': '#0284C7',
  'Donut':   '#F59E0B',
  'Pickers': '#8B5CF6',
  'Bahia':   '#10B981',
};

function getProductColor(name) {
  return PRODUCT_COLORS[name] || '#64748B';
}
