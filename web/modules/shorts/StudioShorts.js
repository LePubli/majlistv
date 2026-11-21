'use client';
// Studio → Shorts. Deux listes : « Prêts à publier » (extraits de l'éditeur dont le rendu vertical est terminé) et « Mes shorts »
// (brouillons et publiés). Publier copie le dernier rendu : le short reste en ligne même si l'extrait est retouché ou nettoyé.
import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useApp } from '../../components/Providers';
import { mmss } from '../../components/ShortsRail';
import { Page as BmPage, Btn as BmBtn, Badge as BmBadge, Metrics as BmMetrics, Panel as BmPanel, Table as BmTable, Hint as BmHint, c as bmc } from '../../components/backoffice/Kit';

export default function StudioShorts() {
  const { t, call, locale, skin } = useApp();
  const [d, setD] = useState(null);
  const [msg, setMsg] = useState(null);
  const [busy, setBusy] = useState('');
  const [titles, setTitles] = useState({});
  const [focus, setFocus] = useState(null);

  const load = useCallback(async () => {
    const r = await call('/studio/shorts');
    if (r.ok) setD(r.data); else setMsg({ err: true, text: r.data?.error || t('dbError') });
  }, [call, t]);
  useEffect(() => { load(); setFocus(new URLSearchParams(window.location.search).get('extrait')); }, [load]);

  const act = async (key, path, opts, ok) => {
    setBusy(key); setMsg(null);
    const r = await call(path, opts);
    setBusy('');
    if (r.ok) { if (ok) setMsg({ text: ok }); await load(); } else setMsg({ err: true, text: r.data?.error || t('dbError') });
    return r;
  };
  const publish = (c, status) => act(`c${c.projectId}`, '/studio/shorts', { method: 'POST', body: JSON.stringify({ projectId: c.projectId, status }) }, status === 'published' ? t('shrPublished') : t('shrDraftSaved'));
  const setStatus = (s, status) => act(`s${s.id}`, `/studio/shorts/${s.id}`, { method: 'PUT', body: JSON.stringify({ status }) }, status === 'published' ? t('shrPublished') : t('shrBackDraft'));
  const rename = async (s) => {
    const title = (titles[s.id] ?? s.title).trim();
    if (!title || title === s.title) return;
    await act(`s${s.id}`, `/studio/shorts/${s.id}`, { method: 'PUT', body: JSON.stringify({ title }) }, t('saved'));
  };
  const refresh = (s) => act(`s${s.id}`, `/studio/shorts/${s.id}/refresh`, { method: 'POST' }, t('shrRefreshed'));
  const remove = (s) => { if (window.confirm(t('shrConfirmDelete'))) act(`s${s.id}`, `/studio/shorts/${s.id}`, { method: 'DELETE' }, t('shrDeleted')); };
  const copyLink = async (s) => { try { await navigator.clipboard.writeText(`${window.location.origin}/shorts/${s.id}`); setMsg({ text: t('shrLinkCopied') }); } catch { setMsg({ err: true, text: `${window.location.origin}/shorts/${s.id}` }); } };

  const todo = (d?.candidates || []).filter((c) => !c.shortId);
  const date = (iso) => (iso ? new Date(iso).toLocaleDateString(locale, { day: 'numeric', month: 'short', year: 'numeric' }) : '');

  if (skin === 'premium') {
    const shorts = d?.shorts || [];
    const msgEl = msg && <p className={msg.err ? 'error small' : 'sd-note'} role={msg.err ? 'alert' : 'status'}>{msg.text}</p>;
    return (
      <main className="studio-page sh-studio">
        <BmPage title={t('shrSdNav')} sub={t('shrStudioIntro')} actions={<BmBtn primary={false} href="/studio/editor">{t('shrOpenEditor')}</BmBtn>}>
          <BmMetrics cols="three" items={d ? [
            { icon: 'smartphone', label: t('shrMine'), value: shorts.length },
            { icon: 'check', tone: 'green', label: t('shrStatePublished'), value: shorts.filter((x) => x.status === 'published').length },
            { icon: 'eye', label: 'Vues', value: shorts.reduce((n, x) => n + (x.views || 0), 0).toLocaleString(locale) },
          ] : []} />
          {msgEl}
          {!d && !msg && <p className="meta">{t('shrLoading')}</p>}
          {d && (
            <>
              <BmPanel title={t('shrToPublish')} extra={`${todo.length}`}>
                <BmTable empty={<>{t('shrNoCandidate')} <Link href="/studio/editor" className="link u">{t('shrOpenEditor')}</Link></>}
                  headers={['Extrait', 'Vidéo', 'Durée', '']}
                  rows={todo.map((c) => [
                    <b key="a" dir="auto">{c.title || c.talkTitle}</b>, c.talkTitle, c.duration != null ? mmss(c.duration) : '—',
                    <span key="b" style={{ display: 'flex', gap: 8 }}>
                      <BmBtn disabled={busy === `c${c.projectId}`} onClick={() => publish(c, 'published')}>{t('shrPublish')}</BmBtn>
                      <BmBtn primary={false} disabled={busy === `c${c.projectId}`} onClick={() => publish(c, 'draft')}>{t('shrKeepDraft')}</BmBtn>
                    </span>,
                  ])} />
              </BmPanel>
              <BmPanel title={t('shrMine')} extra={`${shorts.length}`}>
                <BmTable empty={t('shrNoneYet')} headers={['', t('shrTitleField'), 'Vidéo', t('shrStatePublished'), '']}
                  rows={shorts.map((s) => [
                    s.videoUrl ? <video key="v" className="sh-thumb" src={s.videoUrl} poster={s.posterUrl || undefined} preload="metadata" muted playsInline controls aria-label={s.title} style={{ width: 72, borderRadius: 6 }} /> : '',
                    <input key="i" value={titles[s.id] ?? s.title} maxLength={90} onChange={(e) => setTitles((x) => ({ ...x, [s.id]: e.target.value }))} onBlur={() => rename(s)} onKeyDown={(e) => { if (e.key === 'Enter') e.currentTarget.blur(); }} />,
                    <span key="t">{s.talk.title}<br /><small>{s.duration != null && mmss(s.duration)} · {t('shrViews').replace('{n}', s.views.toLocaleString(locale))}{s.publishedAt && ` · ${date(s.publishedAt)}`}</small></span>,
                    <BmBadge key="s" tone={s.status === 'published' ? (s.talk.visible ? 'green' : 'amber') : 'blue'}>{s.status === 'published' ? (s.talk.visible ? t('shrStatePublished') : t('shrStateHidden')) : t('shrStateDraft')}</BmBadge>,
                    <span key="a" style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                      {s.status === 'draft'
                        ? <BmBtn disabled={busy === `s${s.id}`} onClick={() => setStatus(s, 'published')}>{t('shrPublish')}</BmBtn>
                        : <BmBtn primary={false} disabled={busy === `s${s.id}`} onClick={() => setStatus(s, 'draft')}>{t('shrUnpublish')}</BmBtn>}
                      {s.status === 'published' && <BmBtn primary={false} onClick={() => copyLink(s)}>{t('shrCopyLink')}</BmBtn>}
                      {s.projectId && <BmBtn primary={false} disabled={busy === `s${s.id}`} onClick={() => refresh(s)}>{t('shrRefresh')}</BmBtn>}
                      <BmBtn primary={false} disabled={busy === `s${s.id}`} onClick={() => remove(s)}>{t('shrDelete')}</BmBtn>
                    </span>,
                  ])} />
              </BmPanel>
            </>
          )}
        </BmPage>
      </main>
    );
  }
  return (
    <main className="studio-page sh-studio">
      <nav className="db-crumbs meta" aria-label={t('dbCrumbs')}><Link href="/studio">{t('dbStudio')}</Link> / <span>{t('shrSdNav')}</span></nav>
      <div className="studio-head"><h1 className="studio-title">{t('shrSdNav')}</h1></div>
      <p className="meta">{t('shrStudioIntro')}</p>
      {msg && <p className={msg.err ? 'error small' : 'sd-note'} role={msg.err ? 'alert' : 'status'}>{msg.text}</p>}
      {!d && !msg && <p className="meta">{t('shrLoading')}</p>}

      {d && (
        <>
          <section className="sd-card" aria-labelledby="sh-todo">
            <h2 id="sh-todo">{t('shrToPublish')}</h2>
            {todo.length === 0 ? (
              <p className="meta">{t('shrNoCandidate')} <Link href="/studio/editor" className="link u">{t('shrOpenEditor')}</Link></p>
            ) : (
              <ul className="sh-list">
                {todo.map((c) => (
                  <li key={c.projectId} className={`sh-li${focus === c.projectId ? ' focus' : ''}`}>
                    <div className="sh-li-text"><b>{c.title || c.talkTitle}</b><span className="meta">{c.talkTitle}{c.duration != null && ` · ${mmss(c.duration)}`}</span></div>
                    <div className="sh-li-act">
                      <button type="button" className="btn" disabled={busy === `c${c.projectId}`} onClick={() => publish(c, 'published')} data-act="short-publish">{t('shrPublish')}</button>
                      <button type="button" className="btn ghost" disabled={busy === `c${c.projectId}`} onClick={() => publish(c, 'draft')} data-act="short-draft">{t('shrKeepDraft')}</button>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section className="sd-card" aria-labelledby="sh-mine">
            <h2 id="sh-mine">{t('shrMine')}</h2>
            {d.shorts.length === 0 ? <p className="meta">{t('shrNoneYet')}</p> : (
              <ul className="sh-list">
                {d.shorts.map((s) => (
                  <li key={s.id} className="sh-li sh-li-short" data-short={s.id}>
                    {s.videoUrl && <video className="sh-thumb" src={s.videoUrl} poster={s.posterUrl || undefined} preload="metadata" muted playsInline controls aria-label={s.title} />}
                    <div className="sh-li-text">
                      <label className="sh-title-edit">
                        <span className="meta">{t('shrTitleField')}</span>
                        <input value={titles[s.id] ?? s.title} maxLength={90} onChange={(e) => setTitles((x) => ({ ...x, [s.id]: e.target.value }))} onBlur={() => rename(s)} onKeyDown={(e) => { if (e.key === 'Enter') e.currentTarget.blur(); }} />
                      </label>
                      <span className="meta">{s.talk.title}{s.duration != null && ` · ${mmss(s.duration)}`} · {t('shrViews').replace('{n}', s.views.toLocaleString(locale))}{s.publishedAt && ` · ${date(s.publishedAt)}`}</span>
                      <span className={`sh-state ${s.status}`}>{s.status === 'published' ? (s.talk.visible ? t('shrStatePublished') : t('shrStateHidden')) : t('shrStateDraft')}</span>
                    </div>
                    <div className="sh-li-act">
                      {s.status === 'draft'
                        ? <button type="button" className="btn" disabled={busy === `s${s.id}`} onClick={() => setStatus(s, 'published')} data-act="short-publish">{t('shrPublish')}</button>
                        : <button type="button" className="btn ghost" disabled={busy === `s${s.id}`} onClick={() => setStatus(s, 'draft')} data-act="short-unpublish">{t('shrUnpublish')}</button>}
                      {s.status === 'published' && <button type="button" className="btn ghost" onClick={() => copyLink(s)}>{t('shrCopyLink')}</button>}
                      {s.projectId && <button type="button" className="btn ghost" disabled={busy === `s${s.id}`} onClick={() => refresh(s)} title={t('shrRefreshHint')}>{t('shrRefresh')}</button>}
                      <button type="button" className="btn ghost danger" disabled={busy === `s${s.id}`} onClick={() => remove(s)} data-act="short-delete">{t('shrDelete')}</button>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </>
      )}
    </main>
  );
}
