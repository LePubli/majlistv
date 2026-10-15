'use client';
// Mes listes (étape 19) : créer, ranger, réordonner, partager par un lien secret.
// Étape B : le contenu est un composant, affiché dans l'onglet « Mes listes » de la bibliothèque et sur /lists.
import { useCallback, useEffect, useState } from 'react';
import { useApp } from './Providers';
import TalkCard from './TalkCard';

function ListView({ meta, t, call, onChange, onDelete }) {
  const [open, setOpen] = useState(false);
  const [d, setD] = useState(null);
  const [title, setTitle] = useState(meta.title);
  const [desc, setDesc] = useState(meta.description);
  const [msg, setMsg] = useState(null);
  const [copied, setCopied] = useState(false);
  const load = useCallback(async () => { const r = await call(`/me/lists/${meta.id}`); if (r.ok) setD(r.data); }, [call, meta.id]);
  useEffect(() => { if (open) load(); }, [open, load]);
  const url = (tok) => (typeof window !== 'undefined' ? `${window.location.origin}/l/${tok}` : `/l/${tok}`);
  const save = async () => { const r = await call(`/me/lists/${meta.id}`, { method: 'PATCH', body: JSON.stringify({ title, description: desc }) }); if (r.ok) { setMsg(t('saved')); onChange(); } else setMsg(r.data?.error || t('errGeneric')); };
  const move = async (i, dir) => {
    const ids = d.talks.map((x) => x.id); const j = i + dir; if (j < 0 || j >= ids.length) return;
    [ids[i], ids[j]] = [ids[j], ids[i]];
    setD({ ...d, talks: ids.map((id) => d.talks.find((x) => x.id === id)) });
    await call(`/me/lists/${meta.id}/items`, { method: 'PUT', body: JSON.stringify({ talkIds: ids }) });
  };
  const drop = async (id) => { setD((v) => ({ ...v, talks: v.talks.filter((x) => x.id !== id) })); await call(`/me/lists/${meta.id}/items/${id}`, { method: 'DELETE' }); onChange(); };
  const share = async (renew) => { const r = await call(`/me/lists/${meta.id}/share`, { method: 'POST', body: JSON.stringify({ renew }) }); if (r.ok) { onChange(); load(); } };
  const unshare = async () => { await call(`/me/lists/${meta.id}/share`, { method: 'DELETE' }); onChange(); load(); };
  const copy = async (tok) => { try { await navigator.clipboard.writeText(url(tok)); setCopied(true); setTimeout(() => setCopied(false), 2000); } catch { window.prompt(t('lsCopyManual'), url(tok)); } };
  const remove = async () => { if (!window.confirm(t('lsDeleteConfirm'))) return; const r = await call(`/me/lists/${meta.id}`, { method: 'DELETE' }); if (r.ok) onDelete(meta.id); };
  const tok = d?.shareToken ?? meta.shareToken;
  return (
    <li className="ls-item">
      <button type="button" className="ls-head" aria-expanded={open} onClick={() => setOpen(!open)}>
        <b>{meta.title}</b><span className="meta small">{t('thTalksN').replace('{n}', meta.items)}{meta.shared ? ` · ${t('lsShared')}` : ''}</span>
      </button>
      {open && d && (
        <div className="ls-body">
          <div className="ls-edit">
            <label className="fld"><span>{t('lsName')}</span><input value={title} maxLength={100} onChange={(e) => setTitle(e.target.value)} /></label>
            <label className="fld"><span>{t('lsDesc')}</span><input value={desc} maxLength={500} onChange={(e) => setDesc(e.target.value)} /></label>
            <div className="panel-actions"><button type="button" className="btn" disabled={title.trim().length < 1} onClick={save}>{t('save')}</button>{msg && <span className="meta small" role="status">{msg}</span>}</div>
          </div>
          <div className="ls-share">
            {tok ? (
              <>
                <p className="meta small">{t('lsShareOn')}</p>
                <input readOnly value={url(tok)} aria-label={t('lsShareLink')} onFocus={(e) => e.target.select()} />
                <div className="panel-actions">
                  <button type="button" className="btn" onClick={() => copy(tok)}>{copied ? t('lsCopied') : t('lsCopy')}</button>
                  <button type="button" className="btn ghost" onClick={() => share(true)}>{t('lsRenew')}</button>
                  <button type="button" className="btn ghost" onClick={unshare}>{t('lsStopShare')}</button>
                </div>
              </>
            ) : (
              <>
                <p className="meta small">{t('lsShareOff')}</p>
                <button type="button" className="btn ghost" onClick={() => share(false)}>{t('lsShare')}</button>
              </>
            )}
          </div>
          {d.talks.length === 0 && <p className="meta">{t('lsEmptyMine')}</p>}
          {d.unavailable > 0 && <p className="meta small">{t('lsUnavailable').replace('{n}', d.unavailable)}</p>}
          <ol className="ls-talks">
            {d.talks.map((x, i) => (
              <li key={x.id}>
                <TalkCard talk={x} t={t} onRemove={() => drop(x.id)} removeLabel={t('removeFromList')} />
                <span className="ls-move">
                  <button type="button" className="btn ghost" disabled={i === 0} onClick={() => move(i, -1)} aria-label={t('lsUp')}>↑</button>
                  <button type="button" className="btn ghost" disabled={i === d.talks.length - 1} onClick={() => move(i, 1)} aria-label={t('lsDown')}>↓</button>
                </span>
              </li>
            ))}
          </ol>
          <button type="button" className="link u small" onClick={remove}>{t('lsDelete')}</button>
        </div>
      )}
    </li>
  );
}


export default function ListsPanel() {
  const { user, t, call } = useApp();
  const [d, setD] = useState(null);
  const [title, setTitle] = useState('');
  const [err, setErr] = useState(null);
  const load = useCallback(async () => { const r = await call('/me/lists'); if (r.ok) setD(r.data); }, [call]);
  useEffect(() => { if (user) load(); }, [user, load]);
  const create = async (e) => {
    e.preventDefault(); setErr(null);
    const r = await call('/me/lists', { method: 'POST', body: JSON.stringify({ title }) });
    if (!r.ok) { setErr(r.data?.error || t('errGeneric')); return; }
    setTitle(''); load();
  };
  return (
    <div className="ls-page">
      <p className="meta">{t('lsIntro')}</p>
      <form className="ls-new" onSubmit={create}>
        <label className="fld"><span>{t('lsNew')}</span><input value={title} maxLength={100} placeholder={t('lsNewPh')} onChange={(e) => setTitle(e.target.value)} /></label>
        <button className="btn" disabled={title.trim().length < 1}>{t('lsCreate')}</button>
      </form>
      {err && <p className="error" role="alert">{err}</p>}
      {d && d.lists.length === 0 && <p className="meta">{t('lsNone')}</p>}
      <ul className="ls-list">
        {(d?.lists || []).map((l) => <ListView key={l.id} meta={l} t={t} call={call} onChange={load} onDelete={() => load()} />)}
      </ul>
    </div>
  );
}
