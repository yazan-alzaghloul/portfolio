import { config, welcome, suggestions } from './config.mjs?v=2';
import { askAssistant, safeSources } from './service.mjs?v=2';

const icons = {
  robot: '<rect x="4" y="7" width="16" height="13" rx="5"/><path d="M12 3v4M9 15h6M1 12v4m22-4v4"/><circle cx="8.5" cy="11.5" r=".6"/><circle cx="15.5" cy="11.5" r=".6"/>',
  close: '<path d="m6 6 12 12M6 18 18 6"/>',
  minimize: '<path d="M5 15h14"/>',
  send: '<path d="M12 20V4m-7 7 7-7 7 7"/>',
};
const icon = name => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${icons[name]}</svg>`;
const el = (tag, className, text) => {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
};

export function mountAssistant() {
  if (document.querySelector('.yai-launcher')) return;
  const launcher = el('button', 'yai-launcher');
  launcher.type = 'button';
  launcher.setAttribute('aria-label', "Ask Yazan's AI Assistant");
  launcher.setAttribute('aria-haspopup', 'dialog');
  launcher.setAttribute('aria-expanded', 'false');
  launcher.setAttribute('aria-controls', 'yazan-ai');
  launcher.innerHTML = `${icon('robot')}<span class="yai-tooltip" aria-hidden="true">Ask Yazan's AI Assistant</span>`;

  const dialog = el('dialog', 'yai-dialog');
  dialog.id = 'yazan-ai';
  dialog.setAttribute('aria-labelledby', 'yai-title');
  dialog.setAttribute('aria-describedby', 'yai-description');
  // Only trusted, static markup enters innerHTML. Messages are always textContent.
  dialog.innerHTML = `
    <header class="yai-header">
      <span class="yai-avatar" aria-hidden="true">${icon('robot')}</span>
      <div class="yai-heading"><h2 id="yai-title" aria-label="AI Assistant — Yazan's portfolio assistant">AI Assistant</h2><p id="yai-description">Yazan's portfolio assistant · CV & portfolio</p></div>
      <button class="yai-icon-button" type="button" data-action="minimize" aria-label="Minimize assistant" title="Minimize">${icon('minimize')}</button>
      <button class="yai-icon-button" type="button" data-action="close" aria-label="Close assistant" title="Close">${icon('close')}</button>
    </header>
    <div class="yai-tools"><span class="yai-mode"></span><button class="yai-new" type="button">＋ New conversation</button></div>
    <div class="yai-scroll" tabindex="0" aria-label="Conversation history">
      <div class="yai-intro"><p class="yai-kicker">Inside Yazan’s portfolio</p><h3>Get to know<br>the engineer.</h3><p>Experience. Ideas. The work behind it all.</p></div>
      <div class="yai-messages" role="log" aria-label="Messages" aria-live="polite" aria-relevant="additions"></div>
      <div class="yai-suggestions" role="group" aria-label="Suggested questions"></div>
    </div>
    <form class="yai-composer">
      <label class="yai-sr-only" for="yai-input">Ask a question about Yazan</label>
      <div class="yai-input-wrap"><input id="yai-input" class="yai-input" type="text" maxlength="1000" placeholder="Ask me anything about Yazan..." autocomplete="off" enterkeyhint="send" aria-describedby="yai-privacy"><button class="yai-send" type="submit" aria-label="Send message" disabled>${icon('send')}</button></div>
      <p class="yai-feedback" role="status"></p>
      <div class="yai-footer"><span id="yai-privacy">Session-only history. Please avoid personal details.</span><a href="mailto:yazan.alzaghloul@gmail.com">Contact Yazan ↗</a></div>
    </form>`;
  document.body.append(launcher, dialog);
  const $ = selector => dialog.querySelector(selector);
  const log = $('.yai-messages'), scroll = $('.yai-scroll'), chips = $('.yai-suggestions');
  const input = $('.yai-input'), send = $('.yai-send'), mode = $('.yai-mode'), feedback = $('.yai-feedback');
  let history = [], pending = false, generation = 0, request = null, welcomeTimer = null, closingTimer = null;
  if (config.endpoint) $('#yai-privacy').textContent = 'AI replies send recent messages to OpenAI. Avoid personal details.';
  const motion = matchMedia('(prefers-reduced-motion: reduce)');
  const setMode = value => { mode.textContent = value === 'ai' ? 'Powered by AI · CV grounded' : 'Portfolio guide · Local answers'; };
  setMode('local');

  function persist() {
    try { sessionStorage.setItem(config.storageKey, JSON.stringify(history.slice(-config.maxHistory))); } catch { /* Private mode and full storage are supported. */ }
  }
  function restore() {
    try {
      const data = JSON.parse(sessionStorage.getItem(config.storageKey) || '[]');
      if (!Array.isArray(data)) return;
      history = data.slice(-config.maxHistory).filter(m => m && ['user', 'assistant'].includes(m.role)
        && typeof m.content === 'string' && m.content.length <= 6000
        && typeof m.time === 'number' && Number.isFinite(m.time) && !isNaN(new Date(m.time).getTime()))
        .map(m => ({ role: m.role, content: m.content, time: m.time, sources: safeSources(m.sources), mode: m.mode === 'ai' ? 'ai' : 'local', welcome: m.welcome === true, fallback: typeof m.fallback === 'string' ? m.fallback.slice(0, 180) : '' }));
    } catch { /* Ignore malformed or unavailable session storage. */ }
  }
  function bottom() { scroll.scrollTop = scroll.scrollHeight; }
  function showMessage(message) {
    const row = el('article', 'yai-message');
    row.dataset.role = message.role;
    const meta = el('div', 'yai-message-meta');
    const name = el('strong', '', message.role === 'user' ? 'You' : 'AI Assistant');
    const time = el('time', '', new Date(message.time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }));
    time.dateTime = new Date(message.time).toISOString();
    meta.append(name, time);
    row.append(meta, el('div', 'yai-bubble', message.content));
    if (message.fallback) row.append(el('p', 'yai-note', message.fallback));
    if (message.sources?.length) {
      const sources = el('div', 'yai-sources');
      sources.setAttribute('aria-label', 'Related sources');
      safeSources(message.sources).forEach(source => {
        const link = el('a', '', `${source.title} ↗`);
        link.href = source.url;
        if (source.url.startsWith('https://')) { link.target = '_blank'; link.rel = 'noopener noreferrer'; }
        if (source.url.startsWith('#')) link.addEventListener('click', () => close(true));
        sources.append(link);
      });
      row.append(sources);
    }
    log.append(row);
  }
  function add(message) {
    history.push({ ...message, time: Date.now() });
    if (history.length > config.maxHistory) history.splice(0, history.length - config.maxHistory);
    showMessage(history.at(-1));
    persist(); bottom();
  }
  function typing(active) {
    $('.yai-typing')?.remove();
    log.setAttribute('aria-busy', String(active));
    if (!active) return;
    const node = el('div', 'yai-typing');
    node.setAttribute('role', 'status');
    node.setAttribute('aria-label', 'AI Assistant is typing');
    node.innerHTML = '<span></span><span></span><span></span>';
    log.append(node); bottom();
  }
  function busy(active) {
    pending = active;
    send.disabled = active || !input.value.trim();
    chips.querySelectorAll('button').forEach(b => { b.disabled = active; });
    typing(active);
  }
  function renderChips() {
    chips.replaceChildren();
    if (history.some(m => m.role === 'user')) return;
    const label = el('p', 'yai-kicker', 'A few things you can ask');
    chips.append(label);
    suggestions.forEach(([emoji, question]) => {
      const chip = el('button', 'yai-suggestion');
      chip.type = 'button';
      chip.append(el('span', '', emoji), el('span', '', question), el('span', '', '↗'));
      chip.lastChild.setAttribute('aria-hidden', 'true');
      chip.disabled = pending;
      chip.addEventListener('click', () => submit(question));
      chips.append(chip);
    });
  }
  function greet() {
    clearTimeout(welcomeTimer);
    busy(true);
    welcomeTimer = setTimeout(() => {
      typing(false);
      add({ role: 'assistant', content: welcome.replace("I'm Yazan AI", "I'm AI Assistant").replace("personal AI assistant", "personal assistant"), welcome: true, mode: 'local' });
      busy(false); renderChips();
      // Keep the introduction at the top on the first opening.
      scroll.scrollTop = 0;
    }, motion.matches ? 100 : 650);
  }
  function open() {
    clearTimeout(closingTimer);
    launcher.setAttribute('aria-expanded', 'true');
    launcher.dataset.active = '';
    if (!dialog.open) dialog.showModal();
    requestAnimationFrame(() => { dialog.dataset.visible = ''; });
    // Native dialog provides focus containment, Escape handling and inert background.
    input.focus({ preventScroll: true });
    if (!history.length && !pending) greet();
    else bottom();
  }
  function close(immediate = false) {
    delete dialog.dataset.visible;
    const finish = () => {
      dialog.close();
      launcher.setAttribute('aria-expanded', 'false');
      delete launcher.dataset.active;
      launcher.focus({ preventScroll: true });
    };
    clearTimeout(closingTimer);
    if (immediate || motion.matches) finish();
    else closingTimer = setTimeout(finish, 200);
  }
  async function submit(question) {
    const text = question.trim();
    if (pending || !text) return;
    if (text.length > config.maxInput) { feedback.textContent = `Please use ${config.maxInput} characters or fewer.`; return; }
    feedback.textContent = '';
    const previous = [...history];
    add({ role: 'user', content: text });
    input.value = ''; renderChips(); busy(true);
    if (dialog.open) input.focus({ preventScroll: true });
    request = new AbortController();
    const current = ++generation;
    try {
      const answer = await askAssistant(text, previous, { signal: request.signal });
      if (current !== generation) return;
      typing(false);
      add({ role: 'assistant', content: answer.text, ...answer });
      setMode(answer.mode);
    } catch (error) {
      if (current === generation && error.name !== 'AbortError') feedback.textContent = 'Please try again, or contact Yazan using the link below.';
    } finally {
      if (current === generation) { busy(false); request = null; }
    }
  }
  function reset() {
    generation++; request?.abort(); request = null;
    clearTimeout(welcomeTimer); history = []; log.replaceChildren(); persist();
    feedback.textContent = ''; input.value = ''; setMode('local');
    renderChips(); greet(); input.focus({ preventScroll: true });
  }
  launcher.addEventListener('click', open);
  $('[data-action="minimize"]').addEventListener('click', () => close());
  $('[data-action="close"]').addEventListener('click', () => close());
  dialog.addEventListener('cancel', event => { event.preventDefault(); close(); });
  dialog.addEventListener('keydown', event => {
    if (event.key !== 'Tab') return;
    const focusable = [...dialog.querySelectorAll('button:not(:disabled), a[href], input:not(:disabled), [tabindex="0"]')]
      .filter(node => node.getClientRects().length);
    const first = focusable[0], last = focusable.at(-1);
    if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
    else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
  });
  $('.yai-new').addEventListener('click', reset);
  $('.yai-composer').addEventListener('submit', event => { event.preventDefault(); submit(input.value); });
  input.addEventListener('input', () => { send.disabled = pending || !input.value.trim(); });
  // Enter uses native form submission; IME composition must complete first.
  input.addEventListener('keydown', event => { if (event.key === 'Enter' && event.isComposing) event.preventDefault(); });
  window.addEventListener('pagehide', () => { request?.abort(); persist(); });
  restore(); history.forEach(showMessage); renderChips();
  const lastAnswer = [...history].reverse().find(m => m.role === 'assistant' && !m.welcome);
  if (lastAnswer) setMode(lastAnswer.mode);
}
mountAssistant();
