'use client';
// Studio → catégories proposées par l'IA, toutes vidéos confondues, à valider d'un clic. L'administrateur y trouve aussi le rattrapage
// (analyser les vidéos sans catégorie, par lots).
import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { Page as BmPage, Metrics as BmMetrics, Panel as BmPanel } from '../../../../components/backoffice/Kit';
import { useApp } from '../../../../components/Providers';
import { SuggestionRow } from '../../../../components/AutoCatSuggest';

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
    <section className="panel">
      <h2 className="panel-title">{t('acBackfillTitle')}</h2>
      <p className="meta small">{t('acBackfillHelp').replace('{b}', stats.batch)}</p>
      <p className="meta" role="status">{t('acBackfillStats').replace('{n}', stats.withoutCategory).replace('{p}', pending).replace('{d}', stats.drafts)}</p>
      <div className="qz-gen"><button className="btn" disabled={busy || stats.withoutCategory === 0} onClick={run}>{t('acBackfillBtn')}</button></div>
      {msg && <p className="ok-msg" role="status">{msg}</p>}
    </section>
  );
}

export default function SuggestionsReview() {
  const { t, call, skin, user } = useApp();
  const [items, setItems] = useState(null);
  const [applied, setApplied] = useState([]);
  const load = useCallback(() => call('/studio/categories-suggest/review').then((r) => { if (r.ok) { setItems(r.data.suggestions); setApplied(r.data.applied || []); } }), [call]);
  useEffect(() => { load(); }, [load]);
  // Validée ou refusée : elle quitte la file.
  const done = (s) => setItems((list) => list.filter((x) => x.id !== s.id));
  const undone = () => load();
  const appliedBlock = applied.length > 0 && (
    <section className="qz-list">
      <div className="qz-list-head"><h2 className="panel-title">{t('acAppliedTitle')} <span className="meta">({applied.length})</span></h2></div>
      <p className="meta small">{t('acAppliedIntro')}</p>
      {applied.map((x) => <div key={x.id}><p className="meta small"><Link className="link u" href={`/studio/${x.talkId}/content?tab=categories`}>{x.talkTitle}</Link></p><SuggestionRow s={x} t={t} call={call} onDone={undone} /></div>)}
    </section>
  );
  const groups = [];
  for (const x of items || []) {
    const g = groups.find((y) => y.talkId === x.talkId);
    if (g) g.items.push(x); else groups.push({ talkId: x.talkId, title: x.talkTitle, items: [x] });
  }
  const body = groups.map((g) => (
    <section key={g.talkId} className="qz-list">
      <div className="qz-list-head">
        <h2 className="panel-title">{g.title} <span className="meta">({g.items.length})</span></h2>
        <Link className="link u" href={`/studio/${g.talkId}/content?tab=categories`}>{t('acOpenTab')}</Link>
      </div>
      {g.items.map((x) => <SuggestionRow key={x.id} s={x} t={t} call={call} onDone={done} />)}
    </section>
  ));
  const admin = user?.role === 'admin';
  if (skin === 'premium') {
    return (
      <main className="studio-page">
        <BmPage title={t('acReviewTitle')} sub={t('acReviewIntro')}>
          {items !== null && <BmMetrics cols="three" items={[
            { icon: 'clipboard', tone: 'amber', label: t('acReviewTitle'), value: items.length },
            { icon: 'video', label: t('colTalk'), value: groups.length },
          ]} />}
          {admin && <BmPanel title={t('acBackfillTitle')}><div style={{ padding: '0 18px 18px' }}><Backfill t={t} call={call} onQueued={load} /></div></BmPanel>}
          {items === null && <p className="meta">…</p>}
          {items && items.length === 0 && <BmPanel title={t('acReviewTitle')}><p className="meta" style={{ padding: '0 18px 18px' }}>{t('acReviewEmpty')}</p></BmPanel>}
          {appliedBlock && <BmPanel title={t('acAppliedTitle')}><div style={{ padding: '0 18px 18px', display: 'grid', gap: 12 }}>{appliedBlock}</div></BmPanel>}
          {groups.map((g) => (
            <BmPanel key={g.talkId} title={g.title} extra={<Link href={`/studio/${g.talkId}/content?tab=categories`}>{t('acOpenTab')}</Link>}>
              <div className="bm-form" style={{ padding: '0 18px 18px', display: 'grid', gap: 12 }}>
                {g.items.map((x) => <SuggestionRow key={x.id} s={x} t={t} call={call} onDone={done} />)}
              </div>
            </BmPanel>
          ))}
        </BmPage>
      </main>
    );
  }
  return (
    <main className="studio-page studio-narrow">
      <h1 className="studio-title">{t('acReviewTitle')}</h1>
      <p className="meta">{t('acReviewIntro')}</p>
      {admin && <Backfill t={t} call={call} onQueued={load} />}
      {items === null && <p className="meta">…</p>}
      {items && items.length === 0 && <p className="soon">{t('acReviewEmpty')}</p>}
      {body}
      {appliedBlock}
    </main>
  );
}
