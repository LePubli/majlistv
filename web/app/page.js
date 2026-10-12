'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useApp } from '../components/Providers';
import TalkCard from '../components/TalkCard';
import SearchHit from '../components/SearchHit';

export default function Home() {
  const { t, trialDays, user, call } = useApp();
  const [talks, setTalks] = useState(null);
  const [res, setRes] = useState(null); // résultats de recherche (avec extraits et passages)
  const [cats, setCats] = useState([]);
  const [q, setQ] = useState('');
  const [cat, setCat] = useState('');
  const [cont, setCont] = useState([]);

  useEffect(() => { call('/categories', {}, null).then((r) => r.ok && setCats(r.data)); }, [call]);

  useEffect(() => { if (user) call('/me/continue').then((r) => setCont(r.ok ? r.data : [])); else setCont([]); }, [user, call]);

  // Catalogue sans mot-clé ; avec mot-clé, recherche plein texte (/search) avec un léger délai pendant la frappe.
  useEffect(() => {
    const timer = setTimeout(() => {
      const p = new URLSearchParams();
      if (cat) p.set('category', cat);
      if (q.trim()) {
        p.set('q', q.trim());
        call('/search?' + p).then((r) => setRes(r.ok ? r.data : { hits: [], total: 0 }));
      } else {
        setRes(null);
        call('/talks?' + p, {}, null).then((r) => setTalks(r.ok ? r.data : []));
      }
    }, 250);
    return () => clearTimeout(timer);
  }, [q, cat, call]);

  return (
    <>
      <section className="hero">
        <p className="eyebrow">{t('heroEyebrow')}</p>
        <h1>{t('heroTitle')}</h1>
        <p>{t('heroText')}</p>
        <div className="hero-cta">
          {!user && <Link href="/register" className="btn btn-lg">{trialDays > 0 ? t('heroCta') : t('register')}</Link>}
          <Link href="/pricing" className="btn ghost btn-lg">{t('pricing')}</Link>
        </div>
        {!user && trialDays > 0 && <p className="hero-note">{t('heroNote').replace('{n}', trialDays)}</p>}
      </section>
      {cont.length > 0 && !q && !cat && (
        <section className="continue">
          <h2>{t('continueWatching')} · <Link href="/library">{t('library')}</Link></h2>
          <div className="grid">{cont.slice(0, 4).map((x) => <TalkCard key={x.id} talk={x} t={t} progress={x.durationMs ? x.positionMs / x.durationMs : 0} />)}</div>
        </section>
      )}
      <div className="filters">
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder={t('search')} />
        <select value={cat} onChange={(e) => setCat(e.target.value)}>
          <option value="">{t('allCategories')}</option>
          {cats.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
      </div>
      {res ? (
        <section className="results">
          <p className="meta">{res.total ? t('nResults').replace('{n}', res.total) : t('noResults')}</p>
          {res.hits.map((h) => <SearchHit key={h.id} hit={h} t={t} markers={res.markers} />)}
        </section>
      ) : (
        <>
          {talks && talks.length === 0 && <p className="soon">{t('noTalks')}</p>}
          <div className="grid">{(talks || []).map((x) => <TalkCard key={x.id} talk={x} t={t} />)}</div>
        </>
      )}
    </>
  );
}
