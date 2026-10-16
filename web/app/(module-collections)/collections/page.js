'use client';
// Étape 19 — Collections éditoriales : cycles, séries d'un intervenant, thèmes du moment.
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useApp } from '../../../components/Providers';

export default function CollectionsPage() {
  const { t, call } = useApp();
  const [list, setList] = useState(null);
  useEffect(() => { call('/collections', {}, null).then((r) => setList(r.ok ? r.data : [])); }, [call]);
  return (
    <main className="page">
      <section className="series-listhead"><h1>{t('colTitle')}</h1><p className="meta">{t('colIntro')}</p></section>
      {list && list.length === 0 && <p className="soon">{t('colNone')}</p>}
      <ul className="col-grid">
        {(list || []).map((c) => (
          <li key={c.id}>
            <Link href={`/collections/${c.id}`} className="col-card">
              <span className="col-thumb" style={c.posterUrl ? { backgroundImage: `url(${c.posterUrl})` } : undefined} aria-hidden="true" />
              <span className="col-body">
                <span className="meta small">{t(`colKind_${c.kind}`)}{c.pinned ? ` · ${t('colPinned')}` : ''}</span>
                <b>{c.title}</b>
                {c.description && <span className="th-desc">{c.description}</span>}
                <span className="meta small">{t('thTalksN').replace('{n}', c.talks)}</span>
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </main>
  );
}
