import { config } from './config.mjs?v=2';
import { localAnswer } from './retrieval.mjs?v=2';
import { knowledge, contactLinks } from './knowledge.mjs?v=2';

const allowedLinks = new Set([...knowledge.map(d => d.url), ...contactLinks.map(d => d.url)]);
export function safeSources(sources) {
  if (!Array.isArray(sources)) return [];
  return sources.filter(s => s && typeof s.title === 'string' && allowedLinks.has(s.url))
    .slice(0, 3).map(s => ({ title: s.title.slice(0, 100), url: s.url }));
}

// The backend requires strict user/assistant alternation ending in an assistant turn.
// History can break that: a request aborted on page exit leaves an unanswered user turn
// in session storage. Collapse same-role runs (keeping the latest) and drop a trailing
// user turn so one interrupted request can't send the rest of the session to fallback.
export function toTranscript(history) {
  const turns = [];
  for (const m of history) {
    if (!m || !['user', 'assistant'].includes(m.role) || m.welcome || typeof m.content !== 'string') continue;
    const content = m.content.trim().slice(0, m.role === 'user' ? 1000 : 4000);
    if (!content) continue;
    if (turns.at(-1)?.role === m.role) turns[turns.length - 1] = { role: m.role, content };
    else turns.push({ role: m.role, content });
  }
  const messages = turns.slice(-10);
  while (messages.length && messages[0].role !== 'user') messages.shift();
  if (messages.at(-1)?.role === 'user') messages.pop();
  return messages;
}

export async function askAssistant(question, history, { signal, settings = config, fetcher = fetch } = {}) {
  if (!settings.endpoint) return localAnswer(question, history);
  const controller = new AbortController();
  const abort = () => controller.abort();
  signal?.addEventListener('abort', abort, { once: true });
  if (signal?.aborted) controller.abort();
  const timeout = setTimeout(abort, settings.timeoutMs);
  try {
    const endpoint = new URL(settings.endpoint);
    if (endpoint.protocol !== 'https:' && !(endpoint.protocol === 'http:' && ['localhost', '127.0.0.1'].includes(endpoint.hostname))) throw new Error('Invalid endpoint');
    let messages = toTranscript(history);
    messages.push({ role: 'user', content: question });
    while (JSON.stringify(messages).length > 12000 && messages.length > 1) messages.splice(0, 2);
    const response = await fetcher(endpoint.href, {
      method: 'POST', credentials: 'omit', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ messages }), signal: controller.signal,
    });
    if (!response.ok) throw new Error(response.status === 429 ? 'rate-limit' : 'unavailable');
    const data = await response.json();
    if (typeof data.text !== 'string' || !data.text.trim() || data.text.length > 6000 || data.mode !== 'ai') throw new Error('Invalid response');
    return { text: data.text, sources: safeSources(data.sources), mode: 'ai' };
  } catch (error) {
    if (signal?.aborted) throw new DOMException('Conversation cancelled', 'AbortError');
    return { ...localAnswer(question, history), fallback: error.message === 'rate-limit' ? 'The AI service is busy. Here is an answer from the saved portfolio.' : 'The AI service is unavailable. Here is an answer from the saved portfolio.' };
  } finally {
    clearTimeout(timeout);
    signal?.removeEventListener('abort', abort);
  }
}
