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
    return user;
  }
};
