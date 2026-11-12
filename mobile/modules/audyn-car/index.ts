// Audyn dans Android Auto — passerelle vers le module natif (Android seulement).
// Absent (iPhone, ancienne application sans ce module, tests Node) : toutes les fonctions ne font rien.
import { requireOptionalNativeModule } from 'expo';

type Native = {
  setSession(apiUrl: string, token: string | null, lang: string): void;
  exchange(saved: Record<string, string | null>): Record<string, string>;
  put(itemId: string, raw: string): void;
};

const native = requireOptionalNativeModule<Native>('AudynCar');

export const carAvailable = native != null;

/** Adresse de l'API, jeton de connexion (null = déconnecté) et langue des textes affichés dans la voiture. */
export function setCarSession(apiUrl: string, token: string | null, lang: string): void {
  try { native?.setSession(apiUrl, token, lang); } catch { /* sans effet sur l'application */ }
}

/** Échange des positions d'écoute : envoie celles du téléphone, reçoit celles, plus récentes, écoutées dans la voiture. */
export function exchangeCarPositions(saved: Record<string, string | null>): Record<string, string> {
  try { return native?.exchange(saved) ?? {}; } catch { return {}; }
}

/** Position enregistrée sur le téléphone, transmise tout de suite à la voiture. */
export function putCarPosition(itemId: string, raw: string): void {
  try { native?.put(itemId, raw); } catch { /* idem */ }
}
