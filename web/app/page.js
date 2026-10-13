'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useApp } from '../components/Providers';
import TalkCard from '../components/TalkCard';
import SearchHit from '../components/SearchHit';
import HomeHero from '../components/HomeHero';
import Row from '../components/Row';
import SeriesCard from '../components/SeriesCard';

export default function Home() {
  const { t, trialDays, user, ready, call } = useApp();
  const [home, setHome] = useState(null);   // { hero, rows } : accueil vitrine
  const [talks, setTalks] = useState(null); // grille quand une catégorie est choisie
  const [res, setRes] = useState(null);     // résultats de recherche (avec extraits et passages)
  const [cats, setCats] = useState([]);
  const [q, setQ] = useState('');
  const [cat, setCat] = useState('');
  const [cont, setCont] = useState([]);

  useEffect(() => { call('/categories', {}, null).then((r) => r.ok && setCats(r.data)); }, [call]);
  // Avec le jeton du compte, l'accueil met en premier les thèmes préférés (« Pour vous »).
  useEffect(() => { if (ready) call('/home').then((r) => setHome(r.ok ? r.data : { hero: { mode: 'text' }, rows: [] })); }, [call, ready]);
  useEffect(() => { if (user) call('/me/continue').then((r) => setCont(r.ok ? r.data : [])); else setCont([]); }, [user, call]);

  // Mot-clé : recherche plein texte (/search) ; catégorie seule : grille filtrée ; sinon rangées de l'accueil.
  useEffect(() => {
    const timer = setTimeout(() => {
      const p = new URLSearchParams();
      if (cat) p.set('category', cat);
      if (q.trim()) {
        p.set('q', q.trim());
        call('/search?' + p).then((r) => setRes(r.ok ? r.data : { hits: [], total: 0 }));
      } else if (cat) {
        setRes(null);
        call('/talks?' + p, {}, null).then((r) => setTalks(r.ok ? r.data : []));
      } else {
        setRes(null); setTalks(null);
      }
    }, 250);
    return () => clearTimeout(timer);
  }, [q, cat, call]);

  const browsing = !q.trim() && !cat; // accueil vitrine (pas de recherche ni de filtre)
  const rows = home?.rows || [];
  return (
    <>
      {browsing && <HomeHero hero={home?.hero} t={t} user={user} trialDays={trialDays} />}
      <div className="filters">
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder={t('search')} aria-label={t('search')} />
        <select value={cat} onChange={(e) => setCat(e.target.value)} aria-label={t('allCategories')}>
          <option value="">{t('allCategories')}</option>
          {cats.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
      </div>
      {res ? (
        <section className="results">
          <p className="meta">{res.total ? t('nResults').replace('{n}', res.total) : t('noResults')}</p>
          {res.hits.map((h) => <SearchHit key={h.id} hit={h} t={t} markers={res.markers} />)}
        </section>
      ) : cat ? (
        <>
          {talks && talks.length === 0 && <p className="soon">{t('noTalks')}</p>}
          <div className="grid">{(talks || []).map((x) => <TalkCard key={x.id} talk={x} t={t} />)}</div>
        </>
      ) : (
        <>
          {cont.length > 0 && <Row id="row-continue" title={<>{t('continueWatching')} · <Link href="/library">{t('library')}</Link></>} talks={cont} t={t} progressOf={(x) => (x.durationMs ? x.positionMs / x.durationMs : 0)} />}
          {home && rows.length === 0 && <p className="soon">{t('noTalks')}</p>}
          {rows.map((r) => (r.key === 'series' ? (
            <Row key="series" id="row-series" title={<>{t('rowSeries')} · <Link href="/series">{t('rowSeeAll')}</Link></>} talks={r.series} t={t} renderItem={(x) => <SeriesCard series={x} t={t} />} />
          ) : (
            <Row key={r.key} id={`row-${r.key.replace(':', '-')}`} title={r.key === 'new' ? t('rowNew') : r.title} talks={r.talks} t={t} badge={r.forYou ? `★ ${t('forYou')}` : null}
              onSeeAll={r.categoryId && r.total > r.talks.length ? () => { setCat(String(r.categoryId)); window.scrollTo({ top: 0 }); } : undefined} />
          )))}
        </>
      )}
    </>
  );
}
