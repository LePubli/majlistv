'use client';
// Éditeur de montage (étape E2) — bibliothèque de musiques de fond, commune à tous les montages.
// L'administrateur importe (mp3, m4a, aac, wav, ogg, flac, webm ; 60 Mo au plus), avec la source ou la licence ;
// l'API analyse chaque musique (durée, forme d'onde, niveau). Tout le monde écoute et ajoute au montage, à la tête de lecture.
import { useCallback, useEffect, useRef, useState } from 'react';
import { useApp } from '../../components/Providers';
import { fmtTime } from './ops';

export default function MusicLibrary({ canEdit, onClose, onAdd, atLabel }) {
  const { t, call, locale } = useApp();
  const [d, setD] = useState(null);
  const [msg, setMsg] = useState(null);
  const [busy, setBusy] = useState(false);
  const [title, setTitle] = useState('');
  const [license, setLicense] = useState('');
  const [file, setFile] = useState(null);
  const [playing, setPlaying] = useState(null);
  const player = useRef(null);
  const box = useRef(null);

  const load = useCallback(() => call('/studio/editor/music').then((r) => { if (r.ok) setD(r.data); else setMsg({ ok: false, text: r.data?.error || t('dbError') }); }), [call, t]);
  useEffect(() => { load(); }, [load]);
  // Musiques en cours d'analyse : la liste se met à jour toute seule.
  useEffect(() => {
    if (!d?.music?.some((m) => ['queued', 'running'].includes(m.status))) return undefined;
    const h = setTimeout(load, 3000);
    return () => clearTimeout(h);
  }, [d, load]);
  useEffect(() => {
    box.current?.focus();
    const esc = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', esc);
    return () => { window.removeEventListener('keydown', esc); if (player.current) player.current.pause(); };
  }, [onClose]);

  const listen = (m) => {
    if (player.current) player.current.pause();
    if (playing === m.id) { setPlaying(null); return; }
    player.current = new Audio(m.url);
    player.current.play().catch(() => {});
    player.current.onended = () => setPlaying(null);
    setPlaying(m.id);
  };

  const upload = async (e) => {
    e.preventDefault();
    if (!file) return;
    setBusy(true); setMsg(null);
    const type = file.type || (/\.mp3$/i.test(file.name) ? 'audio/mpeg' : /\.m4a$/i.test(file.name) ? 'audio/mp4' : /\.wav$/i.test(file.name) ? 'audio/wav' : '');
    const u = await call('/studio/editor/music/upload-url', { method: 'POST', body: JSON.stringify({ contentType: type, size: file.size }) });
    if (!u.ok) { setBusy(false); setMsg({ ok: false, text: u.data?.error || t('dbError') }); return; }
    const put = await fetch(u.data.url, { method: 'PUT', body: file, headers: { 'Content-Type': type } }).catch(() => null);
    if (!put || !put.ok) { setBusy(false); setMsg({ ok: false, text: t('mtUploadFailed') }); return; }
    const r = await call('/studio/editor/music', { method: 'POST', body: JSON.stringify({ key: u.data.key, title: title.trim() || file.name.replace(/\.[^.]+$/, ''), license, contentType: type }) });
    setBusy(false);
    if (!r.ok) { setMsg({ ok: false, text: r.data?.error || t('dbError') }); return; }
    setMsg({ ok: true, text: t('mtMusicImported') }); setTitle(''); setLicense(''); setFile(null);
    e.target.reset?.();
    load();
  };
  const remove = async (m) => {
    if (!window.confirm(t('mtMusicDelConfirm').replace('{t}', m.title))) return;
    const r = await call(`/studio/editor/music/${m.id}`, { method: 'DELETE' });
    setMsg(r.ok ? { ok: true, text: t('mtMusicDeleted') } : { ok: false, text: r.data?.error || t('dbError') });
    load();
  };
  const add = async (m) => {
    const r = await call(`/studio/editor/music/${m.id}`);
    if (r.ok) onAdd(r.data.music);
  };

  return (
    <div className="mt-modal" role="dialog" aria-modal="true" aria-labelledby="mt-mus-title" onPointerDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="mt-modal-box" ref={box} tabIndex={-1}>
        <div className="sd-card-head">
          <h2 id="mt-mus-title">{t('mtMusicLib')}</h2>
          <button type="button" className="btn ghost sd-pill" onClick={onClose}>{t('mtClose')}</button>
        </div>
        <p className="meta small">{t('mtMusicLibHelp')}</p>
        {d?.canImport && (
          <form className="mt-upload" onSubmit={upload}>
            <label className="mt-field"><span>{t('mtMusicFileLabel')}</span>
              <input type="file" accept="audio/*,.mp3,.m4a,.aac,.wav,.ogg,.flac,.webm" onChange={(e) => setFile(e.target.files?.[0] || null)} required /></label>
            <label className="mt-field"><span>{t('mtMusicTitle')}</span><input value={title} maxLength={120} onChange={(e) => setTitle(e.target.value)} /></label>
            <label className="mt-field"><span>{t('mtMusicLicense')}</span><input value={license} maxLength={300} onChange={(e) => setLicense(e.target.value)} placeholder={t('mtMusicLicenseHint')} /></label>
            <button type="submit" className="btn sd-pill" disabled={busy || !file}>{busy ? t('mtUploading') : t('mtImport')}</button>
            <small className="meta">{t('mtMusicMax').replace('{n}', d.maxMb)}</small>
          </form>
        )}
        {msg && <p className={msg.ok ? 'ok-msg' : 'error'} role="status">{msg.text}</p>}
        {!d && <p className="meta">{t('dbLoading')}</p>}
        {d && d.music.length === 0 && <p className="meta">{d.canImport ? t('mtMusicNoneAdmin') : t('mtMusicNone')}</p>}
        {d && d.music.length > 0 && (
          <ul className="mt-ver-list">
            {d.music.map((m) => (
              <li key={m.id} className="mt-ver mt-music-row" data-music-id={m.id}>
                <span>
                  <b dir="auto">{m.title}</b>
                  <small className="meta">
                    {m.status === 'ready' ? `${fmtTime(m.durationS)}${m.lufs != null ? ` · ${m.lufs.toLocaleString(locale, { maximumFractionDigits: 1 })} LUFS` : ''}`
                      : m.status === 'failed' ? `${t('mtWaveFailed')}${m.error ? ` (${m.error})` : ''}` : t('mtWaveRunning')}
                    {m.license ? ` · ${m.license}` : ''}
                  </small>
                </span>
                <span className="mt-actions">
                  <button type="button" className="btn ghost sd-pill" onClick={() => listen(m)} disabled={!m.url}>{playing === m.id ? t('mtStop') : t('mtListen')}</button>
                  {canEdit && <button type="button" className="btn sd-pill" disabled={m.status !== 'ready'} onClick={() => add(m)} title={t('mtAddAt').replace('{s}', atLabel)}>{t('mtAddToEdit')}</button>}
                  {d.canImport && <button type="button" className="btn ghost sd-pill" onClick={() => remove(m)}>{t('mtDel')}</button>}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
