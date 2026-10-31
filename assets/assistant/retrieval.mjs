import { knowledge, sourceLinks, contactLinks } from './knowledge.mjs?v=2';

const stop = new Set('a an and are as at be can could did do does for from has have he her him his how i in is it me my of on or please she show tell that the their them these they this to was were what when where which who why with would yazan alzaghloul about anything more details'.split(' '));
const normalize = text => text.toLowerCase().normalize('NFKC').replace(/[^a-z0-9\s]/g, ' ').replace(/\s+/g, ' ').trim();
const tokens = text => [...new Set(normalize(text).split(' ').filter(t => t.length > 1 && !stop.has(t)))];
const followup = text => /\b(more|that|those|this|it|them|elaborate|examples|expand|continue)\b/i.test(text) && tokens(text).length <= 4;

// Stable retrieval contract: replace this function with vector search later.
export function retrieve(question, history = [], limit = 4) {
  let query = question;
  if (followup(question)) {
    const previous = [...history].reverse().find(m => m.role === 'user' && m.content !== question && !followup(m.content));
    if (previous) query = `${previous.content} ${question}`;
  }
  const words = tokens(query);
  const normalized = normalize(query);
  if (!words.length) return [];
  return knowledge.map(doc => {
    const titleWords = tokens(doc.title);
    const bodyWords = new Set(tokens(doc.text));
    const score = words.reduce((sum, word) => sum + (titleWords.includes(word) ? 3 : bodyWords.has(word) ? 1 : 0), 0);
    // Phrase matches carry more weight than incidental mentions in a paragraph.
    const keywordScore = doc.keywords.reduce((sum, key) => sum + ((key.includes(' ') ? normalized.includes(key) : words.includes(key)) ? 6 : 0), 0);
    return { doc, score: score + keywordScore };
  }).filter(item => item.score >= 3).sort((a, b) => b.score - a.score).slice(0, limit).map(item => item.doc);
}

export function localAnswer(question, history = []) {
  const q = normalize(question);
  if (/^(hi|hello|hey|thanks|thank you|good morning|good evening)[ !.]*$/.test(q)) {
    return { text: 'Happy to help! You can ask about Yazan’s experience, technical skills, architecture work, or a specific project.', sources: [{ title: 'Explore the portfolio', url: '#about' }], mode: 'local' };
  }
  if (/\b(ignore|override|system prompt|pretend|instructions|jailbreak|secret|api key)\b/.test(q)) {
    return { text: 'I can help you explore Yazan’s professional background using his CV and portfolio. What would you like to know about his work?', sources: [{ title: 'Professional background', url: '#about' }], mode: 'local' };
  }
  const docs = retrieve(question, history);
  const availability = docs.find(d => d.id === 'availability');
  const unknown = /\b(salary|notice|calendar|schedule|availability|available|relocat\w*|work authorization|freelance)\b/.test(q);
  const selected = availability && unknown ? [availability] : docs.slice(0, followup(question) ? 3 : 2);
  const text = selected.length
    ? selected.map(d => `${d.title}\n${d.text}`).join('\n\n')
    : 'I don’t have confirmed information about that in Yazan’s CV or portfolio. I can help with his career, projects, skills, and achievements. For other details, please contact Yazan directly.';
  return { text, sources: selected.length ? sourceLinks(selected) : contactLinks.slice(0, 2), mode: 'local' };
}
