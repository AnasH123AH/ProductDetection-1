/**
 * VisionaryAI Help Assistant
 * Rule-based FAQ chatbot — no external API calls, works fully offline.
 * Answers questions about the app itself (confidence threshold, Live Detection,
 * Detection History, Analytics, Settings, product classes, etc).
 */

'use strict';

const ChatbotModule = (() => {
  let widgetEl, bubbleEl, panelEl, messagesEl, quickRepliesEl, formEl, inputEl;
  let opened = false;
  let hasGreeted = false;

  function getLiveConfidenceThreshold() {
    try {
      const raw = localStorage.getItem('visionaryai_settings');
      if (!raw) return 70;
      const parsed = JSON.parse(raw);
      const val = parsed && parsed.confidence_threshold;
      if (val === undefined || val === null) return 70;
      const num = Number(val);
      if (Number.isNaN(num)) return 70;
      return num <= 1 ? Math.round(num * 100) : Math.round(num);
    } catch (e) {
      return 70;
    }
  }

  const QUICK_REPLIES = [
    { label: 'Confidence threshold', query: 'confidence threshold' },
    { label: 'Live Detection', query: 'how does live detection work' },
    { label: 'Detection History', query: 'detection history' },
    { label: 'What can you help with?', query: 'what can you help with' },
  ];

  const TOPIC_LIST = 'Dashboard, Live Detection, Detection History, Analytics, Settings, Products Catalog, the Backend/API console, signing in, resetting your password, the profile menu (Add Account/Sign Out), the confidence threshold, and the YOLO model itself';

  const FAQ = [
    {
      keywords: ['what is this', 'what is visionaryai', 'what does this app do', 'what does this website do', 'about this app', 'about this website', 'what is the purpose', 'what does it do'],
      answer: () => `VisionaryAI is a product-detection platform built on a YOLOv8 computer-vision model. It detects 4 product classes (Trident, Donut, Pickers, Bahia) from your camera in real time, saves every detection to a history log, and gives you dashboards/analytics over that data.`,
    },
    {
      keywords: ['what can you help', 'what can you do', 'what do you know', 'help me', 'what questions', 'topics', 'what can i ask'],
      answer: () => `I can answer questions about: ${TOPIC_LIST}. Just ask in plain language, e.g. "how do I export my detections" or "what does the IoU threshold do".`,
    },
    {
      keywords: ['confidence threshold', 'confidence level', 'minimum confidence', 'conf threshold', 'what confidence'],
      answer: () => `The current confidence threshold is **${getLiveConfidenceThreshold()}%**. Detections scoring below this are ignored and never saved. You can change it from Settings or the Live Detection page — note the backend also enforces a hard minimum of 70%, so lower values aren't accepted.`,
    },
    {
      keywords: ['iou', 'non-max', 'overlap threshold', 'nms'],
      answer: () => `The IoU (Intersection-over-Union) Threshold controls Non-Max Suppression — how much overlap is allowed between detected boxes before duplicates get merged. You can adjust it on the Settings page (default 45%).`,
    },
    {
      keywords: ['live detect', 'live camera', 'camera detect', 'webcam', 'start camera', 'real-time', 'realtime detect', 'point camera'],
      answer: () => `Live Detection uses your camera and the YOLOv8 model in real time. Open the "Live Detection" page, allow camera access, and point it at a product — detected items are boxed and labeled with their confidence score, and saved to Detection History automatically (as long as they clear the confidence threshold).`,
    },
    {
      keywords: ['detection stability', 'stable detection', 'duplicate detection', 'detection cooldown', 'flicker'],
      answer: () => `Settings has a "Detection Behavior" section: Detection Stability requires a product to appear in several consecutive frames (configurable) before it's counted, Duplicate Detection Prevention avoids re-saving the same item repeatedly, and Detection Cooldown sets a minimum gap between saved detections.`,
    },
    {
      keywords: ['max detections', 'maximum detections', 'min detection size', 'minimum detection size', 'detection size'],
      answer: () => `Settings also lets you cap "Maximum Detections" per frame (5/10/20) and set a "Minimum Detection Size" in pixels — smaller boxes than that are ignored as likely noise.`,
    },
    {
      keywords: ['detection history', 'past detection', 'detection record', 'view history', 'my detections', 'saved detections'],
      answer: () => `Detection History lists every saved detection with its product, confidence, source, date and time. You can search by product name, filter by product, set a minimum confidence, page through results, and export everything as CSV.`,
    },
    {
      keywords: ['search product', 'filter product', 'filter history', 'min conf slider', 'search for', 'search', 'filter'],
      answer: () => `On Detection History you can search by product name, filter by a specific product from the dropdown, and drag the "Min Conf" slider to hide low-confidence rows — the table updates live as you adjust these.`,
    },
    {
      keywords: ['pagination', 'next page', 'previous page', 'page number'],
      answer: () => `Detection History is paginated — use the arrow buttons or the numbered page pills at the bottom of the table to move between pages of results.`,
    },
    {
      keywords: ['csv', 'export', 'download detections', 'export all'],
      answer: () => `You can export your entire Detection History to a CSV file using the "Export All CSV" button on the Detection History page.`,
    },
    {
      keywords: ['delete detection', 'clear history', 'remove detection'],
      answer: () => `Individual detections can be deleted from Detection History. There's no bulk "clear all" button in the UI by design, to avoid accidentally wiping your data.`,
    },
    {
      keywords: ['analytics', 'trend', 'breakdown', 'over time', 'insight'],
      answer: () => `The Analytics page shows detection trends over time (a chart by date) and a per-product confidence breakdown — average, minimum, and maximum confidence for each product class — computed from your real saved detections.`,
    },
    {
      keywords: ['dashboard', 'overview', 'summary', 'total detections', 'top sku', 'avg confidence', 'average confidence'],
      answer: () => `The Dashboard gives a quick overview: total detections, today's and this week's counts, average confidence, your top-detected product (SKU), a detection-distribution chart, a recent-detections stream, and a model-status panel.`,
    },
    {
      keywords: ['setting', 'configure', 'preference', 'settings page'],
      answer: () => `Settings lets you adjust detection parameters (confidence threshold, IoU threshold, max detections, min detection size) and detection behavior (stability, duplicate prevention, cooldown). Changes are saved automatically to this browser.`,
    },
    {
      keywords: ['product catalog', 'products page', 'products catalog', 'sku definition'],
      answer: () => `There's a Products Catalog page (go to the URL #products) showing a card for each of the 4 trained classes — Trident, Donut, Pickers, and Bahia — with their model metadata.`,
    },
    {
      keywords: ['backend', 'api console', 'server status', 'server health', 'database explorer', 'database', 'sqlite', 'uptime', 'traffic log'],
      answer: () => `There's a Backend & API Console page (URL #backend) showing live server health: API engine status, uptime, SQLite database size/record count, and request traffic logs — useful for checking the Python backend is actually running.`,
    },
    {
      keywords: ['product', 'class', 'trident', 'donut', 'pickers', 'bahia', 'what can it detect', 'what does it detect', 'what products'],
      answer: () => `VisionaryAI's model recognizes 4 product classes: **Trident**, **Donut**, **Pickers**, and **Bahia**.`,
    },
    {
      keywords: ['model', 'yolo', 'accuracy', 'how accurate', 'weights', 'best.pt'],
      answer: () => `Detection runs on a YOLOv8 object-detection model (weights file best.pt) trained on the 4 supported product classes. Accuracy depends on lighting, camera angle, and the confidence threshold you've set.`,
    },
    {
      keywords: ['sign in', 'log in', 'login', 'email password'],
      answer: () => `Sign in with your work email and any password on the login page — there's no SSO (Google/Microsoft sign-in was removed). Check "Remember me" to stay signed in longer.`,
    },
    {
      keywords: ['forgot password', 'forget my password', 'forget password', 'reset password', 'reset link', 'password email', 'lost my password'],
      answer: () => `"Forgot password?" on the login page sends a real password-reset email through Gmail SMTP to the address you enter. If it doesn't arrive, the backend's email credentials (backend/email_config.json) may need to be set up or refreshed.`,
    },
    {
      keywords: ['add account', 'switch account', 'multiple account', 'another account', 'more than one account', 'have multiple', 'two accounts', 'change account'],
      answer: () => `Click your avatar (top-right) to open the profile menu — "Add Account" takes you to sign in with a different identity, and any accounts you've previously signed in with on this browser appear there so you can switch between them instantly.`,
    },
    {
      keywords: ['sign out', 'log out', 'logout'],
      answer: () => `You can sign out from the profile menu — click your avatar in the top-right corner, then "Sign Out".`,
    },
    {
      keywords: ['who are you', 'are you real', 'are you ai', 'are you chatgpt', 'are you a bot'],
      answer: () => `I'm a rule-based assistant built into VisionaryAI — I match your question against a knowledge base about this app, no external AI service involved, so I only know about VisionaryAI itself.`,
    },
    {
      keywords: ['hello', 'hi', 'hey', 'yo', 'salut'],
      answer: () => `Hi! I'm the VisionaryAI Assistant. Ask me about ${TOPIC_LIST}.`,
    },
    {
      keywords: ['thank', 'thanks', 'merci'],
      answer: () => `You're welcome! Let me know if you have any other questions about VisionaryAI.`,
    },
  ];

  function normalize(text) {
    return text.toLowerCase().replace(/[^\w\s%]/g, ' ').replace(/\s+/g, ' ').trim();
  }

  function matchAnswer(text) {
    const lower = normalize(text);
    let best = null;
    let bestScore = 0;
    for (const entry of FAQ) {
      let score = 0;
      for (const kw of entry.keywords) {
        if (lower.includes(kw)) score += kw.length;
      }
      if (score > bestScore) {
        bestScore = score;
        best = entry;
      }
    }
    if (best) return best.answer();
    return `I don't have an answer for that specific wording yet, but I can help with: ${TOPIC_LIST}. Try rephrasing, or ask about one of those directly.`;
  }

  function renderMarkdownLite(text) {
    const escaped = text
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
    return escaped.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
  }

  function appendMessage(text, sender) {
    const msg = document.createElement('div');
    msg.className = `chatbot-msg ${sender}`;
    msg.innerHTML = renderMarkdownLite(text);
    messagesEl.appendChild(msg);
    messagesEl.scrollTop = messagesEl.scrollHeight;
  }

  function renderQuickReplies() {
    quickRepliesEl.innerHTML = '';
    QUICK_REPLIES.forEach((qr) => {
      const chip = document.createElement('button');
      chip.type = 'button';
      chip.className = 'chatbot-chip';
      chip.textContent = qr.label;
      chip.addEventListener('click', () => handleUserQuery(qr.query, qr.label));
      quickRepliesEl.appendChild(chip);
    });
  }

  function handleUserQuery(query, displayText) {
    appendMessage(displayText !== undefined ? displayText : query, 'user');
    const answer = matchAnswer(query);
    setTimeout(() => appendMessage(answer, 'bot'), 250);
  }

  function greetIfNeeded() {
    if (hasGreeted) return;
    hasGreeted = true;
    appendMessage(`Hi! I'm the VisionaryAI Assistant. Ask me anything about how this app works, or tap a suggestion below.`, 'bot');
    renderQuickReplies();
  }

  function openPanel() {
    opened = true;
    panelEl.classList.remove('hidden');
    panelEl.setAttribute('aria-hidden', 'false');
    bubbleEl.setAttribute('aria-expanded', 'true');
    greetIfNeeded();
    setTimeout(() => inputEl && inputEl.focus(), 50);
  }

  function closePanel() {
    opened = false;
    panelEl.classList.add('hidden');
    panelEl.setAttribute('aria-hidden', 'true');
    bubbleEl.setAttribute('aria-expanded', 'false');
  }

  function togglePanel() {
    if (opened) closePanel();
    else openPanel();
  }

  function init() {
    widgetEl = document.getElementById('chatbotWidget');
    bubbleEl = document.getElementById('chatbotBubble');
    panelEl = document.getElementById('chatbotPanel');
    messagesEl = document.getElementById('chatbotMessages');
    quickRepliesEl = document.getElementById('chatbotQuickReplies');
    formEl = document.getElementById('chatbotForm');
    inputEl = document.getElementById('chatbotInput');

    if (!widgetEl || !bubbleEl || !panelEl) return;

    bubbleEl.addEventListener('click', togglePanel);

    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && opened) closePanel();
    });

    document.addEventListener('click', (e) => {
      if (!opened) return;
      if (widgetEl.contains(e.target)) return;
      closePanel();
    });

    formEl.addEventListener('submit', (e) => {
      e.preventDefault();
      const text = inputEl.value.trim();
      if (!text) return;
      inputEl.value = '';
      handleUserQuery(text);
    });
  }

  return { init };
})();

document.addEventListener('DOMContentLoaded', () => ChatbotModule.init());
