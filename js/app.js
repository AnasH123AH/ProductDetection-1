/**
 * VisionaryAI Enterprise Authentication Controller
 * Handles form validation, SSO interactions, accessible state management,
 * modals, toast notifications, and password visibility toggling.
 */

document.addEventListener('DOMContentLoaded', () => {
  'use strict';

  // --- Elements ---
  const loginForm = document.getElementById('loginForm');
  const emailInput = document.getElementById('workEmail');
  const emailGroup = document.getElementById('emailGroup');
  const emailFeedback = document.getElementById('emailFeedback');
  const passwordInput = document.getElementById('password');
  const passwordGroup = document.getElementById('passwordGroup');
  const passwordFeedback = document.getElementById('passwordFeedback');
  const togglePasswordBtn = document.getElementById('togglePassword');
  const capsLockWarning = document.getElementById('capsLockWarning');
  const submitBtn = document.getElementById('btnSubmit');

  // Modals
  const adminModal = document.getElementById('adminModal');
  const btnContactAdmin = document.getElementById('btnContactAdmin');
  const btnCloseAdminModal = document.getElementById('btnCloseAdminModal');
  const btnCopyAdminEmail = document.getElementById('btnCopyAdminEmail');
  const copyEmailText = document.getElementById('copyEmailText');

  const forgotModal = document.getElementById('forgotModal');
  const btnForgotPassword = document.getElementById('btnForgotPassword');
  const btnCloseForgotModal = document.getElementById('btnCloseForgotModal');
  const btnSendReset = document.getElementById('btnSendReset');
  const resetEmailInput = document.getElementById('resetEmail');
  const resetFeedback = document.getElementById('resetFeedback');

  // Quick Demo Helper
  const btnQuickDemo = document.getElementById('btnQuickDemo');
  const toastContainer = document.getElementById('toastContainer');

  // --- Email Validation Regex & Domains ---
  const emailPattern = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;
  const freeEmailProviders = ['gmail.com', 'yahoo.com', 'hotmail.com', 'outlook.com', 'aol.com', 'icloud.com'];

  // --- Toast Notification Helper ---
  function showToast(message, type = 'info', duration = 3800) {
    if (!toastContainer) return;

    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    
    // Icon based on type
    let iconSvg = '';
    if (type === 'success') {
      iconSvg = `<svg width="18" height="18" viewBox="0 0 20 20" fill="#10B981" aria-hidden="true"><path fill-rule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.857-9.809a.75.75 0 00-1.214-.882l-3.483 4.79-1.88-1.88a.75.75 0 10-1.06 1.061l2.5 2.5a.75.75 0 001.137-.089l4-5.5z" clip-rule="evenodd"/></svg>`;
    } else if (type === 'error') {
      iconSvg = `<svg width="18" height="18" viewBox="0 0 20 20" fill="#E11D48" aria-hidden="true"><path fill-rule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-8-5a.75.75 0 01.75.75v4.5a.75.75 0 01-1.5 0v-4.5A.75.75 0 0110 5zm0 10a1 1 0 100-2 1 1 0 000 2z" clip-rule="evenodd"/></svg>`;
    } else {
      iconSvg = `<svg width="18" height="18" viewBox="0 0 20 20" fill="#0284C7" aria-hidden="true"><path fill-rule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a.75.75 0 000 1.5h.253a.25.25 0 01.244.304l-.459 2.066A1.75 1.75 0 0010.747 15H11a.75.75 0 000-1.5h-.253a.25.25 0 01-.244-.304l.459-2.066A1.75 1.75 0 009.253 9H9z" clip-rule="evenodd"/></svg>`;
    }

    toast.innerHTML = `
      <div class="toast-content">
        ${iconSvg}
        <span>${message}</span>
      </div>
      <button type="button" class="toast-close-btn" aria-label="Close notification">&times;</button>
    `;

    toast.querySelector('.toast-close-btn').addEventListener('click', () => {
      toast.remove();
    });

    toastContainer.appendChild(toast);

    setTimeout(() => {
      if (toast.parentNode) {
        toast.style.opacity = '0';
        toast.style.transform = 'translateX(30px)';
        toast.style.transition = 'all 0.3s ease';
        setTimeout(() => toast.remove(), 300);
      }
    }, duration);
  }

  // --- Inline Email Validation ---
  function validateEmail(showFeedback = true) {
    const val = emailInput.value.trim();

    if (!val) {
      emailGroup.classList.remove('is-valid', 'is-invalid');
      emailInput.setAttribute('aria-invalid', 'false');
      emailFeedback.textContent = '';
      emailFeedback.className = 'feedback-msg';
      return false;
    }

    if (!emailPattern.test(val)) {
      emailGroup.classList.remove('is-valid');
      emailGroup.classList.add('is-invalid');
      emailInput.setAttribute('aria-invalid', 'true');
      if (showFeedback) {
        emailFeedback.textContent = 'Please enter a valid work email format.';
        emailFeedback.className = 'feedback-msg error-text';
      }
      return false;
    }

    const domain = val.split('@')[1]?.toLowerCase();
    if (freeEmailProviders.includes(domain)) {
      // Soft warning for enterprise compliance
      emailGroup.classList.remove('is-invalid');
      emailGroup.classList.add('is-valid');
      emailInput.setAttribute('aria-invalid', 'false');
      if (showFeedback) {
        emailFeedback.textContent = 'Personal email detected. Organization domain recommended.';
        emailFeedback.className = 'feedback-msg error-text';
      }
      return true;
    }

    // Valid Corporate Domain
    emailGroup.classList.remove('is-invalid');
    emailGroup.classList.add('is-valid');
    emailInput.setAttribute('aria-invalid', 'false');
    if (showFeedback) {
      emailFeedback.textContent = 'Valid enterprise credentials format.';
      emailFeedback.className = 'feedback-msg success-text';
    }
    return true;
  }

  // --- Password Validation ---
  function validatePassword(showFeedback = true) {
    const val = passwordInput.value;

    if (!val) {
      passwordGroup.classList.remove('is-valid', 'is-invalid');
      passwordInput.setAttribute('aria-invalid', 'false');
      passwordFeedback.textContent = '';
      passwordFeedback.className = 'feedback-msg';
      return false;
    }

    if (val.length < 8) {
      passwordGroup.classList.remove('is-valid');
      passwordGroup.classList.add('is-invalid');
      passwordInput.setAttribute('aria-invalid', 'true');
      if (showFeedback) {
        passwordFeedback.textContent = 'Password must be at least 8 characters.';
        passwordFeedback.className = 'feedback-msg error-text';
      }
      return false;
    }

    passwordGroup.classList.remove('is-invalid');
    passwordGroup.classList.add('is-valid');
    passwordInput.setAttribute('aria-invalid', 'false');
    passwordFeedback.textContent = '';
    return true;
  }

  // Email Events
  emailInput.addEventListener('input', () => validateEmail(true));
  emailInput.addEventListener('blur', () => validateEmail(true));

  // Password Events
  passwordInput.addEventListener('input', () => validatePassword(true));
  passwordInput.addEventListener('blur', () => validatePassword(false));

  // Caps Lock Detection
  passwordInput.addEventListener('keyup', (e) => {
    if (e.getModifierState && e.getModifierState('CapsLock')) {
      capsLockWarning.classList.remove('hidden');
    } else {
      capsLockWarning.classList.add('hidden');
    }
  });

  passwordInput.addEventListener('keydown', (e) => {
    if (e.getModifierState && e.getModifierState('CapsLock')) {
      capsLockWarning.classList.remove('hidden');
    } else {
      capsLockWarning.classList.add('hidden');
    }
  });

  // --- Show / Hide Password Toggle ---
  togglePasswordBtn.addEventListener('click', () => {
    const isPassword = passwordInput.type === 'password';
    passwordInput.type = isPassword ? 'text' : 'password';

    const eyeOpen = togglePasswordBtn.querySelector('.eye-open');
    const eyeClosed = togglePasswordBtn.querySelector('.eye-closed');

    if (isPassword) {
      eyeOpen.classList.add('hidden');
      eyeClosed.classList.remove('hidden');
      togglePasswordBtn.setAttribute('aria-label', 'Hide password');
      togglePasswordBtn.setAttribute('aria-pressed', 'true');
    } else {
      eyeOpen.classList.remove('hidden');
      eyeClosed.classList.add('hidden');
      togglePasswordBtn.setAttribute('aria-label', 'Show password');
      togglePasswordBtn.setAttribute('aria-pressed', 'false');
    }

    passwordInput.focus();
  });

  // --- Form Submission Handling ---
  loginForm.addEventListener('submit', (e) => {
    e.preventDefault();

    const isEmailValid = validateEmail(true);
    const isPasswordValid = validatePassword(true);

    if (!isEmailValid) {
      emailInput.focus();
      return;
    }

    if (!isPasswordValid) {
      passwordInput.focus();
      return;
    }

    // Trigger Loading State on Button
    submitBtn.classList.add('loading');
    submitBtn.disabled = true;

    // Authenticate and save user session
    const enteredEmail = emailInput.value.trim();
    const displayName = enteredEmail.toLowerCase().includes('anas') 
      ? 'Anas Hamma' 
      : (enteredEmail.split('@')[0].replace('.', ' ').replace(/\b\w/g, l => l.toUpperCase()));

    const authSession = {
      email: enteredEmail,
      name: displayName,
      role: 'CV Research & Systems Engineer',
      organization: 'Polytechnique Vision Lab',
      token: 'jwt_auth_' + Date.now(),
      loggedInAt: new Date().toISOString()
    };

    localStorage.setItem('visionary_user', JSON.stringify(authSession));
    if (typeof Auth !== 'undefined') Auth.rememberAccount(authSession);

    // Simulate Enterprise Authentication & Ingestion Handshake
    setTimeout(() => {
      submitBtn.classList.remove('loading');
      submitBtn.disabled = false;

      showToast(`Welcome back, ${displayName}! Authenticating with Edge CV Cluster...`, 'success', 2500);

      // Smooth transition to authenticated dashboard
      setTimeout(() => {
        window.location.href = 'app.html';
      }, 1000);
    }, 900);
  });

  // --- Modal Helpers ---
  function openModal(modal) {
    modal.classList.remove('hidden');
    document.body.style.overflow = 'hidden';
    
    // Focus first interactive element inside modal
    const focusable = modal.querySelector('input, button');
    if (focusable) focusable.focus();
  }

  function closeModal(modal) {
    modal.classList.add('hidden');
    document.body.style.overflow = '';
  }

  // Contact Admin Modal
  btnContactAdmin.addEventListener('click', (e) => {
    e.preventDefault();
    openModal(adminModal);
  });

  btnCloseAdminModal.addEventListener('click', () => {
    closeModal(adminModal);
  });

  btnCopyAdminEmail.addEventListener('click', () => {
    navigator.clipboard.writeText('support@visionary.ai').then(() => {
      copyEmailText.textContent = 'Copied to Clipboard!';
      setTimeout(() => {
        copyEmailText.textContent = 'Copy Support Email';
      }, 2000);
      showToast('Enterprise Support email copied to clipboard', 'success');
    }).catch(() => {
      showToast('Enterprise Support: support@visionary.ai', 'info');
    });
  });

  // Forgot Password Modal
  btnForgotPassword.addEventListener('click', (e) => {
    e.preventDefault();
    if (emailInput.value) {
      resetEmailInput.value = emailInput.value;
    }
    openModal(forgotModal);
  });

  btnCloseForgotModal.addEventListener('click', () => {
    closeModal(forgotModal);
    resetFeedback.textContent = '';
  });

  btnSendReset.addEventListener('click', () => {
    const val = resetEmailInput.value.trim();
    if (!val || !emailPattern.test(val)) {
      resetFeedback.textContent = 'Please enter a valid work email address.';
      resetFeedback.className = 'feedback-msg error-text';
      resetEmailInput.focus();
      return;
    }

    btnSendReset.disabled = true;
    btnSendReset.textContent = 'Sending...';

    setTimeout(() => {
      btnSendReset.disabled = false;
      btnSendReset.textContent = 'Send Reset Link';
      closeModal(forgotModal);
      showToast(`Password reset link dispatched to ${val}`, 'success', 4500);
      resetFeedback.textContent = '';
    }, 1100);
  });

  // Close modals on clicking outside or Esc key
  [adminModal, forgotModal].forEach((modal) => {
    modal.addEventListener('click', (e) => {
      if (e.target === modal) {
        closeModal(modal);
      }
    });
  });

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      closeModal(adminModal);
      closeModal(forgotModal);
    }
  });

  // --- Demo Credentials Autofill Helper ---
  if (btnQuickDemo) {
    btnQuickDemo.addEventListener('click', () => {
      emailInput.value = 'anas.hamma@e-polytechnique.ma';
      passwordInput.value = 'Anas2004';
      validateEmail(false);
      validatePassword(false);
      
      showToast('Credentials loaded for Anas Hamma (Polytechnique). Ready to Sign In!', 'success');
      submitBtn.focus();
    });
  }

  // Legal Links Demo Handling
  const linkPrivacy = document.getElementById('linkPrivacy');
  const linkTerms = document.getElementById('linkTerms');
  
  if (linkPrivacy) {
    linkPrivacy.addEventListener('click', (e) => {
      e.preventDefault();
      showToast('VisionaryAI Enterprise Privacy: ISO 27001 & SOC 2 compliant.', 'info');
    });
  }

  if (linkTerms) {
    linkTerms.addEventListener('click', (e) => {
      e.preventDefault();
      showToast('Enterprise SLA terms: 99.99% model uptime guarantee.', 'info');
    });
  }
});
