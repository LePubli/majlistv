// Mode d'alerte à l'heure de la prière : silencieux, vibreur ou adhan (la notification s'affiche toujours).
// Règles pures (testées) ; la partie native est dans notifications.ts.

export type AlertMode = 'silent' | 'vibrate' | 'adhan';
export const ALERT_MODES: AlertMode[] = ['silent', 'vibrate', 'adhan'];
export const DEFAULT_ALERT_MODE: AlertMode = 'adhan'; // comportement actuel (son) conservé pour les installations existantes

/**
 * Fichier d'adhan intégré à l'application (dans assets/sounds, déclaré dans app.json → expo-notifications → sounds).
 * null tant que le fichier n'a pas été fourni : le mode « adhan » joue alors le son par défaut du téléphone.
 */
export const ADHAN_FILE: string | null = null;

export function readAlertMode(raw: string | null | undefined): AlertMode {
  return (ALERT_MODES as string[]).includes(String(raw)) ? (raw as AlertMode) : DEFAULT_ALERT_MODE;
}

/**
 * Canal Android du mode. Un canal Android ne peut plus changer de son une fois créé : un son d'adhan ajouté plus tard
 * passe donc par un NOUVEAU canal (suffixe _s).
 */
export function channelFor(mode: AlertMode, adhanFile: string | null = ADHAN_FILE): string {
  if (mode === 'silent') return 'prayer_silent';
  if (mode === 'vibrate') return 'prayer_vibrate';
  return adhanFile ? 'prayer_adhan_s' : 'prayer_adhan';
}

/** Son de la notification (iPhone ; sur Android le son vient du canal) : false = aucun, true = son par défaut, sinon nom du fichier. */
export function contentSound(mode: AlertMode, adhanFile: string | null = ADHAN_FILE): boolean | string {
  if (mode === 'adhan') return adhanFile || true;
  return false;
}

/** Faut-il jouer le son quand l'application est ouverte ? Seulement en mode adhan. */
export function playSoundInForeground(data: { kind?: unknown; mode?: unknown } | null | undefined): boolean {
  if (data?.kind !== 'prayer') return true; // autres notifications : inchangé
  return data.mode === 'adhan' || !(['silent', 'vibrate'] as unknown[]).includes(data.mode);
}
