// Hors connexion (22b-6 bis) : horloge de confiance et clé publique de licence, gardées dans le coffre sécurisé d'Android (Keystore),
// pas dans les fichiers de l'application. La « plus haute heure vue » n'est jamais reculée par le téléphone ; seule l'heure du serveur,
// reçue en ligne, peut la corriger (utile si l'utilisateur a réglé son horloge trop loin dans le futur par erreur).
import * as SecureStore from 'expo-secure-store';
import { advanceHighWater, clockRolledBack, trustedNow as pureTrusted } from '@/lib/license';

const HW_KEY = 'offline.highWater';
const PUB_KEY = 'offline.publicKey';

let highWater = 0;
let publicKey: string | null = null;
let lastSaved = 0;
let loaded = false;

export async function loadGuard(): Promise<void> {
  if (loaded) return;
  try {
    const hw = Number(await SecureStore.getItemAsync(HW_KEY));
    if (Number.isFinite(hw) && hw > 0) highWater = hw;
    publicKey = (await SecureStore.getItemAsync(PUB_KEY)) || null;
  } catch { /* coffre illisible : on repart de l'heure du téléphone */ }
  loaded = true;
  touch();
}

const persist = () => { lastSaved = Date.now(); SecureStore.setItemAsync(HW_KEY, String(highWater)).catch(() => {}); };

/** Heure de confiance (ms) : jamais en arrière de la plus tardive des heures vues. */
export const nowMs = () => pureTrusted(Date.now(), highWater);
export const rolledBack = () => clockRolledBack(Date.now(), highWater);
export const getPublicKey = () => publicKey;

/** Note l'heure actuelle du téléphone (enregistrée au plus une fois par minute). */
export function touch(): void {
  const next = advanceHighWater(highWater, Date.now());
  const moved = next !== highWater;
  highWater = next;
  if (moved && Date.now() - lastSaved > 60000) persist();
}

/** Heure du serveur reçue en ligne : fait foi, y compris pour corriger une plus haute heure trop avancée. */
export function syncServerTime(serverMs: number): void {
  if (!Number.isFinite(serverMs) || serverMs <= 0) return;
  highWater = serverMs;
  persist();
}

export function setPublicKey(key: string | null | undefined): void {
  if (!key || key === publicKey) return;
  publicKey = key;
  SecureStore.setItemAsync(PUB_KEY, key).catch(() => {});
}
