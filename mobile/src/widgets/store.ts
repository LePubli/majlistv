// Widgets Android (étape 25) : ce que les widgets lisent. Le code des widgets s'exécute sans écran de l'application (tâche de fond) :
// il n'a donc ni contexte React ni session ; il relit ce que l'application a laissé dans le coffre du téléphone
// (réglages de prière, jeton de connexion, langue) et interroge le serveur lui-même, avec un délai maximal.
import * as SecureStore from 'expo-secure-store';
import { API_URL } from '../lib/config';
import { pickLocale, type Locale } from '../lib/i18n';
import { DEFAULT_LOCALE, citationFresh, localDay, parseCitation, parseRevision, type CitationSnap, type PrayerSnap, type ReviseSnap } from './model';

const K_PRAYER = 'mejliss.wPrayer';
const K_REVISE = 'mejliss.wRevise';
const K_CITATION = 'mejliss.wCitation';
const TOKEN_KEY = 'mejliss.token'; // mêmes clés que lib/session.tsx
const LOCALE_KEY = 'mejliss.locale';

async function read<T>(key: string): Promise<T | null> {
  try { const v = await SecureStore.getItemAsync(key); return v ? (JSON.parse(v) as T) : null; } catch { return null; }
}
async function write(key: string, value: unknown): Promise<void> {
  try { await SecureStore.setItemAsync(key, JSON.stringify(value)); } catch { /* coffre indisponible : le widget montrera son dernier état */ }
}

export const savePrayerSnap = (snap: PrayerSnap) => write(K_PRAYER, snap);
export const loadPrayerSnap = () => read<PrayerSnap>(K_PRAYER);
export async function loadLocale(): Promise<Locale> {
  try { return pickLocale(await SecureStore.getItemAsync(LOCALE_KEY)); } catch { return DEFAULT_LOCALE; }
}

/** GET avec jeton facultatif et délai maximal (8 s) ; renvoie le statut et le JSON, ou null si le réseau a échoué. */
async function get(path: string, token?: string | null): Promise<{ status: number; json: unknown } | null> {
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), 8000);
  try {
    const r = await fetch(`${API_URL}${path}`, { signal: ctl.signal, headers: { accept: 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}) } });
    let json: unknown = null;
    try { json = await r.json(); } catch { /* corps vide */ }
    return { status: r.status, json };
  } catch { return null; } finally { clearTimeout(timer); }
}

/** Conférences à réviser : serveur d'abord ; sans réseau, dernier état connu. */
export async function loadRevise(now = Date.now()): Promise<ReviseSnap> {
  let token: string | null = null;
  try { token = await SecureStore.getItemAsync(TOKEN_KEY); } catch { /* ignoré */ }
  const empty = (state: ReviseSnap['state']): ReviseSnap => ({ state, total: 0, week: 0, titles: [], at: now });
  if (!token) { const s = empty('login'); await write(K_REVISE, s); return s; }
  const r = await get('/me/revision', token);
  if (r && r.status === 200) { const s = parseRevision(r.json, now); await write(K_REVISE, s); return s; }
  if (r && r.status === 401) { const s = empty('login'); await write(K_REVISE, s); return s; }
  if (r && r.status === 403) { const s = empty('tier'); await write(K_REVISE, s); return s; }
  return (await read<ReviseSnap>(K_REVISE)) ?? empty('error');
}

/** Citation du jour : celle d'aujourd'hui si déjà lue ; sinon le serveur ; sans réseau, la dernière connue. */
export async function loadCitation(now = Date.now()): Promise<CitationSnap> {
  const today = localDay(now);
  const kept = await read<CitationSnap>(K_CITATION);
  if (citationFresh(kept, today)) return kept;
  const r = await get('/citation/today');
  if (r && r.status === 200) { const c = parseCitation(r.json, today); await write(K_CITATION, c); return c; }
  if (r && r.status === 404) { await write(K_CITATION, null); return null; } // fonction coupée côté serveur
  return kept;
}
