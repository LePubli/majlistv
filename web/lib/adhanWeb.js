// Adhan sur le site : règles pures (testées). Le catalogue est le même que celui de l'application
// (mobile/assets/sounds/adhans.json) ; les fichiers sont servis depuis /adhan/ (public/adhan).
// Réglage propre à ce navigateur (localStorage), jamais envoyé au serveur.
export const ADHANS = [
  { id: 'adhan-1', name: 'Adhan 1', file: 'adhan_1.mp3' },
  { id: 'adhan-2', name: 'Adhan 2', file: 'adhan_2.mp3' },
  { id: 'adhan-3', name: 'Adhan 3', file: 'adhan_3.mp3' },
  { id: 'adhan-4', name: 'Adhan 4', file: 'adhan_4.mp3' },
  { id: 'adhan-5', name: 'Adhan 5', file: 'adhan_5.mp3' },
];
export const ADHAN_KEY = 'prayerAdhan';
export const ADHAN_DONE_KEY = 'prayerAdhanDone';
export const GRACE_MS = 90_000; // une prière ne sonne que dans les 90 s qui suivent son heure (pas pour une page ouverte plus tard)

export const adhanUrl = (a) => `/adhan/${a.file}`;
export const pickAdhan = (id) => ADHANS.find((a) => a.id === id) || ADHANS[0];

/** Réglage lu (valeur étrange → silencieux : le site ne sonne jamais sans que le visiteur l'ait demandé). */
export function readAdhanPrefs(raw) {
  let s = {};
  try { s = JSON.parse(raw) || {}; } catch { s = {}; }
  return { mode: s.mode === 'adhan' ? 'adhan' : 'silent', id: pickAdhan(s.id).id };
}

/**
 * Prière à annonce maintenant : la plus récente prière cochée dont l'heure est passée depuis moins de GRACE_MS
 * et qui n'a pas déjà sonné ({ clé: instant }). Le lever du soleil n'en est pas une.
 */
export function dueAdhan(items, nowMs, prayers, done, ids = ['fajr', 'dhuhr', 'asr', 'maghrib', 'isha']) {
  const due = items.filter((p) => ids.includes(p.id) && prayers[p.id] && p.at <= nowMs && nowMs - p.at < GRACE_MS);
  const last = due[due.length - 1];
  if (!last) return null;
  const key = `${last.id}@${Math.floor(last.at / 60_000)}`;
  return done[key] ? null : { ...last, key };
}
