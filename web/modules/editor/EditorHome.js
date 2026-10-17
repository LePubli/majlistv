'use client';
// Studio → Éditeur (étape E1) : montages en cours et conférences à monter. « Monter » crée le montage (la vidéo entière en
// un seul extrait) puis ouvre l'éditeur. Adresse directe : /studio/editor?talk=<id> (liens du tableau de bord, du doublage).
import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useApp } from '../../components/Providers';
import { fmtTime } from './ops';
import { ago } from '../../lib/format';

export default function EditorHome() {
  const { t, call, locale, user } = useApp();
  const router = useRouter();
  const [off, setOff] = useState(false);
  const [d, setD] = useState(null);
  const [msg, setMsg] = useState(null);
  const [busy, setBusy] = useState('');
  const [q, setQ] = useState('');

  const open = useCallback(async (talkId) => {
    setBusy(talkId); setMsg(null);
    const r = await call('/studio/editor/projects', { method: 'POST', body: JSON.stringify({ talkId }) });
    setBusy('');
    if (r.ok) router.push(`/studio/editor/${r.data.id}`);
    else setMsg(r.data?.code ? t(`mtNo_${r.data.code}`) : r.data?.error || t('dbError'));
  }, [call, router, t]);

  useEffect(() => {
    call('/studio/editor/projects').then((r) => {
      if (r.ok) setD(r.data);
      else if (r.data?.code === 'module_off') setOff(true);
      else setMsg(r.data?.error || t('dbError'));
    });
    const talk = new URLSearchParams(window.location.search).get('talk');
    if (talk && /^[0-9a-f-]{36}$/i.test(talk)) open(talk);
  }, [call, open, t]);

  if (off) {
    return (
      <main className="studio-page studio-narrow">
        <div className="studio-head"><h1 className="studio-title">{t('sdEditor')}</h1></div>
        <section className="sd-card mt-off">
          <p>{t('mtModuleOff')}</p>
          {user?.role === 'admin' && <Link href="/admin?tab=modules" className="btn">{t('dbOpenModules')}</Link>}
        </section>
      </main>
    );
  }
  const needle = q.trim().toLowerCase();
  const match = (x) => !needle || `${x.title} ${x.speaker || ''}`.toLowerCase().includes(needle);
  const projects = (d?.projects || []).filter(match);
  const todo = (d?.talks || []).filter(match);
  const mins = (s) => (s ? fmtTime(s) : '—');

  return (
    <main className="studio-page mt-home">
      <nav className="db-crumbs meta" aria-label={t('dbCrumbs')}><Link href="/studio">{t('dbStudio')}</Link> / <span>{t('sdEditor')}</span></nav>
      <div className="studio-head"><h1 className="studio-title">{t('sdEditor')}</h1></div>
      <p className="meta">{t('mtIntro')}</p>
      <p className="sd-note mt-desk">{t('mtDesktopOnly')}</p>
      {msg && <p className="error" role="alert">{msg}</p>}
      <label className="studio-search mt-search">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden="true"><circle cx="11" cy="11" r="7" /><path d="M20 20l-3.5-3.5" /></svg>
        <span className="sr-only">{t('search')}</span>
        <input type="search" placeholder={t('mtSearch')} value={q} onChange={(e) => setQ(e.target.value)} />
      </label>
      {!d && !msg && <p className="meta">{t('dbLoading')}</p>}

      {d && (
        <section aria-labelledby="mt-projects" className="ac-section">
          <h2 id="mt-projects" className="sd-h2">{t('mtProjects')} <span className="ac-count">{projects.length}</span></h2>
          {projects.length === 0 && <p className="meta">{t('mtNoProject')}</p>}
          <ul className="mt-list">
            {projects.map((p) => (
              <li key={p.id} className="mt-item">
                <span className="studio-thumb" style={p.posterUrl ? { backgroundImage: `url(${p.posterUrl})` } : undefined} aria-hidden="true" />
                <span className="mt-text">
                  <b dir="auto">{p.title}</b>
                  <small className="meta">
                    {t('mtDurations').replace('{e}', mins(p.editedDuration)).replace('{s}', mins(p.sourceDuration))}
                    {' · '}{t('mtClips').replace('{n}', p.clips)}
                    {' · '}{t('mtUpdated').replace('{d}', ago(p.updatedAt, locale))}{p.updatedBy ? ` (${p.updatedBy})` : ''}
                  </small>
                  {p.lock.active && <small className="mt-lock" role="status">{t('mtLockedBy').replace('{n}', p.lock.by || '—')}</small>}
                </span>
                {p.canOpen
                  ? <Link href={`/studio/editor/${p.id}`} className="btn sd-pill">{t('mtOpen')}</Link>
                  : <span className="meta small">{t('mtNo_video')}</span>}
              </li>
            ))}
          </ul>
        </section>
      )}

      {d && (
        <section aria-labelledby="mt-todo" className="ac-section">
          <h2 id="mt-todo" className="sd-h2">{t('mtToEdit')} <span className="ac-count">{todo.filter((x) => x.editable).length}</span></h2>
          {todo.length === 0 && <p className="meta">{t('mtNoTalk')}</p>}
          <ul className="mt-list">
            {todo.map((x) => (
              <li key={x.id} className={`mt-item${x.editable ? '' : ' off'}`}>
                <span className="studio-thumb" style={x.posterUrl ? { backgroundImage: `url(${x.posterUrl})` } : undefined} aria-hidden="true" />
                <span className="mt-text">
                  <b dir="auto">{x.title}</b>
                  <small className="meta">{[mins(x.durationSeconds), x.speaker].filter(Boolean).join(' · ')}</small>
                </span>
                {x.editable
                  ? <button type="button" className="btn ghost sd-pill" disabled={busy === x.id} onClick={() => open(x.id)}>{busy === x.id ? t('dbLoading') : t('mtStart')}</button>
                  : <span className="meta small mt-why">{t(`mtNo_${x.reason}`)}</span>}
              </li>
            ))}
          </ul>
        </section>
      )}
    </main>
  );
}
