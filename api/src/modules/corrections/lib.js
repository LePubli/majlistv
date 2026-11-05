// Amélioration 4.1 — règles pures des corrections de sous-titres (testées sans base).
const LINK = /(https?:\/\/|www\.)/i;
// eslint-disable-next-line no-control-regex
const CONTROL = /[\u0000-\u0008\u000B-\u001F\u007F​-‏‪-‮⁦-⁩]/g;

/** Texte nettoyé : caractères de contrôle et de direction invisibles retirés, espaces et retours à la ligne réduits à un espace. */
export const normalizeText = (s) => String(s ?? '').replace(CONTROL, '').replace(/\s+/g, ' ').trim();

/**
 * Valide une suggestion. Renvoie { text } ou { error, code }.
 * Refuse : vide, identique à l'original, trop long, lien (spam) absent de l'original.
 */
export function cleanSuggestion(original, raw) {
  const text = normalizeText(raw);
  const base = normalizeText(original);
  if (!text) return { error: 'La correction est vide', code: 'empty' };
  if (text === base) return { error: 'La correction est identique à la phrase actuelle', code: 'same' };
  if (text.length > 2000 || text.length > base.length * 3 + 100) return { error: 'La correction est trop longue par rapport à la phrase', code: 'too_long' };
  if (LINK.test(text) && !LINK.test(base)) return { error: 'Les liens ne sont pas acceptés dans une correction', code: 'link' };
  return { text };
}

/** Mots changés entre deux phrases (pour l'affichage « avant / après ») : [{ t, kind: 'same' | 'del' | 'add' }], diff par mots (plus longue sous-suite commune). */
export function wordDiff(a, b) {
  const x = normalizeText(a).split(' ').filter(Boolean);
  const y = normalizeText(b).split(' ').filter(Boolean);
  const n = x.length, m = y.length;
  if (n * m > 250000) return [...x.map((t) => ({ t, kind: 'del' })), ...y.map((t) => ({ t, kind: 'add' }))]; // phrase démesurée : pas de calcul fin
  const L = Array.from({ length: n + 1 }, () => new Uint16Array(m + 1));
  for (let i = n - 1; i >= 0; i -= 1) for (let j = m - 1; j >= 0; j -= 1) L[i][j] = x[i] === y[j] ? L[i + 1][j + 1] + 1 : Math.max(L[i + 1][j], L[i][j + 1]);
  const out = [];
  let i = 0, j = 0;
  while (i < n && j < m) {
    if (x[i] === y[j]) { out.push({ t: x[i], kind: 'same' }); i += 1; j += 1; }
    else if (L[i + 1][j] >= L[i][j + 1]) { out.push({ t: x[i], kind: 'del' }); i += 1; }
    else { out.push({ t: y[j], kind: 'add' }); j += 1; }
  }
  for (; i < n; i += 1) out.push({ t: x[i], kind: 'del' });
  for (; j < m; j += 1) out.push({ t: y[j], kind: 'add' });
  return out;
}
