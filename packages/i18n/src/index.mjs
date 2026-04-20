export const detectLanguage = (text = '') => {
  const lowered = text.toLowerCase();
  const idHints = ['yang', 'dan', 'untuk', 'dengan', 'tidak'];
  return idHints.some((w) => lowered.includes(w)) ? 'id' : 'en';
};
