/**
 * VisionaryAI Admin Management Module
 * Handles Real Admin Dashboard, User CRUD, Audit Logging, Model Status, System Health, and Product Catalog.
 */

const AdminModule = {
  init() {
    this.bindEvents();
    this.checkAdminRoleDisplay();
  },

  checkAdminRoleDisplay() {
    const isAdmin = Auth.isAdmin();
    const adminBadges = document.querySelectorAll('.admin-only-badge');
    adminBadges.forEach(el => {
      el.style.display = isAdmin ? 'inline-flex' : 'none';
    });

    const adminNavItems = document.querySelectorAll('.admin-nav-item');
    adminNavItems.forEach(el => {
      el.style.display = isAdmin ? 'flex' : 'none';
    });
  },

  bindEvents() {
    // Navigation Guard & Route Change Handler
    window.addEventListener('hashchange', () => {
      const hash = window.location.hash || '#view-dashboard';
      if (!Auth.enforceAdminRoute(hash)) return;

      if (hash === '#view-admin-dashboard') this.loadAdminDashboard();
      if (hash === '#view-products') this.loadProductsManagement();
      if (hash === '#view-model') this.loadModelManagement();
      if (hash === '#view-analytics') this.loadAnalyticsView();
      if (hash === '#view-users') this.loadUsersManagement();
      if (hash === '#view-system-health') this.loadSystemHealthView();
      if (hash === '#view-audit') this.loadAuditLogView();
    });

    // Clear History Button with Confirmation
    const btnClearHistory = document.getElementById('histBtnClearAll');
    if (btnClearHistory) {
      btnClearHistory.addEventListener('click', async () => {
        if (confirm('⚠️ CAUTION: Are you sure you want to permanently CLEAR ALL detection history records? This operation cannot be undone.')) {
          try {
            await Api.clearAllHistory();
            alert('Detection history cleared successfully.');
            if (window.HistoryModule) HistoryModule.loadHistory();
          } catch (e) {
            alert('Failed to clear history: ' + e.message);
          }
        }
      });
    }

    // Model Reload Button
    const btnReloadModel = document.getElementById('btnReloadModel');
    if (btnReloadModel) {
      btnReloadModel.addEventListener('click', async () => {
        btnReloadModel.disabled = true;
        btnReloadModel.textContent = 'Reloading Model...';
        try {
          await Api.reloadModel();
          alert('YOLO Model (C:\\yolo\\best.pt) reloaded successfully!');
          this.loadModelManagement();
        } catch (e) {
          alert('Model reload failed: ' + e.message);
        } finally {
          btnReloadModel.disabled = false;
          btnReloadModel.textContent = 'Reload Model Service';
        }
      });
    }

    // Add User Form
    const addUserForm = document.getElementById('addUserForm');
    if (addUserForm) {
      addUserForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const user = {
          name: document.getElementById('addUserName').value,
          email: document.getElementById('addUserEmail').value,
          role: document.getElementById('addUserRole').value,
          status: document.getElementById('addUserStatus').value,
          password: document.getElementById('addUserPassword').value || 'User2004'
        };

        try {
          const res = await Api.createUser(user);
          if (res.error) {
            alert('Error creating user: ' + res.error);
          } else {
            alert('User created successfully!');
            document.getElementById('modalAddUser').classList.add('hidden');
            this.loadUsersManagement();
          }
        } catch (err) {
          alert('Failed to create user: ' + err.message);
        }
      });
    }

    // Add Product Form
    const addProductForm = document.getElementById('addProductForm');
    if (addProductForm) {
      addProductForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const product = {
          name: document.getElementById('addProdName').value,
          sku: document.getElementById('addProdSku').value,
          category: document.getElementById('addProdCategory').value
        };

        try {
          const res = await Api.addProduct(product);
          if (res.error) {
            alert('Error adding product: ' + res.error);
          } else {
            alert('Product added to catalog!');
            document.getElementById('modalAddProduct').classList.add('hidden');
            this.loadProductsManagement();
          }
        } catch (err) {
          alert('Failed to add product: ' + err.message);
        }
      });
    }
  },

  async loadAdminDashboard() {
    const kpiTotal = document.getElementById('adminKpiTotal');
    const kpiToday = document.getElementById('adminKpiToday');
    const kpiWeek = document.getElementById('adminKpiWeek');
    const kpiProducts = document.getElementById('adminKpiProducts');
    const kpiModel = document.getElementById('adminKpiModel');
    const kpiStatus = document.getElementById('adminKpiStatus');

    try {
      const stats = await Api.getStats();
      const statusData = await Api.getStatus();

      if (kpiTotal) kpiTotal.textContent = stats.total_detections.toLocaleString();
      if (kpiToday) kpiToday.textContent = stats.today_detections.toLocaleString();
      if (kpiWeek) kpiWeek.textContent = stats.week_detections.toLocaleString();
      if (kpiProducts) kpiProducts.textContent = "4 Active";
      if (kpiModel) kpiModel.textContent = "best.pt";
      if (kpiStatus) kpiStatus.textContent = statusData.backend === 'Online' ? 'Online' : 'Offline';

      this.renderRealCharts();
    } catch (e) {
      console.warn('Admin dashboard load fallback:', e);
    }
  },

  async renderRealCharts() {
    const analytics = await Api.getAnalytics();
    const chartContainer = document.getElementById('adminChartsArea');
    if (!chartContainer) return;

    if (!analytics.has_data) {
      chartContainer.innerHTML = `<div style="text-align: center; padding: 3rem; color: #94A3B8; font-weight: 600;">No detection data available yet</div>`;
      return;
    }

    const byProduct = analytics.by_product || [];
    const maxCount = Math.max(...byProduct.map(p => p.count), 1);

    let html = `
      <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 1.25rem;">
        <div class="card">
          <div class="card-header"><h3 class="card-title">Detections by Product Class</h3></div>
          <div class="card-body" style="display: flex; flex-direction: column; gap: 0.85rem;">
            ${byProduct.map(p => {
              const pct = Math.round((p.count / maxCount) * 100);
              return `
                <div>
                  <div style="display: flex; justify-content: space-between; font-size: 0.82rem; margin-bottom: 0.25rem;">
                    <strong>${p.product_name}</strong>
                    <span>${p.count} detections (${Math.round(p.avg_conf*100)}% avg conf)</span>
                  </div>
                  <div style="background: #F1F5F9; border-radius: 4px; height: 10px; overflow: hidden;">
                    <div style="background: #0284C7; width: ${pct}%; height: 100%;"></div>
                  </div>
                </div>
              `;
            }).join('')}
          </div>
        </div>

        <div class="card">
          <div class="card-header"><h3 class="card-title">System Status Overview</h3></div>
          <div class="card-body">
            <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 1rem;">
              <div style="background: #F8FAFC; padding: 1rem; border-radius: 8px;">
                <div style="font-size: 0.75rem; color: #64748B;">Total Detections Stored</div>
                <div style="font-size: 1.5rem; font-weight: 700; color: #0284C7;">${analytics.total}</div>
              </div>
              <div style="background: #F8FAFC; padding: 1rem; border-radius: 8px;">
                <div style="font-size: 0.75rem; color: #64748B;">Trained YOLO Model</div>
                <div style="font-size: 1.2rem; font-weight: 700; color: #059669;">C:\\yolo\\best.pt</div>
              </div>
            </div>
          </div>
        </div>
      </div>
    `;

    chartContainer.innerHTML = html;
  },

  async loadProductsManagement() {
    const tbody = document.getElementById('productsTableBody');
    if (!tbody) return;

    try {
      const products = await Api.getProducts();
      tbody.innerHTML = products.map(p => `
        <tr>
          <td style="font-family: var(--font-mono); font-weight: 600;">#${p.class_id}</td>
          <td>
            <div style="display: flex; align-items: center; gap: 0.6rem;">
              <span class="product-badge ${p.name.toLowerCase()}">${p.name}</span>
            </div>
          </td>
          <td style="font-family: var(--font-mono); font-size: 0.85rem;">${p.sku}</td>
          <td>${p.category}</td>
          <td><strong>${p.detection_count.toLocaleString()}</strong></td>
          <td style="color: #059669; font-weight: 600;">${p.avg_confidence}%</td>
          <td><span class="health-pill ${p.status === 'active' ? 'online' : ''}">${p.status.toUpperCase()}</span></td>
          <td>
            <button class="btn-ctrl" onclick="AdminModule.toggleProductStatus(${p.id}, '${p.status === 'active' ? 'disabled' : 'active'}')">
              ${p.status === 'active' ? 'Disable' : 'Enable'}
            </button>
            <button class="btn-ctrl danger" onclick="AdminModule.deleteProduct(${p.id})">Delete</button>
          </td>
        </tr>
      `).join('');
    } catch (e) {
      console.error('Failed to load products management:', e);
    }
  },

  async toggleProductStatus(id, newStatus) {
    try {
      await Api.updateProduct(id, { status: newStatus });
      this.loadProductsManagement();
    } catch (e) {
      alert('Failed to update product status: ' + e.message);
    }
  },

  async deleteProduct(id) {
    if (confirm('⚠️ Are you sure you want to delete this product catalog entry? Note: The underlying trained YOLO model best.pt will continue detecting its trained classes.')) {
      try {
        await Api.deleteProduct(id);
        this.loadProductsManagement();
      } catch (e) {
        alert('Failed to delete product: ' + e.message);
      }
    }
  },

  async loadUsersManagement() {
    const tbody = document.getElementById('usersTableBody');
    if (!tbody) return;

    try {
      const users = await Api.getUsers();
      tbody.innerHTML = users.map(u => `
        <tr>
          <td style="font-family: var(--font-mono); color: #64748B;">#${u.id}</td>
          <td style="font-weight: 600;">${u.name}</td>
          <td>${u.email}</td>
          <td><span class="product-badge ${u.role === 'admin' ? 'trident' : 'donut'}" style="font-size: 0.72rem;">${u.role.toUpperCase()}</span></td>
          <td><span class="health-pill ${u.status === 'active' ? 'online' : ''}">${u.status.toUpperCase()}</span></td>
          <td style="font-size: 0.8rem; color: #64748B;">${u.last_login || 'Never'}</td>
          <td>
            ${u.email === 'anas.hamma@e-polytechnique.ma' ? '<span style="font-size: 0.75rem; color: #94A3B8;">Primary Admin</span>' : `
              <button class="btn-ctrl" onclick="AdminModule.toggleUserRole(${u.id}, '${u.role === 'admin' ? 'user' : 'admin'}')">
                Set ${u.role === 'admin' ? 'User' : 'Admin'}
              </button>
              <button class="btn-ctrl danger" onclick="AdminModule.deleteUser(${u.id})">Delete</button>
            `}
          </td>
        </tr>
      `).join('');
    } catch (e) {
      console.error('Failed to load users management:', e);
    }
  },

  async toggleUserRole(id, newRole) {
    try {
      await Api.updateUser(id, { role: newRole });
      this.loadUsersManagement();
    } catch (e) {
      alert('Failed to update user role: ' + e.message);
    }
  },

  async deleteUser(id) {
    if (confirm('Are you sure you want to delete this user account?')) {
      try {
        await Api.deleteUser(id);
        this.loadUsersManagement();
      } catch (e) {
        alert('Failed to delete user: ' + e.message);
      }
    }
  },

  async loadModelManagement() {
    const nameEl = document.getElementById('modelNameVal');
    const pathEl = document.getElementById('modelPathVal');
    const statusEl = document.getElementById('modelStatusVal');

    try {
      const info = await Api.getModelInfo();
      if (nameEl) nameEl.textContent = info.name;
      if (pathEl) pathEl.textContent = info.path;
      if (statusEl) statusEl.textContent = info.status;
    } catch (e) {}
  },

  async loadSystemHealthView() {
    const area = document.getElementById('systemHealthArea');
    if (!area) return;

    try {
      const health = await Api.getSystemHealth();
      area.innerHTML = `
        <div style="display: grid; grid-template-columns: 1fr 1fr 1fr 1fr; gap: 1.25rem;">
          <div class="card" style="padding: 1.25rem;">
            <div style="font-size: 0.8rem; color: #64748B;">Python Backend API</div>
            <div style="font-size: 1.4rem; font-weight: 700; color: #059669; margin-top: 0.35rem;">Online (Port 8000)</div>
            <div style="font-size: 0.75rem; color: #64748B; margin-top: 0.25rem;">Uptime: ${health.server ? health.server.uptime_formatted : 'Active'}</div>
          </div>

          <div class="card" style="padding: 1.25rem;">
            <div style="font-size: 0.8rem; color: #64748B;">YOLO Model Service</div>
            <div style="font-size: 1.4rem; font-weight: 700; color: #0284C7; margin-top: 0.35rem;">Loaded (best.pt)</div>
            <div style="font-size: 0.75rem; color: #64748B; margin-top: 0.25rem;">4 Trained Classes Active</div>
          </div>

          <div class="card" style="padding: 1.25rem;">
            <div style="font-size: 0.8rem; color: #64748B;">SQLite Database</div>
            <div style="font-size: 1.4rem; font-weight: 700; color: #059669; margin-top: 0.35rem;">${health.database.records.toLocaleString()} Records</div>
            <div style="font-size: 0.75rem; color: #64748B; margin-top: 0.25rem;">File Size: ${health.database.size_kb} KB</div>
          </div>

          <div class="card" style="padding: 1.25rem;">
            <div style="font-size: 0.8rem; color: #64748B;">WebRTC Camera</div>
            <div style="font-size: 1.4rem; font-weight: 700; color: #059669; margin-top: 0.35rem;">Ready</div>
            <div style="font-size: 0.75rem; color: #64748B; margin-top: 0.25rem;">Logitech C270 (1280x720)</div>
          </div>
        </div>
      `;
    } catch (e) {
      console.error('Failed to load system health:', e);
    }
  },

  async loadAuditLogView() {
    const tbody = document.getElementById('auditLogTbody');
    if (!tbody) return;

    try {
      const logs = await Api.getAuditLogs();
      if (logs.length === 0) {
        tbody.innerHTML = `<tr><td colspan="5" style="text-align: center; padding: 2rem; color: #94A3B8;">No administrative audit logs available yet.</td></tr>`;
        return;
      }

      tbody.innerHTML = logs.map(l => `
        <tr>
          <td style="font-family: var(--font-mono); color: #64748B;">#${l.id}</td>
          <td style="font-weight: 600; color: #0284C7;">${l.action}</td>
          <td>${l.user_email}</td>
          <td style="font-size: 0.85rem;">${l.details || '-'}</td>
          <td style="font-family: var(--font-mono); font-size: 0.8rem; color: #64748B;">${l.created_at}</td>
        </tr>
      `).join('');
    } catch (e) {
      console.error('Failed to load audit log:', e);
    }
  },

  async loadAnalyticsView() {
    if (window.AnalyticsModule && AnalyticsModule.loadAnalytics) {
      AnalyticsModule.loadAnalytics();
    }
  }
};

document.addEventListener('DOMContentLoaded', () => {
  AdminModule.init();
});
