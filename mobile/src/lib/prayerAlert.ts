// Mode d'alerte à l'heure de la prière : silencieux, vibreur ou adhan (la notification s'affiche toujours).
// Règles pures (testées) ; la partie native est dans notifications.ts.

export type AlertMode = 'silent' | 'vibrate' | 'adhan';
export const ALERT_MODES: AlertMode[] = ['silent', 'vibrate', 'adhan'];
export const DEFAULT_ALERT_MODE: AlertMode = 'adhan'; // comportement actuel (son) conservé pour les installations existantes

/** Un adhan du catalogue (assets/sounds/adhans.json, voir scripts/sync-adhans.mjs). */
export type AdhanRef = { id: string; file: string };

/** Adhan choisi : celui de la liste portant cet id, sinon le premier ; null si le catalogue est vide (son par défaut du téléphone). */
export function pickAdhan<T extends AdhanRef>(list: T[], id: string | null | undefined): T | null {
  return list.find((a) => a.id === id) || list[0] || null;
}

export function readAlertMode(raw: string | null | undefined): AlertMode {
  return (ALERT_MODES as string[]).includes(String(raw)) ? (raw as AlertMode) : DEFAULT_ALERT_MODE;
}

/**
 * Canal Android du mode. Un canal Android ne peut plus changer de son une fois créé : chaque adhan du catalogue a donc
 * son propre canal (prayer_adhan_<id>) ; sans catalogue, prayer_adhan (son par défaut).
 */
export function channelFor(mode: AlertMode, adhan: AdhanRef | null = null, alarm = false): string {
  if (mode === 'silent') return 'prayer_silent';
  if (mode === 'vibrate') return 'prayer_vibrate';
  // « Adhan même en silencieux » (Android) : canaux à part, qui jouent l'adhan sur le volume RÉVEIL (cf. notifications.ts).
  const base = adhan ? `prayer_adhan_${adhan.id}` : 'prayer_adhan';
  return alarm ? base.replace('prayer_adhan', 'prayer_adhan_alarm') : base;
}

/** Son de la notification (iPhone ; sur Android le son vient du canal) : false = aucun, true = son par défaut, sinon nom du fichier. */
export function contentSound(mode: AlertMode, adhan: AdhanRef | null = null): boolean | string {
  if (mode === 'adhan') return adhan ? adhan.file : true;
  return false;
}

/** Faut-il jouer le son quand l'application est ouverte ? Seulement en mode adhan. */
export function playSoundInForeground(data: { kind?: unknown; mode?: unknown } | null | undefined): boolean {
  if (data?.kind !== 'prayer') return true; // autres notifications : inchangé
  return data.mode === 'adhan' || !(['silent', 'vibrate'] as unknown[]).includes(data.mode);
}
