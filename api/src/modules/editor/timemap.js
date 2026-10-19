// Module « Éditeur de montage » — étape E4b : CARTE DU TEMPS entre la vidéo publiée et la vidéo rendue.
//
// Un rendu = les extraits du montage (temps de la source), mis bout à bout, précédés de l'écran d'ouverture (intro).
// La carte dit où se trouve, dans la nouvelle vidéo, chaque instant de l'ancienne (et l'inverse, pour « Restaurer l'original »).
//   - instant gardé  → nouvel instant ;
//   - instant coupé  → « coupé », recalé au début du passage gardé suivant (notes, reprise de lecture), ou à la fin de la vidéo ;
//   - phrase (début, fin) → le plus long morceau gardé (au moins 0,3 s), sinon retirée.
// Pur : ni base ni stockage. Unités : secondes.
const r3 = (x) => Math.round(x * 1000) / 1000;

// parts : [{ in, out, start }] (start = place dans la nouvelle vidéo, intro comprise), total = durée de la nouvelle vidéo.
export function buildMap(timeline, { introLen = 0, outroLen = 0 } = {}) {
  let t = introLen;
  const parts = (timeline?.clips || []).map((c) => { const p = { in: Number(c.in), out: Number(c.out), start: r3(t) }; t += c.out - c.in; return p; });
  return { parts, intro: introLen, outro: outroLen, total: r3(t + outroLen), body: r3(t), srcDuration: Number(timeline?.duration) || null };
}

// Instant de l'ancienne vidéo → { t, cut } dans la nouvelle.
export function mapPoint(map, s) {
  for (const p of map.parts) if (s >= p.in - 1e-6 && s < p.out - 1e-6) return { t: r3(p.start + (s - p.in)), cut: false };
  // Coupé : début du passage qui suit dans la source (le plus proche après s), sinon fin du montage.
  let best = null;
  for (const p of map.parts) if (p.in >= s && (!best || p.in < best.in)) best = p;
  return { t: best ? best.start : map.body, cut: true };
}

// Phrase [s, e] de l'ancienne vidéo → { s, e } dans la nouvelle (plus long morceau gardé) ou null.
export function mapRange(map, s, e, minPart = 0.3) {
  let best = null;
  for (const p of map.parts) {
    const a = Math.max(s, p.in); const b = Math.min(e, p.out);
    if (b - a < minPart - 1e-6) continue;
    if (!best || b - a > best.len) best = { s: r3(p.start + (a - p.in)), e: r3(p.start + (b - p.in)), len: b - a };
  }
  return best ? { s: best.s, e: best.e } : null;
}

// Carte inverse (nouvelle vidéo → ancienne), pour revenir à l'original.
export function inverseMap(map) {
  const parts = map.parts.map((p) => ({ in: p.start, out: r3(p.start + (p.out - p.in)), start: p.in })).sort((a, b) => a.in - b.in);
  return { parts, intro: 0, outro: 0, total: map.srcDuration, body: map.srcDuration ?? (parts.length ? Math.max(...parts.map((p) => p.start + (p.out - p.in))) : 0), srcDuration: map.total };
}

// Liste de positions (ms) : nouvelles positions (ms) et nombre de positions coupées.
export const mapMs = (map, ms) => { const r = mapPoint(map, Number(ms) / 1000); return { ms: Math.max(0, Math.round(r.t * 1000)), cut: r.cut }; };

// Phrases (ms) d'une langue : [{ idx, start_ms, end_ms, text }] → nouvelles phrases, renumérotées dans l'ordre.
export function mapSegments(map, segs) {
  const out = [];
  for (const sg of segs) {
    const r = mapRange(map, sg.start_ms / 1000, sg.end_ms / 1000);
    if (r) out.push({ old: sg.idx, start_ms: Math.round(r.s * 1000), end_ms: Math.max(Math.round(r.s * 1000) + 1, Math.round(r.e * 1000)), text: sg.text });
  }
  out.sort((a, b) => a.start_ms - b.start_ms || a.old - b.old);
  return out.map((x, i) => ({ idx: i, start_ms: x.start_ms, end_ms: x.end_ms, text: x.text, old: x.old }));
}

// Chapitres [{ ms, title }] : déplacés ; un chapitre coupé passe au début du passage suivant ; doublons retirés (le premier reste).
export function mapChapters(map, chapters) {
  const seen = new Set(); const out = [];
  for (const c of chapters || []) {
    const ms = mapMs(map, c.ms).ms;
    if (ms >= map.body * 1000 - 500) continue; // après la fin du montage (écran de fin) : retiré
    if (seen.has(ms)) continue;
    seen.add(ms); out.push({ ...c, ms });
  }
  return out.sort((a, b) => a.ms - b.ms);
}

// Texte normalisé (recherche d'un passage cité dans la nouvelle transcription).
export const norm = (s) => String(s || '').toLowerCase().normalize('NFKD').replace(/[̀-ًͯ-ٰٟ]/g, '').replace(/[^\p{L}\p{N}]+/gu, ' ').trim();

// Passage cité retrouvé dans des phrases : début (ms) de la phrase qui le contient, la plus proche de nearMs ; null sinon.
export function findQuote(segs, quote, nearMs = 0) {
  const q = norm(quote);
  if (q.length < 8) return null;
  let best = null;
  // Fenêtre glissante de 1 à 3 phrases (une citation peut tenir sur deux phrases).
  for (let i = 0; i < segs.length; i += 1) {
    let txt = '';
    for (let k = i; k < Math.min(segs.length, i + 3); k += 1) {
      txt = `${txt} ${norm(segs[k].text)}`.trim();
      if (txt.includes(q)) {
        const d = Math.abs(segs[i].start_ms - nearMs);
        if (!best || d < best.d) best = { ms: segs[i].start_ms, d };
        break;
      }
    }
  }
  return best ? best.ms : null;
}
