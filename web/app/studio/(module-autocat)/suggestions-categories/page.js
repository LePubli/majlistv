'use client';
// Studio → catégories proposées par l'IA, toutes vidéos confondues, à valider d'un clic. L'administrateur y trouve aussi le rattrapage
// (analyser les vidéos sans catégorie, par lots).
import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { Page as BmPage, Metrics as BmMetrics, Panel as BmPanel } from '../../../../components/backoffice/Kit';
import { useApp } from '../../../../components/Providers';
import AutoCatReview from '../../../../components/AutoCatReview';

function Backfill({ t, call, onQueued }) {
  const [stats, setStats] = useState(null);
  const [msg, setMsg] = useState('');
  const [busy, setBusy] = useState(false);
  const load = useCallback(() => call('/admin/categories-suggest/stats').then((r) => r.ok && setStats(r.data)), [call]);
  useEffect(() => { load(); }, [load]);
  if (!stats) return null;
  const run = async () => {
    setBusy(true); setMsg('');
    const r = await call('/admin/categories-suggest/backfill', { method: 'POST' });
    setBusy(false);
    if (r.ok) { setMsg(t('acBackfillDone').replace('{n}', r.data.queued)); load(); onQueued(); } else setMsg(r.data?.error || t('acError'));
  };
  const pending = (stats.jobs.pending || 0) + (stats.jobs.processing || 0);
  return (
    <details className="panel" style={{ padding: '10px 14px' }}>
      <summary><b>{t('acBackfillTitle')}</b> <span className="meta small">— {t('acBackfillStats').replace('{n}', stats.withoutCategory).replace('{p}', pending).replace('{d}', stats.drafts)}</span></summary>
      <p className="meta small">{t('acBackfillHelp').replace('{b}', stats.batch)}</p>
      <div className="qz-gen"><button className="btn" disabled={busy || stats.withoutCategory === 0} onClick={run}>{t('acBackfillBtn')}</button></div>
      {msg && <p className="ok-msg" role="status">{msg}</p>}
    </details>
  );
}

export default function SuggestionsReview() {
  const { t, call, skin, user } = useApp();
  const [items, setItems] = useState(null);
  const [applied, setApplied] = useState([]);
  const load = useCallback(() => call('/studio/categories-suggest/review').then((r) => { if (r.ok) { setItems(r.data.suggestions); setApplied(r.data.applied || []); } }), [call]);
  useEffect(() => { load(); }, [load]);
  const admin = user?.role === 'admin';
  const talks = new Set((items || []).map((x) => x.talkId)).size;
  const list = items === null ? <p className="meta">…</p> : items.length === 0 && applied.length === 0
    ? <p className="soon">{t('acReviewEmpty')}</p>
    : <AutoCatReview items={items} applied={applied} t={t} call={call} reload={load} />;
  if (skin === 'premium') {
    return (
      <main className="studio-page">
        <BmPage title={t('acReviewTitle')} sub={t('acReviewIntro')}>
          {items !== null && <BmMetrics cols="three" items={[
            { icon: 'clipboard', tone: 'amber', label: t('acReviewTitle'), value: items.length },
            { icon: 'video', label: t('colTalk'), value: talks },
            { icon: 'check', tone: 'green', label: t('acAppliedTitle'), value: applied.length },
          ]} />}
          {admin && <Backfill t={t} call={call} onQueued={load} />}
          {list}
        </BmPage>
      </main>
    );
  }
  return (
    <main className="studio-page studio-narrow">
      <h1 className="studio-title">{t('acReviewTitle')}</h1>
      <p className="meta">{t('acReviewIntro')}</p>
      {admin && <Backfill t={t} call={call} onQueued={load} />}
      {list}
    </main>
  );
}
