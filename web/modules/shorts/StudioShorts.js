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
  const [notes, setNotes] = useState({});
  const [sel, setSel] = useState([]);          // relecture en lot : shorts cochés
  const [batchNote, setBatchNote] = useState('');

  const load = useCallback(async () => {
    const r = await call('/studio/shorts');
    if (r.ok) setD(r.data); else setMsg({ err: true, text: r.data?.error || t('dbError') });
  }, [call, t]);
  useEffect(() => { load(); setFocus(new URLSearchParams(window.location.search).get('extrait')); }, [load]);

  const act = async (key, path, opts, ok) => {
    setBusy(key); setMsg(null);
    const r = await call(path, opts);
    setBusy('');
    if (r.ok) { const text = typeof ok === 'function' ? ok(r) : ok; if (text) setMsg({ text }); await load(); } else setMsg({ err: true, text: r.data?.error || t('dbError') });
    return r;
  };
  const publish = (c, status) => act(`c${c.projectId}`, '/studio/shorts', { method: 'POST', body: JSON.stringify({ projectId: c.projectId, status }) }, (r) => (r.data?.status === 'pending' ? t('shrAsked') : status === 'published' ? t('shrPublished') : t('shrDraftSaved')));
  const setStatus = (s, status) => act(`s${s.id}`, `/studio/shorts/${s.id}`, { method: 'PUT', body: JSON.stringify({ status }) }, (r) => (r.data?.status === 'pending' ? t('shrAsked') : status === 'published' ? t('shrPublished') : t('shrBackDraft')));
  // Relecture (modérateur / administrateur) : valider = publier ; refuser demande un motif, visible par l'auteur.
  const review = async (s, decision) => {
    const note = (notes[s.id] || '').trim();
    if (decision === 'reject' && !note) { setMsg({ err: true, text: t('shrNeedNote') }); return; }
    const r = await act(`s${s.id}`, `/studio/shorts/${s.id}/review`, { method: 'POST', body: JSON.stringify({ decision, note }) }, decision === 'approve' ? t('shrApproved') : t('shrRejected'));
    if (r.ok) setNotes((x) => ({ ...x, [s.id]: '' }));
  };
  const rename = async (s) => {
    const title = (titles[s.id] ?? s.title).trim();
    if (!title || title === s.title) return;
    await act(`s${s.id}`, `/studio/shorts/${s.id}`, { method: 'PUT', body: JSON.stringify({ title }) }, t('saved'));
  };
  const refresh = (s) => act(`s${s.id}`, `/studio/shorts/${s.id}/refresh`, { method: 'POST' }, t('shrRefreshed'));
  const remove = (s) => { if (window.confirm(t('shrConfirmDelete'))) act(`s${s.id}`, `/studio/shorts/${s.id}`, { method: 'DELETE' }, t('shrDeleted')); };
  const copyLink = async (s) => { try { await navigator.clipboard.writeText(`${window.location.origin}/shorts/${s.id}`); setMsg({ text: t('shrLinkCopied') }); } catch { setMsg({ err: true, text: `${window.location.origin}/shorts/${s.id}` }); } };

  const toggle = (id) => setSel((x) => (x.includes(id) ? x.filter((y) => y !== id) : [...x, id]));
  const reviewBatch = async (decision) => {
    const note = batchNote.trim();
    const ids = sel.filter((id) => (d?.shorts || []).some((x) => x.id === id && x.status === 'pending'));
    if (!ids.length) return;
    if (decision === 'reject' && !note) { setMsg({ err: true, text: t('shrNeedNote') }); return; }
    const r = await act('batch', '/studio/shorts/review-batch', { method: 'POST', body: JSON.stringify({ ids, decision, note }) },
      (x) => (decision === 'approve' ? t('shrBatchApproved') : t('shrBatchRejected')).replace('{n}', x.data?.done ?? ids.length));
    if (r.ok) { setSel([]); setBatchNote(''); }
  };
  const askLabel = d?.review && !d?.canReview ? t('shrAskReview') : t('shrPublish');
  const pending = (d?.shorts || []).filter((x) => x.status === 'pending');
  const stateOf = (s) => (s.status === 'published' ? (s.talk.visible ? t('shrStatePublished') : t('shrStateHidden')) : s.status === 'pending' ? t('shrStatePending') : t('shrStateDraft'));
  const toneOf = (s) => (s.status === 'published' ? (s.talk.visible ? 'green' : 'amber') : s.status === 'pending' ? 'amber' : 'blue');
  const todo = (d?.candidates || []).filter((c) => !c.shortId);
  const date = (iso) => (iso ? new Date(iso).toLocaleDateString(locale, { day: 'numeric', month: 'short', year: 'numeric' }) : '');

  if (skin === 'premium') {
    const shorts = d?.shorts || [];
    const msgEl = msg && <p className={msg.err ? 'error small' : 'sd-note'} role={msg.err ? 'alert' : 'status'}>{msg.text}</p>;
    return (
      <main className="studio-page sh-studio">
        <BmPage title={t('shrSdNav')} sub={t('shrStudioIntro')} actions={<><BmBtn primary={false} href="/studio/shorts/import">{t('shiTitle')}</BmBtn><BmBtn primary={false} href="/studio/editor">{t('shrOpenEditor')}</BmBtn></>}>
          <BmMetrics cols={d?.review ? 'four' : 'three'} items={d ? [
            { icon: 'smartphone', label: t('shrMine'), value: shorts.length },
            ...(d.review ? [{ icon: 'clock', tone: pending.length ? 'amber' : 'green', label: t('shrToReview'), value: pending.length }] : []),
            { icon: 'check', tone: 'green', label: t('shrStatePublished'), value: shorts.filter((x) => x.status === 'published').length },
            { icon: 'eye', label: 'Vues', value: shorts.reduce((n, x) => n + (x.views || 0), 0).toLocaleString(locale) },
          ] : []} />
          {msgEl}
          {!d && !msg && <p className="meta">{t('shrLoading')}</p>}
          {d && (
            <>
              {d.review && !d.canReview && <BmHint>{t('shrReviewOnHint')}</BmHint>}
              {d.canReview && (d.review || pending.length > 0) && (
                <BmPanel title={t('shrToReview')} extra={`${pending.length}`}>
                  {pending.length > 1 && (
                    <div className="sh-batch" style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center', padding: '0 14px 10px' }}>
                      <label style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                        <input type="checkbox" checked={sel.length === pending.length} onChange={(e) => setSel(e.target.checked ? pending.map((x) => x.id) : [])} />
                        {t('shrSelectAll')}
                      </label>
                      <span className="meta">{t('shrSelected').replace('{n}', sel.length)}</span>
                      <input value={batchNote} maxLength={300} placeholder={t('shrRejectNote')} aria-label={t('shrRejectNote')} onChange={(e) => setBatchNote(e.target.value)} style={{ flex: '1 1 220px', minWidth: 0 }} />
                      <BmBtn disabled={!sel.length || busy === 'batch'} onClick={() => reviewBatch('approve')}>{t('shrApproveSel')}</BmBtn>
                      <BmBtn primary={false} disabled={!sel.length || busy === 'batch'} onClick={() => reviewBatch('reject')}>{t('shrRejectSel')}</BmBtn>
                    </div>
                  )}
                  <BmTable empty={t('shrNoneToReview')} headers={[pending.length > 1 ? '✓' : '', '', t('shrTitleField'), 'Vidéo', t('shrRejectNote'), '']}
                    rows={pending.map((s) => [
                      pending.length > 1 ? <input key="c" type="checkbox" checked={sel.includes(s.id)} onChange={() => toggle(s.id)} aria-label={s.title} /> : <span key="c" />,
                      s.videoUrl ? <video key="v" className="sh-thumb" src={s.videoUrl} poster={s.posterUrl || undefined} preload="metadata" muted playsInline controls aria-label={s.title} style={{ width: 72, borderRadius: 6 }} /> : '',
                      <span key="i"><b dir="auto">{s.title}</b>{s.author && <><br /><small>{t('shrAuthorBy').replace('{name}', s.author)}</small></>}</span>,
                      <span key="t">{s.talk.title}<br /><small>{s.duration != null && mmss(s.duration)}{s.submittedAt && ` · ${date(s.submittedAt)}`}</small></span>,
                      <input key="n" value={notes[s.id] || ''} maxLength={300} placeholder={t('shrRejectNote')} aria-label={t('shrRejectNote')} onChange={(e) => setNotes((x) => ({ ...x, [s.id]: e.target.value }))} />,
                      <span key="a" style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                        <BmBtn disabled={busy === `s${s.id}`} onClick={() => review(s, 'approve')}>{t('shrApprove')}</BmBtn>
                        <BmBtn primary={false} disabled={busy === `s${s.id}`} onClick={() => review(s, 'reject')}>{t('shrReject')}</BmBtn>
                      </span>,
                    ])} />
                </BmPanel>
              )}
              <BmPanel title={t('shrToPublish')} extra={`${todo.length}`}>
                <BmTable empty={<>{t('shrNoCandidate')} <Link href="/studio/editor" className="link u">{t('shrOpenEditor')}</Link></>}
                  headers={['Extrait', 'Vidéo', 'Durée', '']}
                  rows={todo.map((c) => [
                    <b key="a" dir="auto">{c.title || c.talkTitle}</b>, c.talkTitle, c.duration != null ? mmss(c.duration) : '—',
                    <span key="b" style={{ display: 'flex', gap: 8 }}>
                      <BmBtn disabled={busy === `c${c.projectId}`} onClick={() => publish(c, 'published')}>{askLabel}</BmBtn>
                      <BmBtn primary={false} disabled={busy === `c${c.projectId}`} onClick={() => publish(c, 'draft')}>{t('shrKeepDraft')}</BmBtn>
                    </span>,
                  ])} />
              </BmPanel>
              <BmPanel title={t('shrMine')} extra={`${shorts.length}`}>
                <BmTable empty={t('shrNoneYet')} headers={['', t('shrTitleField'), 'Vidéo', t('shrStatePublished'), '']}
                  rows={shorts.map((s) => [
                    s.videoUrl ? <video key="v" className="sh-thumb" src={s.videoUrl} poster={s.posterUrl || undefined} preload="metadata" muted playsInline controls aria-label={s.title} style={{ width: 72, borderRadius: 6 }} /> : '',
                    <input key="i" value={titles[s.id] ?? s.title} maxLength={90} onChange={(e) => setTitles((x) => ({ ...x, [s.id]: e.target.value }))} onBlur={() => rename(s)} onKeyDown={(e) => { if (e.key === 'Enter') e.currentTarget.blur(); }} />,
                    <span key="t">{s.talk.title}<br /><small>{s.duration != null && mmss(s.duration)} · {t('shrViews').replace('{n}', s.views.toLocaleString(locale))}{s.publishedAt && ` · ${date(s.publishedAt)}`}</small>{s.status === 'draft' && s.reviewNote && <><br /><small role="note">{t('shrRefused').replace('{note}', s.reviewNote)}</small></>}</span>,
                    <BmBadge key="s" tone={toneOf(s)}>{stateOf(s)}</BmBadge>,
                    <span key="a" style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                      {s.status === 'draft'
                        ? <BmBtn disabled={busy === `s${s.id}`} onClick={() => setStatus(s, 'published')}>{askLabel}</BmBtn>
                        : <BmBtn primary={false} disabled={busy === `s${s.id}`} onClick={() => setStatus(s, 'draft')}>{s.status === 'pending' ? t('shrWithdraw') : t('shrUnpublish')}</BmBtn>}
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
      <p><Link href="/studio/shorts/import" className="btn">{t('shiTitle')}</Link></p>
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
                      <button type="button" className="btn" disabled={busy === `c${c.projectId}`} onClick={() => publish(c, 'published')} data-act="short-publish">{askLabel}</button>
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
                      <span className={`sh-state ${s.status}`}>{stateOf(s)}</span>
                      {s.status === 'draft' && s.reviewNote && <span className="meta small">{t('shrRefused').replace('{note}', s.reviewNote)}</span>}
                      {d.canReview && s.status === 'pending' && (
                        <span className="sh-review">
                          {s.author && <span className="meta small">{t('shrAuthorBy').replace('{name}', s.author)}</span>}
                          <input value={notes[s.id] || ''} maxLength={300} placeholder={t('shrRejectNote')} aria-label={t('shrRejectNote')} onChange={(e) => setNotes((x) => ({ ...x, [s.id]: e.target.value }))} />
                          <button type="button" className="btn" disabled={busy === `s${s.id}`} onClick={() => review(s, 'approve')}>{t('shrApprove')}</button>
                          <button type="button" className="btn ghost" disabled={busy === `s${s.id}`} onClick={() => review(s, 'reject')}>{t('shrReject')}</button>
                        </span>
                      )}
                    </div>
                    <div className="sh-li-act">
                      {s.status === 'draft'
                        ? <button type="button" className="btn" disabled={busy === `s${s.id}`} onClick={() => setStatus(s, 'published')} data-act="short-publish">{askLabel}</button>
                        : <button type="button" className="btn ghost" disabled={busy === `s${s.id}`} onClick={() => setStatus(s, 'draft')} data-act="short-unpublish">{s.status === 'pending' ? t('shrWithdraw') : t('shrUnpublish')}</button>}
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
