'use client';
// Studio → file de relecture : toutes les propositions d'action en attente de validation, toutes vidéos confondues.
import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { Page as BmPage, Metrics as BmMetrics, Panel as BmPanel } from '../../../../components/backoffice/Kit';
import { useApp } from '../../../../components/Providers';
import PracticeSuggestion from '../../../../components/PracticeSuggestion';

export default function PracticeReview() {
  const { t, call, skin } = useApp();
  const [items, setItems] = useState(null);
  const load = useCallback(() => call('/studio/practice/review').then((r) => r.ok && setItems(r.data.suggestions)), [call]);
  useEffect(() => { load(); }, [load]);
  // Validée / refusée / supprimée : elle quitte la file ; modifiée restée brouillon : mise à jour sur place.
  const update = (id, next) => setItems((list) => list.flatMap((s) => (s.id !== id ? [s] : next && next.status === 'draft' ? [{ ...next, talkTitle: s.talkTitle }] : [])));
  const groups = [];
  for (const s of items || []) {
    const g = groups.find((x) => x.talkId === s.talkId);
    if (g) g.items.push(s); else groups.push({ talkId: s.talkId, title: s.talkTitle, items: [s] });
  }
  if (skin === 'premium') {
    return (
      <main className="studio-page">
        <BmPage title={t('pzReviewTitle')} sub={t('pzReviewIntro')}>
          {items !== null && <BmMetrics cols="three" items={[
            { icon: 'clipboard', tone: 'amber', label: t('pzReviewTitle'), value: items.length },
            { icon: 'video', label: t('colTalk'), value: groups.length },
          ]} />}
          {items === null && <p className="meta">…</p>}
          {items && items.length === 0 && <BmPanel title={t('pzReviewTitle')}><p className="meta" style={{ padding: '0 18px 18px' }}>{t('pzReviewEmpty')}</p></BmPanel>}
          {groups.map((g) => (
            <BmPanel key={g.talkId} title={g.title} extra={<Link href={`/studio/${g.talkId}/content?tab=practice`}>{t('pzOpenTab')}</Link>}>
              <div className="bm-form" style={{ padding: '0 18px 18px', display: 'grid', gap: 12 }}>
                {g.items.map((x) => <PracticeSuggestion key={x.id} s={x} t={t} call={call} onChange={(n) => update(x.id, n)} />)}
              </div>
            </BmPanel>
          ))}
        </BmPage>
      </main>
    );
  }
  return (
    <main className="studio-page studio-narrow">
      <h1 className="studio-title">{t('pzReviewTitle')}</h1>
      <p className="meta">{t('pzReviewIntro')}</p>
      {items === null && <p className="meta">…</p>}
      {items && items.length === 0 && <p className="soon">{t('pzReviewEmpty')}</p>}
      {groups.map((g) => (
        <section key={g.talkId} className="qz-list">
          <div className="qz-list-head">
            <h2 className="panel-title">{g.title} <span className="meta">({g.items.length})</span></h2>
            <Link className="link u" href={`/studio/${g.talkId}/content?tab=practice`}>{t('pzOpenTab')}</Link>
          </div>
          {g.items.map((s) => <PracticeSuggestion key={s.id} s={s} t={t} call={call} onChange={(n) => update(s.id, n)} />)}
        </section>
      ))}
    </main>
  );
}
