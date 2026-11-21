'use client';
// Studio → file de relecture : toutes les références (versets, hadiths) en attente de validation, toutes vidéos confondues.
import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { Page as BmPage, Metrics as BmMetrics, Panel as BmPanel } from '../../../../components/backoffice/Kit';
import { useApp } from '../../../../components/Providers';
import ReferenceCard from '../../../../components/ReferenceCard';

export default function ReferencesReview() {
  const { t, call, skin } = useApp();
  const [items, setItems] = useState(null);
  const load = useCallback(() => call('/studio/references/review').then((r) => r.ok && setItems(r.data.references)), [call]);
  useEffect(() => { load(); }, [load]);
  // Validée / refusée / supprimée : elle quitte la file ; modifiée restée brouillon : mise à jour sur place.
  const update = (id, next) => setItems((list) => list.flatMap((x) => (x.id !== id ? [x] : next && next.status === 'draft' ? [{ ...next, talkTitle: x.talkTitle }] : [])));
  const groups = [];
  for (const x of items || []) {
    const g = groups.find((y) => y.talkId === x.talkId);
    if (g) g.items.push(x); else groups.push({ talkId: x.talkId, title: x.talkTitle, items: [x] });
  }
  if (skin === 'premium') {
    return (
      <main className="studio-page">
        <BmPage title={t('rfReviewTitle')} sub={t('rfReviewIntro')}>
          {items !== null && <BmMetrics cols="three" items={[
            { icon: 'clipboard', tone: 'amber', label: t('rfReviewTitle'), value: items.length },
            { icon: 'video', label: t('colTalk'), value: groups.length },
          ]} />}
          {items === null && <p className="meta">…</p>}
          {items && items.length === 0 && <BmPanel title={t('rfReviewTitle')}><p className="meta" style={{ padding: '0 18px 18px' }}>{t('rfReviewEmpty')}</p></BmPanel>}
          {groups.map((g) => (
            <BmPanel key={g.talkId} title={g.title} extra={<Link href={`/studio/${g.talkId}/content?tab=references`}>{t('rfOpenTab')}</Link>}>
              <div className="bm-form" style={{ padding: '0 18px 18px', display: 'grid', gap: 12 }}>
                {g.items.map((x) => <ReferenceCard key={x.id} r={{ ...x, talkTitle: undefined }} t={t} call={call} onChange={(n) => update(x.id, n)} />)}
              </div>
            </BmPanel>
          ))}
        </BmPage>
      </main>
    );
  }
  return (
    <main className="studio-page studio-narrow">
      <h1 className="studio-title">{t('rfReviewTitle')}</h1>
      <p className="meta">{t('rfReviewIntro')}</p>
      {items === null && <p className="meta">…</p>}
      {items && items.length === 0 && <p className="soon">{t('rfReviewEmpty')}</p>}
      {groups.map((g) => (
        <section key={g.talkId} className="qz-list">
          <div className="qz-list-head">
            <h2 className="panel-title">{g.title} <span className="meta">({g.items.length})</span></h2>
            <Link className="link u" href={`/studio/${g.talkId}/content?tab=references`}>{t('rfOpenTab')}</Link>
          </div>
          {g.items.map((x) => <ReferenceCard key={x.id} r={{ ...x, talkTitle: undefined }} t={t} call={call} onChange={(n) => update(x.id, n)} />)}
        </section>
      ))}
    </main>
  );
}
