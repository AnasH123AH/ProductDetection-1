# VisionaryAI Enterprise Login Experience

A modern, accessible, and high-performance B2B SaaS authentication interface crafted for **VisionaryAI** &mdash; a real-time AI computer vision and product detection platform for enterprise supply chains.

## 🚀 Key Features

### 1. 50/50 Split-Screen Corporate Architecture
- **Left Panel (AI Vision Showcase & Branding):**
  - High-performance, interactive HTML5 canvas simulating neural network node meshes and dynamic bounding boxes with confidence scores (`SKU-7729 [BEARING] 99.9%`, `PALLET-A4 [SEALED] 99.7%`).
  - Real-time telemetry simulation (120 FPS counter, <4ms inference latency jitter, Edge status pill).
  - Corporate mission statement: *"Empowering your supply chain with real-time AI product detection."*
  - Enterprise trust badges: *50M+ items/day, <4.5ms latency, SOC 2 Type II Certified*.
  
- **Right Panel (Authentication Studio):**
  - Ultra-clean, tactile light-mode form card with high typographic contrast and micro-borders.
  - Header: *"Welcome Back"* + *"Please enter your details to access your dashboard."*

### 2. Single Sign-On (SSO)
- Official **Continue with Google** (Google Workspace SSO) with pixel-accurate 4-color SVG.
- Official **Continue with Microsoft** (Azure Active Directory / Entra ID) with authentic Microsoft SVG.
- Interactive token exchange simulation and notification feedback.

### 3. Smart Form Validation & Accessibility (a11y)
- **Work Email:** Real-time regex check, corporate domain heuristic, green success checkmark indicator, clear accessible error messaging.
- **Password Field:** Embedded Show/Hide toggle (accessible SVG eye with `aria-pressed`), Caps Lock active detection badge.
- **Form Controls:** Branded accessible *"Remember me for 30 days"* checkbox, *"Forgot password?"* trigger modal.
- **Sign In Button:** Subtle animated SVG loading spinner on submission with credential verification simulation.
- **Enterprise Contact Flow:** *"Don't have an account? Contact your administrator."* with modal and one-click support email copy.
- **Quick Demo Helper:** Floating 1-click credential autofill pill for instant preview and validation testing.

### 4. Responsive Design
- **Desktop (1024px+):** Full split-screen immersion with 3D mouse parallax on the HUD telemetry card.
- **Tablet / Mobile (<960px):** Gracefully hides the dark branding panel, displays compact top brand mark, and centers the login card for optimal mobile ergonomics.

## 🛠️ Technology Stack
- **HTML5:** Semantic structure, ARIA 1.2 compliance, high-DPI canvas integration.
- **Vanilla CSS (Modern Design Tokens):** CSS custom properties, HSL/RGB tailored palette, smooth cubic-bezier transitions, zero third-party framework overhead.
- **Vanilla JavaScript (ES6+):** Pure event-driven controllers, canvas animation loops, modal management, and toast notification engine.

## 📂 File Structure
```
visionary-ai-login/
├── index.html          # Semantic HTML page
├── css/
│   └── styles.css      # Design tokens, typography, responsive layout & components
├── js/
│   ├── app.js          # Form validation, SSO, modals, toasts, password toggle
│   └── canvas-ai.js    # AI Computer Vision canvas simulation & telemetry tickers
└── README.md           # Documentation
```
