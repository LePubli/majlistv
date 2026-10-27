// Étape 35 — Transcription complète lisible par les moteurs de recherche : phrases regroupées en paragraphes horodatés.
// Règles pures (sans base de données). Un paragraphe se ferme à ~`maxMs` ou `maxChars`, ou après une pause marquée entre deux phrases.
export function paragraphs(segments, { maxChars = 700, maxMs = 60000, pauseMs = 2500, totalChars = 60000 } = {}) {
  const out = [];
  let cur = null;
  let used = 0;
  for (const s of segments) {
    const text = String(s?.text || '').replace(/\s+/g, ' ').trim();
    if (!text) continue;
    const start = Math.max(0, Math.floor(Number(s.start_ms ?? s.startMs) || 0));
    const end = Math.max(start, Math.floor(Number(s.end_ms ?? s.endMs) || start));
    if (cur && (cur.text.length + text.length + 1 > maxChars || start - cur.ms >= maxMs || start - cur.endMs >= pauseMs)) { out.push({ ms: cur.ms, text: cur.text }); cur = null; }
    if (used + text.length > totalChars) break;
    used += text.length + 1;
    if (!cur) cur = { ms: start, endMs: end, text };
    else { cur.text += ` ${text}`; cur.endMs = end; }
  }
  if (cur) out.push({ ms: cur.ms, text: cur.text });
  return out;
}
