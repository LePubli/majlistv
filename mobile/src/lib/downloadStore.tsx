// Hors connexion (22b-6) : téléchargements de l'application (état, fichiers, renouvellement, reprise de lecture).
// Fichiers dans le stockage privé de l'application (dossier « offline » : MP4 / M4A + affiche + index.json) ; rien n'est visible dans la galerie
// ni dans les fichiers du téléphone. Un seul téléchargement à la fois.
import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { AppState } from 'react-native';
import { Directory, File, Paths } from 'expo-file-system';
import { useNetworkState } from 'expo-network';
import { useSession } from '@/lib/session';
import { onLogout } from '@/lib/hooks';
import { ApiError } from '@/lib/api';
import {
  DlErrorCode, DlKind, DownloadRecord, MAX_POLL_MS, RenewItem, applyRenewal, errorCodeFor, fileNameFor, isExpired, parseIndex, parsePrepare, pollDelay, shouldRenew, totalBytes, upsert,
} from '@/lib/downloads';

export type DlStep = 'preparing' | 'downloading' | 'verifying';
export type DlActive = { talkId: string; step: DlStep; ratio: number };
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
};

const DownloadsCtx = createContext<Ctx | null>(null);
const dirOf = () => new Directory(Paths.document, 'offline');
const indexFile = () => new File(dirOf(), 'index.json');

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

  const commit = useCallback((next: DownloadRecord[]) => {
    recRef.current = next;
    setRecords(next);
    const json = JSON.stringify(next);
    saving.current = saving.current.then(async () => {
      try { const d = dirOf(); if (!d.exists) d.create({ intermediates: true, idempotent: true }); await indexFile().write(json); } catch { /* disque plein : l'index sera réécrit au prochain changement */ }
    });
  }, []);

  const deleteFiles = useCallback((rs: DownloadRecord[]) => {
    for (const r of rs) {
      for (const name of [r.file, r.poster, `${r.file}.part`]) {
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
        const known = new Set<string>(['index.json']);
        for (const r of list) { known.add(r.file); if (r.poster) known.add(r.poster); }
        for (const item of d.list()) { if (item instanceof File && !known.has(item.name)) { try { item.delete(); } catch { /* ignoré */ } } }
        list = list.filter((r) => new File(d, r.file).exists);
      } catch { /* dossier illisible : liste vide */ }
      recRef.current = list; setRecords(list); setLoaded(true);
    })();
  }, []);

  // Un autre compte se connecte sur ce téléphone : les téléchargements du précédent sont effacés.
  useEffect(() => {
    if (!loaded || !user) return;
    const other = recRef.current.filter((r) => r.userId && r.userId !== user.id);
    if (other.length) { deleteFiles(other); commit(recRef.current.filter((r) => !other.includes(r))); }
  }, [loaded, user?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  // Déconnexion voulue : tout est effacé (hors connexion sans session, rien n'est effacé : on garde le jeton).
  useEffect(() => onLogout(() => { abort.current?.abort(); deleteFiles(recRef.current); commit([]); }), [commit, deleteFiles]);

  const get = useCallback((talkId: string) => records.find((r) => r.talkId === talkId), [records]);

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
        downloadedAt: Date.now(), expiresAt: ready.expiresAt, positionMs: prev?.positionMs ?? 0, synced: prev?.synced ?? true, version: ready.version,
      };
      commit(upsert(recRef.current, rec));
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
  }, [active, api, commit, deleteFiles, user]);

  // Position de lecture hors connexion : gardée sur le téléphone, envoyée au serveur à la reconnexion (même reprise que sur le site).
  const setPosition = useCallback((talkId: string, ms: number) => {
    const next = recRef.current.map((r) => (r.talkId === talkId ? { ...r, positionMs: Math.max(0, Math.round(ms)), synced: false } : r));
    recRef.current = next;
    if (posTimer.current) clearTimeout(posTimer.current);
    posTimer.current = setTimeout(() => commit(recRef.current), 2000);
  }, [commit]);

  const renew = useCallback(async (force = false) => {
    if (!user || !online || !recRef.current.length) return;
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
      const ids = recRef.current.map((r) => r.talkId);
      for (let i = 0; i < ids.length; i += 50) items = items.concat((await api.post<{ items: RenewItem[] }>('/me/offline/renew', { talkIds: ids.slice(i, i + 50) })).items ?? []);
    } catch { lastRenew.current = null; return; } // réseau ou session : on réessaiera
    const res = applyRenewal(recRef.current, items, Date.now());
    if (res.removed.length) deleteFiles(res.removed);
    if (res.removed.length || res.records.some((r, i) => r !== recRef.current[i])) commit(res.records);
  }, [api, commit, deleteFiles, online, user]);

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
  }), [records, loaded, active, error, online, get, start, cancel, remove, setPosition, renew, uriOf, posterUriOf]);

  return <DownloadsCtx.Provider value={value}>{children}</DownloadsCtx.Provider>;
}

export function useDownloads(): Ctx {
  const v = useContext(DownloadsCtx);
  if (!v) throw new Error('useDownloads doit être utilisé dans <DownloadProvider>');
  return v;
}

export { isExpired };
