'use client';
// Studio → file de relecture : toutes les questions de quiz en attente de validation, toutes conférences confondues.
import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useApp } from '../../../../components/Providers';
import QuizQuestion from '../../../../components/QuizQuestion';

export default function ReviewQueue() {
  const { t, call } = useApp();
  const [qs, setQs] = useState(null);
  const load = useCallback(() => call('/studio/quiz/review').then((r) => r.ok && setQs(r.data.questions)), [call]);
  useEffect(() => { load(); }, [load]);

  // Question validée / refusée / supprimée : elle quitte la file ; modifiée restée brouillon : on la met à jour sur place.
  const update = (id, next) => setQs((list) => list.flatMap((q) => (q.id !== id ? [q] : next && next.status === 'draft' ? [{ ...next, talkTitle: q.talkTitle }] : [])));
  const groups = [];
  for (const q of qs || []) {
    const g = groups.find((x) => x.talkId === q.talkId);
    if (g) g.items.push(q); else groups.push({ talkId: q.talkId, title: q.talkTitle, items: [q] });
  }

  return (
    <main className="studio-page studio-narrow">
      <h1 className="studio-title">{t('qzReviewTitle')}</h1>
      <p className="meta">{t('qzReviewIntro')}</p>
      {qs === null && <p className="meta">…</p>}
      {qs && qs.length === 0 && <p className="soon">{t('qzReviewEmpty')}</p>}
      {groups.map((g) => (
        <section key={g.talkId} className="qz-list">
          <div className="qz-list-head">
            <h2 className="panel-title">{g.title} <span className="meta">({g.items.length})</span></h2>
            <Link className="link u" href={`/studio/${g.talkId}/content?tab=quiz`}>{t('qzOpenQuiz')}</Link>
          </div>
          {g.items.map((q) => <QuizQuestion key={q.id} q={q} t={t} call={call} onChange={(n) => update(q.id, n)} />)}
        </section>
      ))}
    </main>
  );
}
