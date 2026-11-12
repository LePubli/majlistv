// Audyn (livres audio) — logique pure du lecteur du site : formats, reprise, minuteur de sommeil avec fondu.
// Identique à mobile/src/lib/audyn.ts (même comportement dans l'application). Testé sans navigateur : tests/test_audyn_player.mjs.

/** 3725 → « 1:02:05 » ; 125 → « 2:05 » ; valeur invalide → « 0:00 ». */
export function fmtClock(sec) {
  const s = Number.isFinite(sec) && sec > 0 ? Math.floor(sec) : 0;
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), r = s % 60;
  return (h > 0 ? `${h}:` : '') + `${h > 0 ? String(m).padStart(2, '0') : String(m)}:${String(r).padStart(2, '0')}`;
}
/** 5400 → « 1 h 30 » ; 1500 → « 25 min ». */
export function fmtLong(sec) {
  const s = Number.isFinite(sec) && sec > 0 ? Math.round(sec / 60) : 0;
  const h = Math.floor(s / 60), m = s % 60;
  if (h > 0) return m ? `${h} h ${String(m).padStart(2, '0')}` : `${h} h`;
  return `${m} min`;
}

// ---- Reprise (gardée dans le navigateur, par livre)
export const resumeKey = (itemId) => `audyn.pos.${String(itemId).replace(/[^A-Za-z0-9._-]/g, '_')}`;
export const encodeResume = (r) => JSON.stringify([r.cid, Math.round(r.pos), r.at]);
export function decodeResume(raw) {
  if (!raw) return null;
  try {
    const v = JSON.parse(raw);
    if (!Array.isArray(v) || typeof v[0] !== 'string' || !Number.isFinite(v[1]) || v[1] < 0) return null;
    return { cid: v[0], pos: v[1], at: Number.isFinite(v[2]) ? v[2] : 0 };
  } catch { return null; }
}
/** Où reprendre : chapitre enregistré s'il existe encore et est jouable (sinon le premier jouable) ; recule de 3 s ; début ou fin proche → début du chapitre. */
export function resumePoint(chapters, saved) {
  const first = Math.max(0, chapters.findIndex((c) => c.playable));
  if (!saved) return { index: first, pos: 0 };
  const i = chapters.findIndex((c) => c.id === saved.cid);
  if (i < 0 || !chapters[i].playable) return { index: first, pos: 0 };
  const dur = chapters[i].durationSeconds;
  if (saved.pos < 5) return { index: i, pos: 0 };
  if (dur > 0 && saved.pos >= dur - 5) return { index: i, pos: 0 };
  return { index: i, pos: Math.max(0, saved.pos - 3) };
}
// ---- « Continuer l'écoute » (page Audyn) : livres commencés sur cet appareil, les plus récents d'abord.
export const CONTINUE_MAX = 8;
/** Livres de la liste qui ont une position enregistrée, du plus récemment écouté au plus ancien. readSaved(id) -> { cid, pos, at } ou null. */
export function continueCandidates(items, readSaved, limit = CONTINUE_MAX) {
  const out = [];
  for (const it of items || []) { const s = readSaved(it.id); if (s && s.at > 0) out.push({ item: it, saved: s }); }
  return out.sort((a, b) => b.saved.at - a.saved.at).slice(0, limit);
}
/** Où en est l'écoute d'un livre : null s'il n'est pas vraiment commencé (< 5 s du premier chapitre), fini (moins de 30 s avant la fin
 *  du dernier chapitre jouable) ou si le chapitre enregistré n'existe plus. Sinon { index, count, left (secondes restantes), pct }. */
export function listenState(chapters, saved) {
  if (!saved || !Array.isArray(chapters) || !chapters.length) return null;
  const i = chapters.findIndex((c) => c.id === saved.cid);
  if (i < 0 || !chapters[i].playable) return null;
  let last = -1; chapters.forEach((c, k) => { if (c.playable) last = k; });
  const dur = Number(chapters[i].durationSeconds) || 0;
  const pos = Math.max(0, Math.min(Number(saved.pos) || 0, dur || Infinity));
  if (i === Math.max(0, chapters.findIndex((c) => c.playable)) && pos < 5) return null;
  if (i >= last && dur > 0 && pos >= dur - 30) return null;
  const total = chapters.reduce((a, c) => a + (Number(c.durationSeconds) || 0), 0);
  const before = chapters.slice(0, i).reduce((a, c) => a + (Number(c.durationSeconds) || 0), 0);
  const done = before + pos;
  return { index: i, count: chapters.length, left: Math.max(0, total - done), pct: total > 0 ? Math.min(1, done / total) : 0 };
}
export function nextPlayable(chapters, index) { for (let i = index + 1; i < chapters.length; i++) if (chapters[i].playable) return i; return -1; }
export function prevPlayable(chapters, index) { for (let i = index - 1; i >= 0; i--) if (chapters[i].playable) return i; return -1; }

// ---- Minuteur de sommeil
export const SLEEP_CHOICES = [10, 20, 30, 45, 60, 0]; // minutes ; 0 = fin du chapitre
export const FADE_SECONDS = 30;
export const NO_TIMER = { endAt: null, endOfChapter: false };
export function startSleep(minutes, now) {
  if (minutes === 0) return { endAt: null, endOfChapter: true };
  if (!Number.isFinite(minutes) || minutes < 0) return NO_TIMER;
  return { endAt: now + Math.round(minutes) * 60000, endOfChapter: false };
}
export function fadeVolume(remainingMs, fadeMs = FADE_SECONDS * 1000) {
  if (!Number.isFinite(remainingMs)) return 1;
  if (remainingMs <= 0) return 0;
  if (remainingMs >= fadeMs) return 1;
  return Math.max(0, Math.min(1, remainingMs / fadeMs));
}
export const chapterFade = (remainingSec) => fadeVolume(remainingSec * 1000, 8000);
/** Un tic par seconde : { volume, stop, remainingMs }. */
export function sleepTick(tm, now, chapterRemainingSec) {
  if (tm.endAt != null) { const rem = tm.endAt - now; return { volume: fadeVolume(rem), stop: rem <= 0, remainingMs: Math.max(0, rem) }; }
  if (tm.endOfChapter) {
    if (chapterRemainingSec == null) return { volume: 1, stop: false, remainingMs: null };
    return { volume: chapterFade(chapterRemainingSec), stop: false, remainingMs: Math.max(0, chapterRemainingSec * 1000) };
  }
  return { volume: 1, stop: false, remainingMs: null };
}

export const SPEEDS = [0.8, 1, 1.25, 1.5, 2];
export function nextSpeed(cur) { const i = SPEEDS.indexOf(cur); return SPEEDS[(i + 1) % SPEEDS.length]; }
export function seekTarget(pos, delta, duration) {
  const t = pos + delta;
  if (t < 0) return 0;
  if (duration > 0 && t > duration) return duration;
  return t;
}
export const shouldSaveResume = (last, pos, everySec = 10) => !Number.isFinite(last) || Math.abs(pos - last) >= everySec;
