// Erreurs de l'application envoyées au serveur (Admin → Erreurs, comme celles du site) : on peut ainsi lire la cause exacte d'un
// problème qui n'arrive que sur un appareil (ex. autoradio Android). Chemin préfixé « [app] », version et modèle d'appareil joints.
// Jamais bloquant, jamais plus d'une fois la même erreur par minute.
import { Platform } from 'react-native';
import Constants from 'expo-constants';
import { API_URL } from './config';

const sent = new Map<string, number>();

export function reportAppError(err: unknown, where = ''): void {
  try {
    const e = err instanceof Error ? err : new Error(String(err));
    const key = `${e.message}|${where}`;
    const now = Date.now();
    if ((sent.get(key) ?? 0) > now - 60_000) return;
    sent.set(key, now);
    const device = `${Platform.OS} ${String(Platform.Version)} · app ${Constants.expoConfig?.version ?? '?'}`;
    void fetch(`${API_URL}/errors/client`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message: String(e.message || e.name || 'Erreur').slice(0, 1000), stack: String(e.stack || '').slice(0, 8000), path: `[app] ${where} (${device})`.slice(0, 500) }),
    }).catch(() => {});
  } catch { /* le signalement ne doit jamais casser l'application */ }
}

/** Toutes les erreurs JavaScript non rattrapées (en plus du comportement normal). */
export function installGlobalErrorReporting(): void {
  const g = globalThis as unknown as { ErrorUtils?: { getGlobalHandler: () => (e: unknown, fatal?: boolean) => void; setGlobalHandler: (h: (e: unknown, fatal?: boolean) => void) => void }; __mejlissErr?: boolean };
  if (!g.ErrorUtils || g.__mejlissErr) return;
  g.__mejlissErr = true;
  const prev = g.ErrorUtils.getGlobalHandler();
  g.ErrorUtils.setGlobalHandler((e, fatal) => { reportAppError(e, fatal ? 'fatal' : 'global'); prev(e, fatal); });
}
