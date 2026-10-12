'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useApp } from '../components/Providers';
import TalkCard from '../components/TalkCard';

export default function Home() {
  const { t, appName, user, call } = useApp();
  const [talks, setTalks] = useState(null);
  const [cats, setCats] = useState([]);
  const [q, setQ] = useState('');
  const [cat, setCat] = useState('');
  const [cont, setCont] = useState([]);

  useEffect(() => { call('/categories', {}, null).then((r) => r.ok && setCats(r.data)); }, [call]);

  useEffect(() => { if (user) call('/me/continue').then((r) => setCont(r.ok ? r.data : [])); else setCont([]); }, [user, call]);

  // Recherche avec un léger délai pendant la frappe.
  useEffect(() => {
    const timer = setTimeout(() => {
      const p = new URLSearchParams();
      if (q) p.set('q', q);
      if (cat) p.set('category', cat);
      call('/talks?' + p, {}, null).then((r) => setTalks(r.ok ? r.data : []));
    }, 250);
    return () => clearTimeout(timer);
  }, [q, cat, call]);

  return (
    <>
      <section className="hero">
        <h1>{appName}</h1>
        <p>{t('tagline')}</p>
        {!user && <Link href="/register" className="btn">{t('register')}</Link>}
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
      {talks && talks.length === 0 && <p className="soon">{t('noTalks')}</p>}
      <div className="grid">{(talks || []).map((x) => <TalkCard key={x.id} talk={x} t={t} />)}</div>
    </>
  );
}
