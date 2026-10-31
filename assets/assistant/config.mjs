// Public configuration only. API credentials belong in the Worker secret store.
export const config = Object.freeze({
  endpoint: 'https://yazan-ai.yazan-alzaghloul.workers.dev/chat',
  timeoutMs: 18000,
  maxInput: 1000,
  maxHistory: 40,
  storageKey: 'yazan-ai:conversation:v1',
});

export const welcome = "Hi! 👋 I'm AI Assistant, Yazan Alzaghloul's personal assistant.\n\nAsk me anything about his experience, projects, technical skills, career achievements, or professional availability.\n\nHow can I help you today?";
export const suggestions = [
  ['💼', "Tell me about Yazan's experience"],
  ['🛠️', 'What are his technical skills?'],
  ['🚀', 'What projects has he worked on?'],
  ['🤖', 'How does he use AI in software engineering?'],
  ['🏗️', 'Tell me about his architecture experience'],
  ['📅', 'Is Yazan available for opportunities?'],
];
