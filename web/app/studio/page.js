'use client';
// Studio → Mes conférences : chiffres clés, recherche, filtres et avancement des 4 étapes de traitement.
import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useApp } from '../../components/Providers';
import { langName } from '../../components/Transcript';
import BulkEdit from '../../components/BulkEdit';
import { talkSteps, talkKind, talkProgress, sourceLabel } from '../../lib/talkState';

const clock = (s) => {
  if (!s) return '';
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = String(Math.floor(s % 60)).padStart(2, '0');
  return h ? `${h}:${String(m).padStart(2, '0')}:${sec}` : `${m}:${sec}`;
};
const FILTERS = ['all', 'live', 'run', 'err', 'draft', 'review'];
// Le filtre « Brouillons » regroupe les brouillons et les conférences programmées.
const inFilter = (kind, f) => f === 'all' || kind === f || (f === 'draft' && kind === 'sched');

function Step({ letter, state, label, t }) {
  const mark = { ok: ' ✓', run: ' …', err: ' !', wait: '', none: '' }[state];
  return <span className={`step step-${state}`} title={`${label} : ${t('step_' + state)}`}>{letter}{mark}</span>;
}

export default function StudioTalks() {
  const { t, call, locale } = useApp();
  const [mine, setMine] = useState(null);
  const [q, setQ] = useState('');
  const [filter, setFilter] = useState('all');
  const [sel, setSel] = useState(() => new Set()); // conférences cochées (modification en lot)
  const [bulk, setBulk] = useState(false);
  const [flash, setFlash] = useState('');
  // Lien depuis le tableau de bord : /studio?filter=err ouvre directement le bon filtre.
  useEffect(() => { const f = new URLSearchParams(window.location.search).get('filter'); if (FILTERS.includes(f)) setFilter(f); }, []);
  const load = useCallback(() => call('/me/talks').then((r) => r.ok && setMine(r.data)), [call]);
  useEffect(() => { load(); }, [load]);

  const rows = useMemo(() => (mine || []).map((x) => {
    const steps = talkSteps(x);
    return { ...x, steps, kind: talkKind(x, steps), pct: talkProgress(steps) };
  }), [mine]);

  // Rafraîchissement automatique tant qu'un traitement est en cours.
  const running = rows.some((r) => r.kind === 'run');
  useEffect(() => {
    if (!running) return undefined;
    const id = setInterval(load, 6000);
    return () => clearInterval(id);
  }, [running, load]);

  const count = (k) => rows.filter((r) => inFilter(r.kind, k)).length;
  const needle = q.trim().toLowerCase();
  const shown = rows.filter((r) => inFilter(r.kind, filter)
    && (!needle || `${r.title} ${r.speaker}`.toLowerCase().includes(needle)));
  const allShown = shown.length > 0 && shown.every((r) => sel.has(r.id));
  const toggleAll = () => setSel((s0) => { const n = new Set(s0); if (allShown) shown.forEach((r) => n.delete(r.id)); else shown.forEach((r) => n.add(r.id)); return n; });
  const toggleOne = (id) => setSel((s0) => { const n = new Set(s0); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  const dateTime = (d) => new Date(d).toLocaleString(locale, { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
  const date = (d) => new Date(d).toLocaleDateString(locale, { day: 'numeric', month: 'short', year: 'numeric' });

  return (
    <main className="studio-page">
      <div className="studio-head">
        <h1 className="studio-title">{t('myTalks')}</h1>
        <Link href="/studio/new" className="btn">+ {t('newTalk')}</Link>
      </div>

      <div className="studio-stats">
        {[['live', t('kind_live')], ['run', t('kind_run')], ['err', t('kind_err')], ['draft', t('kind_draft')], ...(rows.some((r) => r.kind === 'review') ? [['review', t('kind_review')]] : [])].map(([k, label]) => (
          <button key={k} type="button" className={`stat stat-${k}`} onClick={() => setFilter(k)}>
            <strong>{mine ? count(k) : '…'}</strong><span>{label}</span>
          </button>
        ))}
      </div>

      <div className="studio-tools">
        <label className="studio-search">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden="true"><circle cx="11" cy="11" r="7" /><path d="M20 20l-3.5-3.5" /></svg>
          <span className="sr-only">{t('search')}</span>
          <input type="search" placeholder={t('studioSearch')} value={q} onChange={(e) => setQ(e.target.value)} />
        </label>
        <div className="pills" role="group" aria-label={t('filterBy')}>
          {FILTERS.map((k) => (
            <button key={k} type="button" aria-pressed={filter === k} className={filter === k ? 'pill on' : 'pill'} onClick={() => setFilter(k)}>
              {t('filter_' + k)}{k !== 'all' && mine ? ` (${count(k)})` : ''}
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
          <table className="studio-table">
            <thead>
              <tr>
                <th className="bk-col"><input type="checkbox" checked={allShown} onChange={toggleAll} aria-label={t('bkAll')} /></th><th>{t('colTalk')}</th><th>{t('colState')}</th><th>{t('colSteps')}</th><th>{t('access')}</th><th>{t('colAdded')}</th>
                <th><span className="sr-only">{t('colActions')}</span></th>
              </tr>
            </thead>
            <tbody>
              {shown.map((r) => (
                <tr key={r.id} className={sel.has(r.id) ? 'bk-sel' : undefined}>
                  <td className="bk-col"><input type="checkbox" checked={sel.has(r.id)} onChange={() => toggleOne(r.id)} aria-label={r.title} /></td>
                  <td>
                    <Link href={`/studio/${r.id}`} className="studio-talk">
                      <span className="studio-thumb" style={r.posterUrl ? { backgroundImage: `url(${r.posterUrl})` } : undefined}>
                        <span className="dur">{r.source !== 'upload' && !r.durationSeconds ? sourceLabel(r.source) : clock(r.durationSeconds)}</span>
                      </span>
                      <span className="studio-talk-text">
                        <b>{r.title}</b>
                        <small>{[r.speaker, langName(String(r.language || '').split('-')[0], locale), r.source !== 'upload' ? sourceLabel(r.source) : ''].filter(Boolean).join(' · ')}</small>
                      </span>
                    </Link>
                  </td>
                  <td>
                    <span className={`state state-${r.kind}`}>
                      <i aria-hidden="true" />{r.kind === 'review' ? t('state_review_' + r.reviewStatus) : t('state_' + r.kind)}{r.kind === 'run' && r.pct != null ? ` ${r.pct} %` : ''}
                    </span>
                    {r.kind === 'review' && r.reviewStatus === 'rejected' && (
                      <small className="muted review-note">{t('reviewReason')} : {r.reviewNote}{' '}
                        <button type="button" className="link u small" onClick={async () => { const x = await call(`/talks/${r.id}/review/submit`, { method: 'POST' }); if (x.ok) load(); }}>{t('reviewResubmit')}</button>
                      </small>
                    )}
                    {r.kind === 'sched' && <small className="muted sched-date">{t('scheduledFor').replace('{d}', dateTime(r.publishAt))}</small>}
                  </td>
                  <td>
                    <span className="steps" aria-label={t('colSteps')}>
                      <Step letter="V" state={r.steps.video} label={t('stepVideo')} t={t} />
                      <Step letter="T" state={r.steps.transcript} label={t('stepTranscript')} t={t} />
                      <Step letter="S" state={r.steps.subs} label={t('stepSubs')} t={t} />
                      <Step letter="R" state={r.steps.summary} label={t('stepSummary')} t={t} />
                    </span>
                  </td>
                  <td>{t(r.access)}</td>
                  <td className="muted">{date(r.created_at)}</td>
                  <td className="end"><Link href={`/studio/${r.id}`} className="manage">{t('manage')}</Link></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <p className="meta small">{t('stepsLegend')}</p>
    </main>
  );
}
