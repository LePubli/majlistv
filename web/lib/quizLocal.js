// Résultats de quiz gardés dans le navigateur : 7 jours pour un visiteur sans compte (aussi utilisés comme repère
// sur l'appareil d'un membre), et liste des quiz « à valider » rappelés par la bannière.
// Tout est facultatif : si le stockage est indisponible, rien ne casse.
const KEY = 'mejliss.quiz.v1';
const TTL = 7 * 24 * 3600 * 1000;

function read() {
  try {
    const o = JSON.parse(localStorage.getItem(KEY) || '{}');
    const now = Date.now();
    const results = {};
    for (const [id, r] of Object.entries(o.results || {})) if (r && now - r.at < TTL) results[id] = r;
    const pending = (o.pending || []).filter((p) => p && now - p.at < TTL && !(results[p.id] && results[p.id].passed));
    return { results, pending };
  } catch { return { results: {}, pending: [] }; }
}
function write(v) { try { localStorage.setItem(KEY, JSON.stringify(v)); } catch { /* stockage indisponible */ } }

export const getResult = (id) => read().results[id] || null;

// Garde le meilleur pourcentage ; une réussite reste acquise.
export function saveResult(id, { percent, passed }) {
  const v = read();
  const old = v.results[id];
  v.results[id] = { percent: Math.max(percent, old ? old.percent : 0), passed: Boolean(passed || (old && old.passed)), at: Date.now() };
  if (v.results[id].passed) v.pending = v.pending.filter((p) => p.id !== id);
  write(v);
  return v.results[id];
}

// Quiz laissé de côté : rappelé discrètement sur les pages suivantes.
export function addPending(talk) {
  const v = read();
  if ((v.results[talk.id] && v.results[talk.id].passed) || v.pending.some((p) => p.id === talk.id)) return;
  v.pending = [{ id: talk.id, title: talk.title, at: Date.now() }, ...v.pending].slice(0, 5);
  write(v);
}
export function removePending(id) { const v = read(); v.pending = v.pending.filter((p) => p.id !== id); write(v); }
export const getPending = (excludeId) => read().pending.filter((p) => p.id !== excludeId);
