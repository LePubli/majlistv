'use client';
// Studio → Contenus (maquette « Studio v2 », écran 2) — étape S3 : parcours de production en 7 étapes
// (Importée › Transcrite › Traduite › Relue › Montée › Doublée › Publiée), langue d'origine → français, visibilité, vues.
// Données : GET /me/talks (vidéos, traitements) + GET /studio/production (vues et doublage, fournis par les modules).
// Conservé : recherche, modification en lot, relecture avant mise en ligne (modération), vidéos programmées.
import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useApp } from '../../../components/Providers';
import StudioTabs from '../../../components/StudioTabs';
import { langName } from '../../../components/Transcript';
import BulkEdit from '../../../components/BulkEdit';
import Pager, { usePaged } from '../../../components/Pager';
import { talkSteps, talkKind, sourceLabel } from '../../../lib/talkState';
import { production, STAGES } from '../../../lib/production';
import { hasWebModule } from '../../../lib/modules';
import BoKpis from '../../../components/backoffice/BoKpis';
import BoQuickSheet from '../../../components/backoffice/BoQuickSheet';
import { Page as BmPage, Btn as BmBtn, Badge as BmBadge, Metrics as BmMetrics, Panel as BmPanel, Table as BmTable, Drawer as BmDrawer, Meta as BmMeta, c as bmc } from '../../../components/backoffice/Kit';

const mins = (s) => (s ? `${Math.max(1, Math.round(s / 60))} min` : '');
const FILTERS = ['all', 'todub', 'toreview', 'live', 'draft', 'run', 'err', 'modreview'];
const ALWAYS = ['all', 'live'];

function Stages({ p, t }) {
  return (
    <span className="pd-stages" role="img" aria-label={STAGES.map((k) => `${t(`pdSt_${k}`)} : ${t(`pdState_${p.stages[k]}`)}`).join(', ')}>
      {STAGES.map((k) => <i key={k} className={`pd-dash ${p.stages[k]}`} title={`${t(`pdSt_${k}`)} : ${t(`pdState_${p.stages[k]}`)}`} />)}
    </span>
  );
}

export default function StudioTalks() {
  const { t, call, locale, feat, modUsable, skin } = useApp();
  const pm = skin === 'premium';
  const [quick, setQuick] = useState(null); // fiche rapide ouverte (thème Premium)
  const [mine, setMine] = useState(null);
  const [prod, setProd] = useState({});
  const [q, setQ] = useState('');
  const [filter, setFilter] = useState('all');
  const [sel, setSel] = useState(() => new Set());
  const [bulk, setBulk] = useState(false);
  const [flash, setFlash] = useState('');
  useEffect(() => {
    const f = new URLSearchParams(window.location.search).get('filter');
    const map = { review: 'modreview' };
    if (FILTERS.includes(map[f] || f)) setFilter(map[f] || f);
  }, []);
  const load = useCallback(() => Promise.all([
    call('/me/talks').then((r) => r.ok && setMine(r.data)),
    call('/studio/production').then((r) => r.ok && setProd(r.data.talks)),
  ]), [call]);
  useEffect(() => { load(); }, [load]);

  const dubOn = hasWebModule('dubbing') && feat('dubbing') && modUsable('dubbing');
  const rows = useMemo(() => (mine || []).map((x) => {
    const steps = talkSteps(x);
    const r = { ...x, steps, kind: talkKind(x, steps) };
    return { ...r, p: production(r, prod[x.id] || {}) };
  }), [mine, prod]);

  const running = rows.some((r) => r.kind === 'run' || r.p.label === 'dubbing');
  useEffect(() => {
    if (!running) return undefined;
    const id = setInterval(load, 6000);
    return () => clearInterval(id);
  }, [running, load]);

  const match = (r, f) => ({
    all: true, todub: r.p.toDub, toreview: r.p.toReview, live: r.kind === 'live', draft: r.kind === 'draft' || r.kind === 'sched',
    run: r.kind === 'run', err: r.kind === 'err', modreview: r.kind === 'review',
  })[f];
  const count = (f) => rows.filter((r) => match(r, f)).length;
  const shownFilters = FILTERS.filter((f) => ALWAYS.includes(f) || (['todub', 'toreview'].includes(f) ? dubOn : count(f) > 0) || filter === f);
  const langPair = (r) => {
    const l = String(r.p.lang || '').split('-')[0].toUpperCase();
    if (!l) return '—';
    return r.p.french || r.p.stages.translated === 'na' ? l : `${l} → FR`;
  };
  const text = (r) => `${r.title} ${r.speaker} ${langPair(r)} ${langName(String(r.p.lang || '').split('-')[0], locale) || ''} ${t(`pdLabel_${r.p.label}`)}`.toLowerCase();
  const needle = q.trim().toLowerCase();

  const shown = rows.filter((r) => match(r, filter) && (!needle || text(r).includes(needle)));
  // 25 lignes par page ; « tout cocher » ne touche que la page affichée (jamais des lignes qu'on ne voit pas).
  const pg = usePaged(shown, 25, `${filter}|${needle}`);
  const pageRows = pg.slice;
  const allShown = pageRows.length > 0 && pageRows.every((r) => sel.has(r.id));
  const toggleAll = () => setSel((s0) => { const n = new Set(s0); if (allShown) pageRows.forEach((r) => n.delete(r.id)); else pageRows.forEach((r) => n.add(r.id)); return n; });
  // Suppression en lot (6.9) : confirmation, puis /talks/bulk-delete ; le résultat dit combien ont été supprimées ou refusées.
  const removeSelected = async () => {
    if (!window.confirm(t('bkDeleteConfirm').replace('{n}', sel.size))) return;
    const r = await call('/talks/bulk-delete', { method: 'POST', body: JSON.stringify({ ids: [...sel] }) });
    if (!r.ok) { setFlash(r.data?.error || 'Erreur'); return; }
    setSel(new Set()); setFlash([t('bkDeleted').replace('{n}', r.data.deleted), r.data.notDeleted ? t('bkNotDeleted').replace('{n}', r.data.notDeleted) : ''].filter(Boolean).join(' '));
    load(); setTimeout(() => setFlash(''), 6000);
  };
  const toggleOne = (id) => setSel((s0) => { const n = new Set(s0); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  const date = (d) => new Date(d).toLocaleDateString(locale, { day: 'numeric', month: 'short', year: 'numeric' });
  const dateTime = (d) => new Date(d).toLocaleString(locale, { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
  const nf = new Intl.NumberFormat(locale);
  const visibility = (r) => {
    if (r.kind === 'review') return [t('state_review_' + r.reviewStatus), 'muted'];
    if (r.kind === 'sched') return [t('pdVisSched').replace('{d}', dateTime(r.publishAt)), 'muted'];
    if (r.publication === 'draft') return [t('pdVisDraft'), 'muted'];
    return [t('pdVisPublic'), 'ok'];
  };
  const label = (r) => {
    const base = t(`pdLabel_${r.p.label}`);
    return r.p.pct != null ? `${base} ${r.p.pct} %` : base;
  };

  if (pm) {
    const qr = quick ? rows.find((x) => x.id === quick) : null;
    const tone = (k) => ({ ok: 'green', warn: 'amber', err: 'red', run: 'blue' }[k] || 'blue');
    const table = (
      <BmTable pageSize={0} empty={mine && rows.length === 0 ? t('studioEmpty') : t('noResults')} onRow={(i) => setQuick(quick === pageRows[i].id ? null : pageRows[i].id)}
        headers={[<input key="all" type="checkbox" checked={allShown} onChange={toggleAll} aria-label={t('bkAll')} />, t('pdColTalk'), t('pdColLang'), t('pdColProd'), t('pdColVis'), t('pdColViews')]}
        rows={pageRows.map((r) => {
          const [vis] = visibility(r);
          return [
            <span key="c" onClick={(e) => e.stopPropagation()}><input type="checkbox" checked={sel.has(r.id)} onChange={() => toggleOne(r.id)} aria-label={r.title} /></span>,
            <span key="t" style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
              <span style={{ width: 64, height: 40, borderRadius: 6, flex: '0 0 auto', background: '#0b2a45 center/cover', ...(r.posterUrl ? { backgroundImage: `url(${r.posterUrl})` } : {}) }} />
              <span><b dir="auto">{r.title}</b><br /><small>{[mins(r.durationSeconds), r.source === 'upload' ? t('pdSentOn').replace('{d}', date(r.created_at)) : `${sourceLabel(r.source)} (${t('pdNotEditable')})`].filter(Boolean).join(' · ')}</small></span>
            </span>,
            langPair(r),
            <span key="p" style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '6px 10px' }}><Stages p={r.p} t={t} /> <BmBadge tone={tone(r.p.tone)}>{label(r)}</BmBadge></span>,
            vis,
            r.p.views == null || (r.p.views === 0 && r.kind !== 'live') ? '—' : nf.format(r.p.views),
          ];
        })} />
    );
    return (
      <main className="studio-page">
      <BmPage title={t('bqPageTitle')} sub={t('bqPageSub')} actions={<BmBtn href="/studio/new">+ {t('newTalk')}</BmBtn>}>
        <BmMetrics items={mine ? [
          { icon: 'video', label: t('bqKAll'), value: rows.length },
          { icon: 'activity', label: t('bqKRun'), value: count('run') },
          { icon: 'file', tone: 'amber', label: t('bqKReview'), value: count('modreview') + (dubOn ? count('toreview') : 0) },
          { icon: 'check', tone: 'green', label: t('bqKLive'), value: count('live') },
        ] : []} />
        <StudioTabs group="contents" />
        {flash && <p className="notice" role="status">{flash}</p>}
        {sel.size > 0 && !bulk && (
          <div className="bk-bar" role="region" aria-label={t('bkEdit')}>
            <strong>{t('bkSelected').replace('{n}', sel.size)}</strong>
            <button type="button" className="btn" onClick={() => setBulk(true)}>{t('bkEdit')}</button>
            <button type="button" className="btn ghost" onClick={removeSelected}>{t('bkRemove')}</button>
            <button type="button" className="btn ghost" onClick={() => setSel(new Set())}>{t('bkClear')}</button>
          </div>
        )}
        {bulk && sel.size > 0 && (
          <BulkEdit ids={[...sel]} onCancel={() => setBulk(false)}
            onDone={(n) => { setBulk(false); setSel(new Set()); setFlash(t('bkDone').replace('{n}', n)); load(); setTimeout(() => setFlash(''), 5000); }} />
        )}
        <div className={bmc(`split ${qr ? 'inspector-split' : ''}`)}>
          <BmPanel title={t('bqPageTitle')} extra={mine ? `${shown.length}` : ''}>
            <div className={bmc('inline-tools')}>
              <label className={bmc('search-field')}><input type="search" placeholder={t('pdSearch')} value={q} onChange={(e) => setQ(e.target.value)} /></label>
              <select value={filter} onChange={(e) => setFilter(e.target.value)} aria-label={t('filterBy')}>
                {shownFilters.map((k) => <option key={k} value={k}>{t('pdFilter_' + k)}{k !== 'all' && mine ? ` (${count(k)})` : ''}</option>)}
              </select>
            </div>
            {table}
            <Pager p={pg} />
          </BmPanel>
          {qr && (
            <BmDrawer title={t('bqTitle')} onClose={() => setQuick(null)}>
              <div style={{ height: 130, borderRadius: 8, margin: '0 0 12px', background: '#0b2a45 center/cover', ...(qr.posterUrl ? { backgroundImage: `url(${qr.posterUrl})` } : {}) }} />
              <BmMeta items={[[t('bqTitleField'), <span key="t" dir="auto">{qr.title}</span>], ...(qr.speaker ? [[t('bqSpeaker'), qr.speaker]] : []), [t('bqLangs'), langPair(qr)], ...(mins(qr.durationSeconds) ? [[t('bqDuration'), mins(qr.durationSeconds)]] : []), [t('bqStatus'), <BmBadge key="s" tone={tone(qr.p.tone)}>{label(qr)}</BmBadge>], [t('bqVis'), visibility(qr)[0]]]} />
              <h4>{t('bqSteps')}</h4>
              <div className={bmc('mini-steps')}>
                {STAGES.map((k, i) => <span key={k}><i className={qr.p.stages[k] === 'ok' ? bmc('done') : ''}>{qr.p.stages[k] === 'ok' ? '✓' : i + 1}</i><small>{t(`pdSt_${k}`)}</small></span>)}
              </div>
              <div className={bmc('drawer-box')}>
                <h4>{t('bqOptions')}</h4>
                <Link className={bmc('drawer-action')} href={`/studio/${qr.id}`}>{t('manage')} →</Link>
                {hasWebModule('stats') && feat('stats') && modUsable('stats') && <Link className={bmc('drawer-action')} href={`/studio/stats?talk=${qr.id}`}>{t('sdAnalytics')} →</Link>}
                {dubOn && <Link className={bmc('drawer-action')} href={`/studio/dubbing/${qr.id}`}>{t('sdDub')} →</Link>}
                {hasWebModule('editor') && feat('editor') && modUsable('editor') && qr.source === 'upload' && <Link className={bmc('drawer-action')} href={`/studio/editor?talk=${qr.id}`}>{t('sdEditInEditor')} →</Link>}
              </div>
            </BmDrawer>
          )}
        </div>
        <p className="meta small">{t('pdLegendNote')}</p>
      </BmPage>
      </main>
    );
  }
  return (
    <main className={`studio-page pd-page${pm && quick ? ' bo-has-quick' : ''}`}>
      <nav className="db-crumbs meta" aria-label={t('dbCrumbs')}><Link href="/studio">{t('dbStudio')}</Link> / <span>{t('sdContents')}</span></nav>
      <div className="studio-head">
        <h1 className="studio-title">{pm ? t('bqPageTitle') : t('sdContentsTitle')}</h1>
        <Link href="/studio/new" className="btn sd-pill">+ {t('newTalk')}</Link>
      </div>

      {pm && <p className="bo-sub">{t('bqPageSub')}</p>}
      <BoKpis items={mine ? [
        { icon: 'film', tone: 'blue', label: t('bqKAll'), value: rows.length },
        { icon: 'pulse', tone: 'blue', label: t('bqKRun'), value: count('run') },
        { icon: 'doc', tone: 'blue', label: t('bqKReview'), value: count('modreview') + (dubOn ? count('toreview') : 0) },
        { icon: 'check', tone: 'green', label: t('bqKLive'), value: count('live') },
      ] : []} />

      <StudioTabs group="contents" />

      <div className="studio-tools">
        <label className="studio-search">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden="true"><circle cx="11" cy="11" r="7" /><path d="M20 20l-3.5-3.5" /></svg>
          <span className="sr-only">{t('search')}</span>
          <input type="search" placeholder={t('pdSearch')} value={q} onChange={(e) => setQ(e.target.value)} />
        </label>
        <div className="pills" role="group" aria-label={t('filterBy')}>
          {shownFilters.map((k) => (
            <button key={k} type="button" aria-pressed={filter === k} className={filter === k ? 'pill on' : 'pill'} onClick={() => setFilter(k)}>
              {t('pdFilter_' + k)}{k !== 'all' && mine ? ` (${count(k)})` : ''}
            </button>
          ))}
        </div>
      </div>

      {mine && rows.length === 0 && (
        <div className="studio-empty">
          <p>{t('studioEmpty')}</p>
          <Link href="/studio/new" className="btn">+ {t('newTalk')}</Link>
        </div>
      )}
      {mine && rows.length > 0 && shown.length === 0 && <p className="meta">{t('noResults')}</p>}

      {flash && <p className="notice" role="status">{flash}</p>}
      {sel.size > 0 && !bulk && (
        <div className="bk-bar" role="region" aria-label={t('bkEdit')}>
          <strong>{t('bkSelected').replace('{n}', sel.size)}</strong>
          <button type="button" className="btn" onClick={() => setBulk(true)}>{t('bkEdit')}</button>
          <button type="button" className="btn ghost" onClick={removeSelected}>{t('bkRemove')}</button>
          <button type="button" className="btn ghost" onClick={() => setSel(new Set())}>{t('bkClear')}</button>
        </div>
      )}
      {bulk && sel.size > 0 && (
        <BulkEdit ids={[...sel]} onCancel={() => setBulk(false)}
          onDone={(n) => { setBulk(false); setSel(new Set()); setFlash(t('bkDone').replace('{n}', n)); load(); setTimeout(() => setFlash(''), 5000); }} />
      )}
      {shown.length > 0 && (
        <div className="bo-split">
        <div className="studio-table-wrap" data-paged="1">
          <table className="studio-table pd-table">
            <thead>
              <tr>
                <th className="bk-col"><input type="checkbox" checked={allShown} onChange={toggleAll} aria-label={t('bkAll')} /></th>
                <th>{t('pdColTalk')}</th><th>{t('pdColLang')}</th><th>{t('pdColProd')}</th><th>{t('pdColVis')}</th><th>{t('pdColViews')}</th>
                <th><span className="sr-only">{t('colActions')}</span></th>
              </tr>
            </thead>
            <tbody>
              {pageRows.map((r) => {
                const [vis, visTone] = visibility(r);
                return (
                  <tr key={r.id} className={[sel.has(r.id) ? 'bk-sel' : '', pm ? 'bo-row' : '', pm && quick === r.id ? 'bo-open' : ''].filter(Boolean).join(' ') || undefined}
                    onClick={pm ? (e) => { if (!e.target.closest('a,button,input,label')) setQuick(quick === r.id ? null : r.id); } : undefined}>
                    <td className="bk-col"><input type="checkbox" checked={sel.has(r.id)} onChange={() => toggleOne(r.id)} aria-label={r.title} /></td>
                    <td>
                      <Link href={`/studio/${r.id}`} className="studio-talk">
                        <span className="studio-thumb" style={r.posterUrl ? { backgroundImage: `url(${r.posterUrl})` } : undefined} />
                        <span className="studio-talk-text">
                          <b dir="auto">{r.title}</b>
                          <small>{r.source === 'upload'
                            ? [mins(r.durationSeconds), t('pdSentOn').replace('{d}', date(r.created_at))].filter(Boolean).join(' · ')
                            : [mins(r.durationSeconds), `${sourceLabel(r.source)} (${t('pdNotEditable')})`].filter(Boolean).join(' · ')}</small>
                        </span>
                      </Link>
                    </td>
                    <td className="pd-lang">{langPair(r)}</td>
                    <td>
                      <span className="pd-prod">
                        <Stages p={r.p} t={t} />
                        <span className={`pd-label ${r.p.tone}`}>{label(r)}</span>
                      </span>
                      {r.kind === 'review' && r.reviewStatus === 'rejected' && (
                        <small className="muted review-note">{t('reviewReason')} : {r.reviewNote}{' '}
                          <button type="button" className="link u small" onClick={async () => { const x = await call(`/talks/${r.id}/review/submit`, { method: 'POST' }); if (x.ok) load(); }}>{t('reviewResubmit')}</button>
                        </small>
                      )}
                    </td>
                    <td><span className={`pd-vis ${visTone}`}>{vis}</span></td>
                    <td className="pd-views">{r.p.views == null || (r.p.views === 0 && r.kind !== 'live') ? '—' : nf.format(r.p.views)}</td>
                    <td className="end">{pm && <button type="button" className="bo-qs-open" aria-expanded={quick === r.id} aria-label={`${t('bqTitle')} — ${r.title}`} onClick={() => setQuick(quick === r.id ? null : r.id)}>›</button>}<Link href={`/studio/${r.id}`} className="manage">{t('manage')}</Link></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        <Pager p={pg} />
        </div>
        {pm && quick && rows.find((x) => x.id === quick) && (() => {
          const q = rows.find((x) => x.id === quick);
          return <BoQuickSheet row={q} langs={langPair(q)} statusLabel={label(q)} visLabel={visibility(q)[0]} minutes={mins(q.durationSeconds)} onClose={() => setQuick(null)} />;
        })()}
        </div>
      )}
      <p className="pd-legend meta small">
        <b>{t('pdStages')}</b>
        {STAGES.map((k, i) => <span key={k}>{i > 0 && <span aria-hidden="true" className="pd-sep">›</span>}{t(`pdSt_${k}`)}</span>)}
      </p>
      <p className="meta small">{t('pdLegendNote')}</p>
    </main>
  );
}
