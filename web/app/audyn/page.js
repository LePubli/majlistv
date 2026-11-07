'use client';
// Audyn : livres audio (liste, recherche, catégories). Même contenu que l'application.
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useApp } from '../../components/Providers';
import { fmtLong } from '../../lib/audyn';

export default function AudynHome() {
  const { t, call, feat } = useApp();
  const [d, setD] = useState(null);
  const [q, setQ] = useState('');
  const [cat, setCat] = useState('');
  useEffect(() => {
    const h = setTimeout(() => {
      const qs = new URLSearchParams(); if (q.trim()) qs.set('q', q.trim()); if (cat) qs.set('category', cat);
      call(`/audyn${qs.toString() ? `?${qs}` : ''}`).then((r) => setD(r.ok ? r.data : { items: [], categories: [], off: true }));
    }, 300);
    return () => clearTimeout(h);
  }, [q, cat, call]);
  if (!feat('audyn')) return <main className="page"><p className="meta">{t('awOff')}</p></main>;
  return (
    <main className="page aw-page">
      <h1>{t('awTitle')}</h1>
      <p className="meta">{t('awIntro')}</p>
      <input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder={t('awSearch')} aria-label={t('awSearch')} maxLength={80} className="aw-search" />
      {d && d.categories.length > 0 && (
        <div className="aw-cats">
          <button type="button" className={`chip${cat === '' ? ' on' : ''}`} onClick={() => setCat('')}>{t('awAll')}</button>
          {d.categories.map((c) => <button key={c} type="button" className={`chip${cat === c ? ' on' : ''}`} onClick={() => setCat(c)}>{c}</button>)}
        </div>
      )}
      {!d ? <p className="meta">…</p> : d.items.length === 0 ? <p className="meta">{t('awEmpty')}</p> : (
        <ul className="aw-list">
          {d.items.map((b) => (
            <li key={b.id}>
              <Link href={`/audyn/${b.id}`} className="aw-card">
                {b.coverUrl ? <img src={b.coverUrl} alt="" width="96" height="96" loading="lazy" /> : <span className="aw-ph" aria-hidden="true">🎧</span>}
                <span className="aw-info">
                  <strong>{b.title}</strong>
                  {(b.narrator || b.author) && <span>{b.narrator ? t('awBy').replace('{name}', b.narrator) : b.author}</span>}
                  <span className="meta">{b.chapters === 1 ? t('awChapter1') : t('awChapters').replace('{n}', b.chapters)} · {fmtLong(b.durationSeconds)}</span>
                  <span className={b.full ? 'aw-tag on' : 'aw-tag'}>{b.full ? t('awListen') : t('awFree')}</span>
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
