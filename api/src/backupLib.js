// Étape 37 — Sauvegardes : calculs purs (testés avec Node, aucune base requise).
// Le VPS envoie un rapport après chaque sauvegarde nocturne et après chaque test de restauration ;
// le site en déduit un niveau (ok / warn / crit) et prévient par e-mail quand les rapports manquent ou signalent un échec.

export const KINDS = ['backup', 'restore_test'];
/** Niveau → nombre, pour réutiliser le mécanisme d'alerte de la santé du serveur (seuils 1 = attention, 2 = critique). */
export const LEVEL_NUM = { ok: 0, warn: 1, crit: 2 };

const clamp = (v, lo, hi, def) => { const n = Number(v); return Number.isFinite(n) ? Math.min(hi, Math.max(lo, Math.round(n))) : def; };
export const maxBackupHours = (v) => clamp(v, 6, 24 * 14, 30);
export const maxRestoreDays = (v) => clamp(v, 1, 90, 10);

/** « il y a 3 h » / « il y a 2 j » (texte court pour les messages). */
export function ageText(ms) {
  const m = Math.max(0, Math.round(ms / 60000));
  if (m < 90) return `${m} min`;
  const h = Math.round(m / 60);
  return h < 48 ? `${h} h` : `${Math.round(h / 24)} j`;
}

/** Ne garde que des champs connus et de petite taille (le jeton est le seul garde-fou : on ne stocke pas n'importe quoi). */
export function cleanDetails(d) {
  const out = {};
  if (!d || typeof d !== 'object') return out;
  for (const k of ['snapshots', 'repoBytes', 'dumpBytes', 'restoreTalks', 'prodTalks', 'restoreUsers', 'prodUsers', 'restoreSeries', 'prodSeries', 'tables', 'garageFiles', 'garageBytes', 'durationSec']) {
    const n = Number(d[k]);
    if (d[k] != null && Number.isFinite(n) && n >= 0 && n < 1e15) out[k] = Math.round(n);
  }
  if (typeof d.snapshotAt === 'string' && !Number.isNaN(Date.parse(d.snapshotAt))) out.snapshotAt = new Date(d.snapshotAt).toISOString();
  if (typeof d.garageOk === 'boolean') out.garageOk = d.garageOk;
  return out;
}

/**
 * Évalue l'état des sauvegardes.
 * last : { backup: {at (ms), ok, summary, details} | null, restore_test: idem | null }, cfg : { tokenSet, maxHours, maxDays }.
 * Retourne { level: 'off' | 'ok' | 'warn' | 'crit', reasons: [texte] }.
 */
export function evaluateBackup(last, cfg, now = Date.now()) {
  if (!cfg.tokenSet) return { level: 'off', reasons: ['Suivi non activé : aucun jeton de rapport dans les réglages.'] };
  let level = 'ok';
  const reasons = [];
  const raise = (l, text) => { if (LEVEL_NUM[l] > LEVEL_NUM[level]) level = l; reasons.push(text); };
  const b = last.backup, r = last.restore_test;
  const maxMs = maxBackupHours(cfg.maxHours) * 3600e3, maxRestoreMs = maxRestoreDays(cfg.maxDays) * 86400e3;

  if (!b) raise('warn', 'Aucun rapport de sauvegarde reçu pour l’instant (la première sauvegarde nocturne doit s’être exécutée).');
  else {
    if (!b.ok) raise('crit', `La dernière sauvegarde (il y a ${ageText(now - b.at)}) a échoué : ${b.summary || 'sans détail'}.`);
    if (now - b.at > maxMs) raise('crit', `Aucune sauvegarde reçue depuis ${ageText(now - b.at)} (maximum attendu : ${maxBackupHours(cfg.maxHours)} h).`);
    if (b.ok && b.details && b.details.garageOk === false) raise('warn', 'La sauvegarde est passée mais celle des vidéos (Garage) a signalé un problème.');
  }
  if (!r) raise('warn', 'Aucun test de restauration reçu pour l’instant.');
  else {
    if (!r.ok) raise('crit', `Le dernier test de restauration (il y a ${ageText(now - r.at)}) a échoué : ${r.summary || 'sans détail'}.`);
    else if (now - r.at > maxRestoreMs) raise('warn', `Dernier test de restauration réussi il y a ${ageText(now - r.at)} (maximum attendu : ${maxRestoreDays(cfg.maxDays)} j).`);
  }
  return { level, reasons };
}
