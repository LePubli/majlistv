// Hors connexion (22b-6) : téléchargements de l'application (état, fichiers, renouvellement, reprise de lecture).
// Fichiers dans le stockage privé de l'application (dossier « offline » : MP4 / M4A + affiche + index.json) ; rien n'est visible dans la galerie
// ni dans les fichiers du téléphone. Un seul téléchargement à la fois. Le serveur ne garde pas les fichiers : ils s'accumulent ici, sur le téléphone.
// 22b-6 bis : licence signée vérifiée à chaque lecture, horloge de confiance (offlineGuard), pack hors ligne (résumé, chapitres, transcription, quiz)
// et file des quiz passés hors connexion, envoyée à la reconnexion.
import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { AppState } from 'react-native';
import { Directory, File, Paths } from 'expo-file-system';
import { useNetworkState } from 'expo-network';
import { useSession } from '@/lib/session';
import { onLogout } from '@/lib/hooks';
import { ApiError } from '@/lib/api';
import {
  DlErrorCode, DlKind, DownloadRecord, MAX_POLL_MS, QUEUE_FILE, RenewItem, applyRenewal, daysLeftUntil, errorCodeFor, fileNameFor, packNameFor, packStale, parseIndex, parsePrepare, pollDelay, shouldRenew, totalBytes, upsert,
} from '@/lib/downloads';
import { LicenceState, licenceState } from '@/lib/license';
import { getPublicKey, loadGuard, nowMs, rolledBack, setPublicKey, syncServerTime, touch } from '@/lib/offlineGuard';
import { OfflinePack, QueuedAttempt, dropAttempt, enqueueAttempt, parsePack, parseQueue } from '@/lib/offlinePack';

export type DlStep = 'preparing' | 'downloading' | 'verifying';
export type DlActive = { talkId: string; step: DlStep; ratio: number };
/** État d'un téléchargement : lisible ou non, et pourquoi. */
export type DlStatus = { state: LicenceState; expiresAt: number; daysLeft: number; playable: boolean };
export type DlTalk = { id: string; title: string; speaker?: string | null; durationSeconds?: number | null; posterUrl?: string | null };

type Ctx = {
  records: DownloadRecord[];
  loaded: boolean;
  active: DlActive | null;
  error: { talkId: string; code: DlErrorCode; message?: string } | null;
  online: boolean;
  usedBytes: number;
  get: (talkId: string) => DownloadRecord | undefined;
  start: (talk: DlTalk, kind: DlKind, height: number) => Promise<boolean>;
  cancel: () => void;
  remove: (talkId: string) => Promise<void>;
  setPosition: (talkId: string, ms: number) => void;
  renew: (force?: boolean) => Promise<void>;
  /** Adresse locale du fichier (lecture par le lecteur vidéo). */
  uriOf: (rec: DownloadRecord) => string;
  posterUriOf: (rec: DownloadRecord) => string | null;
  clearError: () => void;
  /** Heure de confiance (ms). */
  nowMs: () => number;
  /** Licence valide ? (signature, compte, fichier, date de fin selon l'horloge de confiance) */
  statusOf: (rec: DownloadRecord) => DlStatus;
  /** L'horloge du téléphone a été reculée. */
  clockWarn: boolean;
  /** Pack hors connexion d'une conférence téléchargée (null si absent). */
  packOf: (talkId: string) => Promise<OfflinePack | null>;
  /** Quiz passé hors connexion : mis en file, envoyé au serveur à la reconnexion. */
  queueAttempt: (talkId: string, answers: Record<string, number>) => Promise<void>;
  pendingAttempts: number;
};

const DownloadsCtx = createContext<Ctx | null>(null);
const dirOf = () => new Directory(Paths.document, 'offline');
const indexFile = () => new File(dirOf(), 'index.json');
const queueFile = () => new File(dirOf(), QUEUE_FILE);

export function DownloadProvider({ children }: { children: React.ReactNode }) {
  const { api, user, ready } = useSession();
  const net = useNetworkState();
  const online = net.isConnected !== false && net.isInternetReachable !== false;
  const [records, setRecords] = useState<DownloadRecord[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [active, setActive] = useState<DlActive | null>(null);
  const [error, setError] = useState<Ctx['error']>(null);
  const recRef = useRef<DownloadRecord[]>([]);
  const abort = useRef<AbortController | null>(null);
  const lastRenew = useRef<number | null>(null);
  const saving = useRef<Promise<void>>(Promise.resolve());
  const posTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const queueRef = useRef<QueuedAttempt[]>([]);
  const [pending, setPending] = useState(0);
  const [tick, setTick] = useState(0);          // réévalue les licences (horloge de confiance) toutes les minutes et au retour dans l'application
  const [guardReady, setGuardReady] = useState(false);
  const [clockWarn, setClockWarn] = useState(false);

  const commit = useCallback((next: DownloadRecord[]) => {
    recRef.current = next;
    setRecords(next);
    const json = JSON.stringify(next);
    saving.current = saving.current.then(async () => {
      try { const d = dirOf(); if (!d.exists) d.create({ intermediates: true, idempotent: true }); await indexFile().write(json); } catch { /* disque plein : l'index sera réécrit au prochain changement */ }
    });
  }, []);

  const saveQueue = useCallback((q: QueuedAttempt[]) => {
    queueRef.current = q; setPending(q.length);
    const json = JSON.stringify(q);
    saving.current = saving.current.then(async () => { try { const d = dirOf(); if (!d.exists) d.create({ intermediates: true, idempotent: true }); await queueFile().write(json); } catch { /* ignoré */ } });
  }, []);

  const deleteFiles = useCallback((rs: DownloadRecord[]) => {
    for (const r of rs) {
      for (const name of [r.file, r.poster, r.pack, `${r.file}.part`]) {
        if (!name) continue;
        try { const f = new File(dirOf(), name); if (f.exists) f.delete(); } catch { /* déjà supprimé */ }
      }
    }
  }, []);

  // Chargement de l'index au démarrage + nettoyage des fichiers orphelins (téléchargement interrompu).
  useEffect(() => {
    (async () => {
      let list: DownloadRecord[] = [];
      try {
        const d = dirOf(); if (!d.exists) d.create({ intermediates: true, idempotent: true });
        const f = indexFile();
        list = parseIndex(f.exists ? await f.text() : null);
        const known = new Set<string>(['index.json', QUEUE_FILE]);
        for (const r of list) { known.add(r.file); if (r.poster) known.add(r.poster); if (r.pack) known.add(r.pack); }
        try { const q = queueFile(); queueRef.current = parseQueue(q.exists ? await q.text() : null); setPending(queueRef.current.length); } catch { /* file vide */ }
        for (const item of d.list()) { if (item instanceof File && !known.has(item.name)) { try { item.delete(); } catch { /* ignoré */ } } }
        list = list.filter((r) => new File(d, r.file).exists);
      } catch { /* dossier illisible : liste vide */ }
      recRef.current = list; setRecords(list); setLoaded(true);
    })();
    void loadGuard().then(() => { setGuardReady(true); setClockWarn(rolledBack()); });
  }, []);
  useEffect(() => {
    const id = setInterval(() => { touch(); setTick((n) => n + 1); }, 60000);
    const s = AppState.addEventListener('change', (st) => { if (st === 'active') { touch(); setClockWarn(rolledBack()); setTick((n) => n + 1); } });
    return () => { clearInterval(id); s.remove(); };
  }, []);

  // Un autre compte se connecte sur ce téléphone : les téléchargements du précédent sont effacés.
  useEffect(() => {
    if (!loaded || !user) return;
    const other = recRef.current.filter((r) => r.userId && r.userId !== user.id);
    if (other.length) { deleteFiles(other); commit(recRef.current.filter((r) => !other.includes(r))); saveQueue([]); }
  }, [loaded, user?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  // Déconnexion voulue : tout est effacé (hors connexion sans session, rien n'est effacé : on garde le jeton).
  useEffect(() => onLogout(() => { abort.current?.abort(); deleteFiles(recRef.current); commit([]); saveQueue([]); }), [commit, deleteFiles, saveQueue]);

  const get = useCallback((talkId: string) => records.find((r) => r.talkId === talkId), [records]);

  const statusOf = useCallback((rec: DownloadRecord): DlStatus => {
    const now = nowMs();
    const st = licenceState(rec, user?.id ?? rec.userId ?? null, getPublicKey(), now);
    // Hors connexion sans session rechargée, user peut être null : on se fie alors au compte enregistré avec le fichier.
    return { state: st.state, expiresAt: st.expiresAt, daysLeft: daysLeftUntil(st.expiresAt, now), playable: st.state === 'ok' };
  }, [user?.id, guardReady, tick]); // eslint-disable-line react-hooks/exhaustive-deps

  // Pack hors connexion : fichier JSON à côté de la vidéo, mis à jour au plus une fois par jour.
  const fetchPack = useCallback(async (talkId: string): Promise<boolean> => {
    try {
      const raw = await api.get<unknown>(`/me/offline/${talkId}/pack`);
      const pack = parsePack(raw);
      if (!pack) return false;
      const name = packNameFor(talkId);
      const f = new File(dirOf(), name);
      if (f.exists) f.delete();
      f.write(JSON.stringify(pack));
      commit(recRef.current.map((x) => (x.talkId === talkId ? { ...x, pack: name, packAt: Date.now() } : x)));
      return true;
    } catch { return false; }
  }, [api, commit]);

  const packOf = useCallback(async (talkId: string): Promise<OfflinePack | null> => {
    const r = recRef.current.find((x) => x.talkId === talkId);
    if (!r?.pack) return null;
    try { const f = new File(dirOf(), r.pack); return f.exists ? parsePack(await f.text()) : null; } catch { return null; }
  }, []);

  const queueAttempt = useCallback(async (talkId: string, answers: Record<string, number>) => {
    const list = Object.entries(answers).map(([questionId, index]) => ({ questionId, index }));
    if (!list.length) return;
    saveQueue(enqueueAttempt(queueRef.current, { talkId, answers: list, at: Date.now() }));
  }, [saveQueue]);

  const remove = useCallback(async (talkId: string) => {
    const r = recRef.current.find((x) => x.talkId === talkId);
    if (!r) return;
    deleteFiles([r]);
    commit(recRef.current.filter((x) => x.talkId !== talkId));
  }, [commit, deleteFiles]);

  const cancel = useCallback(() => { abort.current?.abort(); }, []);

  const start = useCallback(async (talk: DlTalk, kind: DlKind, height: number): Promise<boolean> => {
    if (active || !user) return false;
    const ctrl = new AbortController();
    abort.current = ctrl;
    setError(null);
    setActive({ talkId: talk.id, step: 'preparing', ratio: 0 });
    const part = new File(dirOf(), `${fileNameFor(talk.id, kind, height)}.part`);
    try {
      const d = dirOf(); if (!d.exists) d.create({ intermediates: true, idempotent: true });
      // 1) Le serveur prépare le fichier (quelques secondes à quelques minutes la première fois), on redemande jusqu'à ce qu'il soit prêt.
      const t0 = Date.now();
      let ready: Extract<ReturnType<typeof parsePrepare>, { kind: 'ready' }> | null = null;
      for (let attempt = 0; !ready; attempt += 1) {
        if (ctrl.signal.aborted) throw new Error('cancelled');
        if (Date.now() - t0 > MAX_POLL_MS) throw Object.assign(new Error('timeout'), { dl: 'generic' });
        let body: unknown;
        try { body = await api.post<unknown>(`/me/offline/${talk.id}`, { kind, ...(kind === 'video' ? { height } : {}), ...(attempt === 0 ? { retry: true } : {}) }); }
        catch (e) {
          if (e instanceof ApiError && e.status !== 0) throw Object.assign(new Error(e.message), { dl: errorCodeFor(e.status, e.code), serverMessage: e.status === 502 ? e.message : undefined });
          throw Object.assign(new Error('network'), { dl: 'network' });
        }
        const res = parsePrepare(body);
        if (!res) throw Object.assign(new Error('réponse invalide'), { dl: 'generic' });
        if (res.kind === 'failed') throw Object.assign(new Error(res.error), { dl: 'generic', serverMessage: res.error });
        if (res.kind === 'ready') ready = res;
        else await new Promise((r) => setTimeout(r, pollDelay(attempt)));
      }
      // 2) Téléchargement du fichier depuis notre stockage (lien signé).
      if (part.exists) part.delete();
      setActive({ talkId: talk.id, step: 'downloading', ratio: 0 });
      const task = File.createDownloadTask(ready.url, part, {
        signal: ctrl.signal,
        onProgress: (p) => setActive((a) => (a && a.talkId === talk.id ? { ...a, ratio: ready!.size > 0 ? Math.min(1, p.bytesWritten / ready!.size) : 0 } : a)),
      });
      const got = await task.downloadAsync().catch((e) => { throw ctrl.signal.aborted ? new Error('cancelled') : Object.assign(new Error(String(e?.message ?? e)), { dl: /ENOSPC|space/i.test(String(e?.message ?? e)) ? 'space' : 'network' }); });
      if (!got) throw new Error('cancelled');
      // 3) Contrôle d'intégrité.
      setActive({ talkId: talk.id, step: 'verifying', ratio: 1 });
      const sha = (await got.digest('SHA-256')).toLowerCase();
      if (sha !== ready.sha256 || got.size !== ready.size) throw Object.assign(new Error('integrity'), { dl: 'integrity' });
      setPublicKey(ready.publicKey);
      if (ready.serverTime) syncServerTime(ready.serverTime);
      const fileName = fileNameFor(talk.id, kind, ready.height || height);
      const final = new File(dirOf(), fileName);
      if (final.exists) final.delete();
      await got.move(final);
      // 4) Affiche (facultative) pour la liste hors connexion.
      let poster: string | null = null;
      if (talk.posterUrl && /^https?:\/\//.test(talk.posterUrl)) {
        try { const pf = new File(dirOf(), `${talk.id}.jpg`); if (pf.exists) pf.delete(); await File.downloadFileAsync(talk.posterUrl, pf); poster = pf.name; } catch { poster = null; }
      }
      const prev = recRef.current.find((r) => r.talkId === talk.id);
      if (prev && prev.file !== fileName) deleteFiles([{ ...prev, poster: null }]);
      const rec: DownloadRecord = {
        talkId: talk.id, userId: user.id, title: talk.title, speaker: talk.speaker ?? '', durationSeconds: Number(talk.durationSeconds) || 0,
        kind, height: kind === 'audio' ? 0 : ready.height || height, size: ready.size, sha256: ready.sha256, file: fileName, poster,
        downloadedAt: Date.now(), expiresAt: ready.expiresAt, licence: ready.licence, pack: prev?.pack ?? null, packAt: prev?.packAt ?? 0, positionMs: prev?.positionMs ?? 0, synced: prev?.synced ?? true, version: ready.version,
      };
      commit(upsert(recRef.current, rec));
      // 5) Pack hors connexion (résumé, chapitres, transcription, quiz) puis le serveur peut effacer son fichier temporaire.
      await fetchPack(talk.id);
      void api.post(`/me/offline/${talk.id}/done`, { kind, ...(kind === 'video' ? { height: ready.height || height } : {}) }).catch(() => undefined);
      return true;
    } catch (e) {
      try { if (part.exists) part.delete(); } catch { /* ignoré */ }
      const err = e as Error & { dl?: DlErrorCode; serverMessage?: string };
      if (err.message !== 'cancelled') setError({ talkId: talk.id, code: err.dl ?? 'generic', message: err.serverMessage });
      return false;
    } finally {
      abort.current = null;
      setActive(null);
    }
  }, [active, api, commit, deleteFiles, fetchPack, user]);

  // Position de lecture hors connexion : gardée sur le téléphone, envoyée au serveur à la reconnexion (même reprise que sur le site).
  const setPosition = useCallback((talkId: string, ms: number) => {
    const next = recRef.current.map((r) => (r.talkId === talkId ? { ...r, positionMs: Math.max(0, Math.round(ms)), synced: false } : r));
    recRef.current = next;
    if (posTimer.current) clearTimeout(posTimer.current);
    posTimer.current = setTimeout(() => commit(recRef.current), 2000);
  }, [commit]);

  const renew = useCallback(async (force = false) => {
    if (!user || !online) return;
    // Quiz passés hors connexion → serveur (mêmes enregistrements, badges et révision espacée que sur le site).
    for (const a of [...queueRef.current]) {
      try { await api.post(`/talks/${a.talkId}/quiz/submit`, { answers: a.answers }); saveQueue(dropAttempt(queueRef.current, a)); }
      catch (e) { if (e instanceof ApiError && e.status >= 400 && e.status < 500 && e.status !== 429) saveQueue(dropAttempt(queueRef.current, a)); else break; }
    }
    if (!recRef.current.length) return;
    const now = Date.now();
    // Positions regardées hors connexion → serveur.
    for (const r of recRef.current.filter((x) => !x.synced && x.positionMs >= 1000)) {
      try { await api.put(`/me/progress/${r.talkId}`, { positionMs: r.positionMs, durationMs: r.durationSeconds * 1000 }); commit(recRef.current.map((x) => (x.talkId === r.talkId ? { ...x, synced: true } : x))); }
      catch { break; }
    }
    if (!shouldRenew(lastRenew.current, now, force)) return;
    lastRenew.current = now;
    let items: RenewItem[] = [];
    try {
      const files = recRef.current.map((r) => ({ talkId: r.talkId, kind: r.kind, height: r.kind === 'audio' ? 0 : r.height, sha256: r.sha256 }));
      for (let i = 0; i < files.length; i += 100) {
        const res = await api.post<{ items: RenewItem[]; serverTime?: string }>('/me/offline/renew', { files: files.slice(i, i + 100) });
        items = items.concat(res.items ?? []);
        const st = res.serverTime ? Date.parse(res.serverTime) : NaN;
        if (Number.isFinite(st)) syncServerTime(st);
        const key = (res.items ?? []).find((x) => x.publicKey)?.publicKey;
        if (key) setPublicKey(key);
      }
    } catch { lastRenew.current = null; return; } // réseau ou session : on réessaiera
    setClockWarn(rolledBack());
    const res = applyRenewal(recRef.current, items, Date.now());
    if (res.removed.length) deleteFiles(res.removed);
    if (res.removed.length || res.records.some((r, i) => r !== recRef.current[i])) commit(res.records);
    // Packs : mis à jour une fois par jour (résumé, transcription ou quiz corrigés par l'équipe).
    for (const r of recRef.current.filter((x) => packStale(x, Date.now()))) { if (!(await fetchPack(r.talkId))) break; }
    setTick((n) => n + 1);
  }, [api, commit, deleteFiles, fetchPack, online, saveQueue, user]);

  // Renouvellement : au démarrage, au retour dans l'application et quand le réseau revient.
  useEffect(() => { if (ready && loaded) void renew(); }, [ready, loaded, online, user?.id]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    const s = AppState.addEventListener('change', (st) => { if (st === 'active') void renew(); });
    return () => s.remove();
  }, [renew]);

  const uriOf = useCallback((rec: DownloadRecord) => new File(dirOf(), rec.file).uri, []);
  const posterUriOf = useCallback((rec: DownloadRecord) => (rec.poster ? new File(dirOf(), rec.poster).uri : null), []);

  const value = useMemo<Ctx>(() => ({
    records, loaded, active, error, online, usedBytes: totalBytes(records), get, start, cancel, remove, setPosition, renew, uriOf, posterUriOf, clearError: () => setError(null),
    nowMs, statusOf, clockWarn, packOf, queueAttempt, pendingAttempts: pending,
  }), [records, loaded, active, error, online, get, start, cancel, remove, setPosition, renew, uriOf, posterUriOf, statusOf, clockWarn, packOf, queueAttempt, pending]);

  return <DownloadsCtx.Provider value={value}>{children}</DownloadsCtx.Provider>;
}

export function useDownloads(): Ctx {
  const v = useContext(DownloadsCtx);
  if (!v) throw new Error('useDownloads doit être utilisé dans <DownloadProvider>');
  return v;
}

