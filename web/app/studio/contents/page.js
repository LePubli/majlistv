'use client';
// Studio → Contenus (maquette « Studio v2 », écran 2) — étape S3 : parcours de production en 7 étapes
// (Importée › Transcrite › Traduite › Relue › Montée › Doublée › Publiée), langue d'origine → français, visibilité, vues.
// Données : GET /me/talks (conférences, traitements) + GET /studio/production (vues et doublage, fournis par les modules).
// Conservé : recherche, modification en lot, relecture avant mise en ligne (modération), conférences programmées.
import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useApp } from '../../../components/Providers';
import StudioTabs from '../../../components/StudioTabs';
import { langName } from '../../../components/Transcript';
import BulkEdit from '../../../components/BulkEdit';
import { talkSteps, talkKind, sourceLabel } from '../../../lib/talkState';
import { production, STAGES } from '../../../lib/production';
import { hasWebModule } from '../../../lib/modules';

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
  const { t, call, locale, feat } = useApp();
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

  const dubOn = hasWebModule('dubbing') && feat('dubbing');
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
  const allShown = shown.length > 0 && shown.every((r) => sel.has(r.id));
  const toggleAll = () => setSel((s0) => { const n = new Set(s0); if (allShown) shown.forEach((r) => n.delete(r.id)); else shown.forEach((r) => n.add(r.id)); return n; });
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

  return (
    <main className="studio-page pd-page">
      <nav className="db-crumbs meta" aria-label={t('dbCrumbs')}><Link href="/studio">{t('dbStudio')}</Link> / <span>{t('sdContents')}</span></nav>
      <div className="studio-head">
        <h1 className="studio-title">{t('sdContentsTitle')}</h1>
        <Link href="/studio/new" className="btn sd-pill">+ {t('newTalk')}</Link>
      </div>

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
          <button type="button" className="btn ghost" onClick={() => setSel(new Set())}>{t('bkClear')}</button>
        </div>
      )}
      {bulk && sel.size > 0 && (
        <BulkEdit ids={[...sel]} onCancel={() => setBulk(false)}
          onDone={(n) => { setBulk(false); setSel(new Set()); setFlash(t('bkDone').replace('{n}', n)); load(); setTimeout(() => setFlash(''), 5000); }} />
      )}
      {shown.length > 0 && (
        <div className="studio-table-wrap">
          <table className="studio-table pd-table">
            <thead>
              <tr>
                <th className="bk-col"><input type="checkbox" checked={allShown} onChange={toggleAll} aria-label={t('bkAll')} /></th>
                <th>{t('pdColTalk')}</th><th>{t('pdColLang')}</th><th>{t('pdColProd')}</th><th>{t('pdColVis')}</th><th>{t('pdColViews')}</th>
                <th><span className="sr-only">{t('colActions')}</span></th>
              </tr>
            </thead>
            <tbody>
              {shown.map((r) => {
                const [vis, visTone] = visibility(r);
                return (
                  <tr key={r.id} className={sel.has(r.id) ? 'bk-sel' : undefined}>
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
                    <td className="end"><Link href={`/studio/${r.id}`} className="manage">{t('manage')}</Link></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
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
