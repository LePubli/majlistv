// Étape 29 — Santé du serveur : calculs purs (testés avec Node, aucune base ni système requis).

/** Pourcentage utilisé comme `df` : utilisé / (utilisé + disponible pour un utilisateur ordinaire). */
export function diskFromStatfs(s) {
  const bsize = Number(s.bsize), blocks = Number(s.blocks), bfree = Number(s.bfree), bavail = Number(s.bavail);
  const total = blocks * bsize;
  const used = (blocks - bfree) * bsize;
  const free = bavail * bsize;
  const denom = used + free;
  return { total, used, free, pct: denom > 0 ? Math.min(100, Math.ceil((used / denom) * 100)) : 0 };
}

/** Mémoire : « disponible » (cache récupérable compris) et pourcentage réellement utilisé. */
export function memFrom(total, avail) {
  const t = Number(total), a = Math.min(Number(avail), t);
  return { total: t, avail: a, used: t - a, pct: t > 0 ? Math.round(((t - a) / t) * 100) : 0 };
}

/** Niveau d'une mesure : 'crit' ≥ seuil critique, 'warn' ≥ seuil d'alerte, sinon 'ok'. Seuils incohérents : le critique ne peut pas être sous l'alerte. */
export function levelOf(pct, warn, crit) {
  const w = Number(warn), c = Math.max(Number(crit), w);
  if (!Number.isFinite(pct)) return 'ok';
  return pct >= c ? 'crit' : pct >= w ? 'warn' : 'ok';
}

export const REPEAT_MS = { crit: 24 * 3600e3, warn: 72 * 3600e3 };

/**
 * Faut-il envoyer un e-mail ? prev = { level, lastSentAt (ms ou null) } ou null.
 * Envoi : passage ok → alerte, alerte → critique, et rappel espacé (24 h critique, 72 h alerte) tant que ça dure.
 * Pas d'envoi : critique → alerte (amélioration). Retour à « ok » : message « retour à la normale » seulement si une alerte avait été envoyée.
 */
export function decideAlert(prev, level, now) {
  const p = prev?.level || 'ok';
  const last = prev?.lastSentAt ?? null;
  if (level === 'ok') return p !== 'ok' && last ? 'recovered' : null;
  if (p === 'ok') return 'alert';
  if (p === 'warn' && level === 'crit') return 'alert';
  if (p === 'crit' && level === 'warn') return last == null ? 'alert' : null;
  return last == null || now - last >= REPEAT_MS[level] ? 'alert' : null;
}

/**
 * Tendance du disque : régression linéaire des octets utilisés sur les mesures (7 jours au plus).
 * Il faut au moins 12 mesures couvrant 6 h ; sinon « pas assez de données ». daysLeft = jours avant disque plein (null si stable ou en baisse).
 * samples : [{ t (ms), used (octets) }], total : taille du disque.
 */
export function trend(samples, total) {
  const pts = samples.filter((s) => Number.isFinite(s.t) && Number.isFinite(s.used));
  if (pts.length < 12 || pts[pts.length - 1].t - pts[0].t < 6 * 3600e3) return { enough: false, bytesPerDay: null, daysLeft: null };
  const t0 = pts[0].t;
  const xs = pts.map((p) => (p.t - t0) / 86400e3), ys = pts.map((p) => p.used);
  const n = pts.length, mx = xs.reduce((a, b) => a + b, 0) / n, my = ys.reduce((a, b) => a + b, 0) / n;
  const sxx = xs.reduce((a, x) => a + (x - mx) ** 2, 0);
  if (sxx === 0) return { enough: false, bytesPerDay: null, daysLeft: null };
  const slope = xs.reduce((a, x, i) => a + (x - mx) * (ys[i] - my), 0) / sxx; // octets par jour
  const left = total - pts[pts.length - 1].used;
  return { enough: true, bytesPerDay: Math.round(slope), daysLeft: slope > 1e6 && left > 0 ? Math.round((left / slope) * 10) / 10 : null };
}

/** Taille lisible (Go, Mo). */
export function fmtBytes(n) {
  const v = Number(n);
  if (!Number.isFinite(v)) return '—';
  if (v >= 1024 ** 3) return `${(v / 1024 ** 3).toFixed(1)} Go`;
  if (v >= 1024 ** 2) return `${Math.round(v / 1024 ** 2)} Mo`;
  return `${Math.round(v / 1024)} Ko`;
}

/** Textes de l'e-mail d'alerte. */
export function alertText(kind, level, pct, detail) {
  if (kind === 'backup') {
    if (level === 'ok') return { title: 'Sauvegardes : retour à la normale', summary: 'Les sauvegardes du serveur (et leur test de restauration) sont de nouveau à jour.', advice: '' };
    const crit = level === 'crit';
    return {
      title: `Sauvegardes : ${crit ? 'problème à traiter' : 'à surveiller'}`,
      summary: detail,
      advice: 'Sur le VPS : cat /var/lib/backup-vps/last-status puis tail -30 /var/log/backup-vps.log (détails dans ops/backup/README.md).',
    };
  }
  const what = kind === 'disk' ? 'le disque du serveur' : 'la mémoire du serveur';
  if (level === 'ok') return { title: `Serveur : ${kind === 'disk' ? 'disque' : 'mémoire'} revenu à la normale`, summary: `${what[0].toUpperCase()}${what.slice(1)} est repassé sous les seuils (${pct} % utilisé). ${detail}`.trim(), advice: '' };
  const crit = level === 'crit';
  return {
    title: `Serveur : ${kind === 'disk' ? 'disque' : 'mémoire'} ${crit ? 'critique' : 'à surveiller'} (${pct} %)`,
    summary: `${what[0].toUpperCase()}${what.slice(1)} est utilisé à ${pct} %. ${detail}`.trim(),
    advice: kind === 'disk'
      ? 'Pour libérer de la place sans risque : docker image prune -a -f puis docker builder prune -f --filter until=48h (jamais docker volume prune).'
      : 'Si cela dure, vérifier les conteneurs gourmands (docker stats --no-stream) et redémarrer le service concerné depuis DockPanel.',
  };
}
