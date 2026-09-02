/**
 * VisionaryAI Authentication & Session Guard
 */

const Auth = {
  getUser() {
    try {
      const stored = localStorage.getItem('visionary_user');
      if (stored) {
        return JSON.parse(stored);
      }
    } catch (e) {
      console.error('Failed to parse user session', e);
    }
    // Default admin session for Anas Hamma
    return {
      id: 1,
      name: 'Anas Hamma',
      email: 'anas.hamma@e-polytechnique.ma',
      role: 'admin',
      organization: 'Polytechnique Vision Lab',
      avatar: 'AH'
    };
  },

  isAuthenticated() {
    return !!localStorage.getItem('visionary_user');
  },

  requireAuth() {
    if (!this.isAuthenticated()) {
      const defaultUser = {
        id: 1,
        name: 'Anas Hamma',
        email: 'anas.hamma@e-polytechnique.ma',
        role: 'admin',
        organization: 'Polytechnique Vision Lab',
        avatar: 'AH',
        token: 'jwt_admin_anas_' + Date.now()
      };
      localStorage.setItem('visionary_user', JSON.stringify(defaultUser));
      this.rememberAccount(defaultUser);
    } else {
      this.rememberAccount(this.getUser());
    }
  },

  logout() {
    localStorage.removeItem('visionary_user');
    window.location.href = 'index.html';
  },

  updateProfile(name, email) {
    const user = this.getUser();
    user.name = name || user.name;
    user.email = email || user.email;
    localStorage.setItem('visionary_user', JSON.stringify(user));
    this.rememberAccount(user);
    return user;
  },

  // --- Multi-account switcher (local browser only, no backend user store) ---

  getAccounts() {
    try {
      const raw = localStorage.getItem('visionary_accounts');
      const parsed = raw ? JSON.parse(raw) : [];
      return Array.isArray(parsed) ? parsed : [];
    } catch (e) {
      return [];
    }
  },

  rememberAccount(user) {
    if (!user || !user.email) return;
    const accounts = this.getAccounts().filter(a => a.email !== user.email);
    accounts.unshift({
      name: user.name,
      email: user.email,
      role: user.role,
      organization: user.organization,
      avatar: user.avatar || user.name.trim().split(/\s+/).map(w => w[0]).slice(0, 2).join('').toUpperCase()
    });
    localStorage.setItem('visionary_accounts', JSON.stringify(accounts));
  },

  switchAccount(email) {
    const account = this.getAccounts().find(a => a.email === email);
    if (!account) return null;
    const session = {
      ...account,
      token: 'jwt_auth_' + Date.now(),
      loggedInAt: new Date().toISOString()
    };
    localStorage.setItem('visionary_user', JSON.stringify(session));
    return session;
  }
};
