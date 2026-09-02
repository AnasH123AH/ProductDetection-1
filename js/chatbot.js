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
    { label: 'Product classes', query: 'what products can it detect' },
  ];

  const FAQ = [
    {
      keywords: ['confidence', 'threshold'],
      answer: () => `The current confidence threshold is **${getLiveConfidenceThreshold()}%**. Detections below this score are ignored. You can change it from the Settings page under "Live Detection" — note the backend also enforces a hard minimum of 70%, so values under that are not accepted.`,
    },
    {
      keywords: ['live', 'detect', 'camera', 'webcam'],
      answer: () => `Live Detection uses your camera and the YOLOv8 model in real time. Open the "Live Detection" page, allow camera access, and point it at a product — detected items are boxed and labeled with their confidence score, and saved to Detection History automatically.`,
    },
    {
      keywords: ['history', 'past detection', 'record'],
      answer: () => `Detection History lists every saved detection with its product, confidence, and timestamp. You can filter, page through results, and export/import data as CSV from that page.`,
    },
    {
      keywords: ['csv', 'export', 'import'],
      answer: () => `You can export Detection History to a CSV file, or import a previously exported CSV, using the buttons on the Detection History page.`,
    },
    {
      keywords: ['analytics', 'trend', 'chart', 'stat'],
      answer: () => `The Analytics page shows detection trends over time and a per-product confidence breakdown (average, min, and max confidence), based on your real saved detections.`,
    },
    {
      keywords: ['dashboard', 'overview', 'summary'],
      answer: () => `The Dashboard gives a quick overview: total detections, today's and this week's counts, average confidence, your top product, and a recent-detections list.`,
    },
    {
      keywords: ['setting', 'configure', 'preference'],
      answer: () => `Settings lets you adjust the Live Detection confidence threshold and other app preferences. Changes are saved automatically to this browser.`,
    },
    {
      keywords: ['product', 'class', 'trident', 'donut', 'pickers', 'bahia', 'what can it detect', 'what does it detect'],
      answer: () => `VisionaryAI's model recognizes 4 product classes: **Trident**, **Donut**, **Pickers**, and **Bahia**.`,
    },
    {
      keywords: ['model', 'yolo', 'accuracy', 'how accurate'],
      answer: () => `Detection runs on a YOLOv8 object-detection model trained on the 4 supported product classes. Accuracy depends on lighting, camera angle, and the confidence threshold you've set.`,
    },
    {
      keywords: ['sign out', 'log out', 'logout'],
      answer: () => `You can sign out from the profile menu — click your avatar in the top-right corner, then "Sign Out".`,
    },
    {
      keywords: ['hello', 'hi', 'hey', 'yo'],
      answer: () => `Hi! I'm the VisionaryAI Assistant. Ask me about confidence thresholds, Live Detection, Detection History, Analytics, or the product classes.`,
    },
    {
      keywords: ['thank', 'thanks'],
      answer: () => `You're welcome! Let me know if you have any other questions about VisionaryAI.`,
    },
  ];

  const FALLBACK = `I'm not sure about that one. I can help with: confidence threshold, Live Detection, Detection History, CSV export/import, Analytics, Dashboard, Settings, and the product classes (Trident, Donut, Pickers, Bahia).`;

  function matchAnswer(text) {
    const lower = text.toLowerCase();
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
    return best ? best.answer() : FALLBACK;
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
