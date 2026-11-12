'use client';
// Audyn : livres audio (liste, recherche, catégories). Même contenu que l'application.
// « Continuer l'écoute » : les livres commencés sur cet appareil (position gardée par le lecteur), les plus récents d'abord.
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useApp } from '../../components/Providers';
import { useAudyn } from '../../components/AudynPlayer';
import { continueCandidates, fmtLong, listenState } from '../../lib/audyn';

export default function AudynHome() {
  const { t, call, feat } = useApp();
  const [d, setD] = useState(null);
  const [q, setQ] = useState('');
  const [cat, setCat] = useState('');
  const [cont, setCont] = useState([]); // [{ book, st }]
  const au = useAudyn();
  const router = useRouter();
  useEffect(() => {
    const h = setTimeout(() => {
      const qs = new URLSearchParams(); if (q.trim()) qs.set('q', q.trim()); if (cat) qs.set('category', cat);
      call(`/audyn${qs.toString() ? `?${qs}` : ''}`).then((r) => setD(r.ok ? r.data : { items: [], categories: [], off: true }));
    }, 300);
    return () => clearTimeout(h);
  }, [q, cat, call]);
  // Rangée « Continuer l'écoute » : seulement sur la liste complète (sans recherche ni catégorie).
  const full = Boolean(d && !d.off && !q.trim() && !cat);
  useEffect(() => {
    if (!full) return undefined;
    let alive = true;
    const picks = continueCandidates(d.items, au.savedFor);
    Promise.all(picks.map(async ({ item, saved }) => {
      const r = await call(`/audyn/${item.id}`);
      const st = r.ok ? listenState(r.data.chapters, saved) : null;
      return st ? { book: r.data, st } : null;
    })).then((rows) => { if (alive) setCont(rows.filter(Boolean)); });
    return () => { alive = false; };
  }, [full, d, call]); // eslint-disable-line react-hooks/exhaustive-deps
  const resume = async (book) => { await au.openResume(book); router.push(`/audyn/${book.id}`); };
  if (!feat('audyn')) return <main className="page"><p className="meta">{t('awOff')}</p></main>;
  return (
    <main className="page aw-page">
      <h1>{t('awTitle')}</h1>
      <p className="meta">{t('awIntro')}</p>
      <input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder={t('awSearch')} aria-label={t('awSearch')} maxLength={80} className="aw-search" />
      {full && cont.length > 0 && (
        <section className="aw-cont" aria-label={t('awContinue')}>
          <h2 className="aw-h2">{t('awContinue')}</h2>
          <ul className="aw-cont-row">
            {cont.map(({ book, st }) => (
              <li key={book.id} className="aw-cont-card">
                <Link href={`/audyn/${book.id}`} className="aw-cont-link">
                  {book.coverUrl ? <img src={book.coverUrl} alt="" width="120" height="120" loading="lazy" /> : <span className="aw-ph" aria-hidden="true">🎧</span>}
                  <strong>{book.title}</strong>
                </Link>
                <span className="meta small">{t('awChapterOf').replace('{i}', st.index + 1).replace('{n}', st.count)} · {t('awLeft').replace('{t}', fmtLong(st.left))}</span>
                <span className="aw-bar" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(st.pct * 100)} aria-label={t('awListenBar')}><i style={{ width: `${Math.round(st.pct * 100)}%` }} /></span>
                <button type="button" className="btn sm" onClick={() => resume(book)}>▶ {t('awResume')}</button>
              </li>
            ))}
          </ul>
        </section>
      )}
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
