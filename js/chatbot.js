/**
 * VisionaryAI Help Assistant
 * Real AI assistant: every question is sent to the backend's POST /api/chat,
 * which calls a local Ollama model grounded in live VisionaryAI application
 * data (settings, recent detections, dashboard stats). No hardcoded/local
 * answers, no cloud API.
 */

'use strict';

const ChatbotModule = (() => {
  let widgetEl, bubbleEl, panelEl, messagesEl, quickRepliesEl, formEl, inputEl;
  let opened = false;
  let hasGreeted = false;
  let isSending = false;
  const conversationHistory = []; // [{role: 'user'|'assistant', content: string}]

  const QUICK_REPLIES = [
    { label: 'Confidence threshold', query: 'What is my current confidence threshold?' },
    { label: 'Live Detection', query: 'How does Live Detection work?' },
    { label: 'Detection History', query: 'What can I do on the Detection History page?' },
    { label: 'What can you help with?', query: 'What can you help me with?' },
  ];

  function getCurrentUserInfo() {
    try {
      if (typeof Auth !== 'undefined' && Auth.getUser) {
        const user = Auth.getUser();
        return user && user.name ? { name: user.name } : null;
      }
    } catch (e) {}
    return null;
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
    return msg;
  }

  function appendTypingIndicator() {
    const msg = document.createElement('div');
    msg.className = 'chatbot-msg bot chatbot-msg-typing';
    msg.textContent = 'Thinking…';
    messagesEl.appendChild(msg);
    messagesEl.scrollTop = messagesEl.scrollHeight;
    return msg;
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

  async function handleUserQuery(query, displayText) {
    if (isSending) return;
    isSending = true;
    if (inputEl) inputEl.disabled = true;

    appendMessage(displayText !== undefined ? displayText : query, 'user');
    const typingEl = appendTypingIndicator();

    try {
      const reply = await Api.sendChatMessage(query, conversationHistory, getCurrentUserInfo());
      typingEl.remove();
      appendMessage(reply, 'bot');
      conversationHistory.push({ role: 'user', content: query });
      conversationHistory.push({ role: 'assistant', content: reply });
    } catch (err) {
      typingEl.remove();
      appendMessage(err.message || 'Sorry, I\'m having trouble reaching the AI assistant right now. Please try again.', 'bot');
    } finally {
      isSending = false;
      if (inputEl) { inputEl.disabled = false; inputEl.focus(); }
    }
  }

  function greetIfNeeded() {
    if (hasGreeted) return;
    hasGreeted = true;
    appendMessage(`Hi! I'm the VisionaryAI Assistant, powered by a local AI model running on this machine. Ask me anything about how this app works, or tap a suggestion below.`, 'bot');
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
      if (!text || isSending) return;
      inputEl.value = '';
      handleUserQuery(text);
    });
  }

  return { init };
})();

document.addEventListener('DOMContentLoaded', () => ChatbotModule.init());
