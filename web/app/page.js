'use client';
import { Fragment, useEffect, useState } from 'react';
import Link from 'next/link';
import { useApp } from '../components/Providers';
import TalkCard from '../components/TalkCard';
import HomeHero from '../components/HomeHero';
import Row from '../components/Row';
import SeriesCard from '../components/SeriesCard';
import CitationCard from '../components/CitationCard';
import Vitrine from '../components/Vitrine';
import { KidsBand } from '../components/KidsBanner';

// Première rangée de conférences de l'accueil (nouveautés) : elle sert de « Dernières conférences » sous la vitrine.
const rows0 = (home) => (home?.rows || []).find((r) => r.talks)?.talks || [];

export default function Home() {
  const { t, trialDays, user, ready, call, feat } = useApp();
  const [home, setHome] = useState(null);   // { hero, rows } : accueil vitrine
  const [talks, setTalks] = useState(null); // grille quand une catégorie est choisie
  const [cats, setCats] = useState([]);
  const [cat, setCat] = useState('');
  const [cont, setCont] = useState([]);
  const [cit, setCit] = useState(null); // citation du jour (verset ou hadith), la même pour tous
  const [kids, setKids] = useState(null); // bande « Espace Kids » : dernières conférences Kids
  useEffect(() => { call('/home/kids', {}, null).then((r) => setKids(r.ok ? r.data : null)); }, [call]);
  useEffect(() => { call('/citation/today', {}, null).then((r) => setCit(r.ok ? r.data : null)); }, [call]);

  useEffect(() => { call('/categories', {}, null).then((r) => r.ok && setCats(r.data)); }, [call]);
  // Avec le jeton du compte, l'accueil met en premier les thèmes préférés (« Pour vous »).
  useEffect(() => { if (ready) call('/home').then((r) => setHome(r.ok ? r.data : { hero: { mode: 'text' }, rows: [] })); }, [call, ready]);
  useEffect(() => { if (user) call('/me/continue').then((r) => setCont(r.ok ? r.data : [])); else setCont([]); }, [user, call]);
  const [quizTodo, setQuizTodo] = useState([]);
  const [review, setReview] = useState([]); // « À réviser aujourd'hui » (Apprentissage ; 403 sinon)
  useEffect(() => { if (user) call('/me/revision').then((r) => setReview(r.ok ? r.data.items : [])); else setReview([]); }, [user, call]);
  useEffect(() => { if (user) call('/me/quiz/todo').then((r) => setQuizTodo(r.ok ? r.data : [])); else setQuizTodo([]); }, [user, call]);

  // Catégorie choisie (« Tout voir » d'une rangée) : grille filtrée. La recherche par mot-clé est dans la loupe du header.
  useEffect(() => {
    if (!cat) { setTalks(null); return; }
    call('/talks?' + new URLSearchParams({ category: cat }), {}, null).then((r) => setTalks(r.ok ? r.data : []));
  }, [cat, call]);

  // Visiteur non connecté : la vitrine (méthode, exemple, tarifs). Invisible (mais présente dans la page) le temps de connaître la session.
  if (!user && !cat && feat('showcase')) {
    const latest = rows0(home);
    return <Vitrine cit={cit} latest={latest} wait={!ready} />;
  }
  const browsing = !cat; // accueil vitrine (pas de filtre)
  const catName = cats.find((c) => String(c.id) === cat);
  const rows = home?.rows || [];
  return (
    <>
      {browsing && <HomeHero hero={home?.hero} t={t} user={user} trialDays={trialDays} />}
      {cat ? (
        <>
          <div className="cat-bar">
            <button type="button" className="btn ghost" onClick={() => setCat('')}>← {t('home')}</button>
            <h1>{catName ? (catName.fullName || catName.name) : ''}</h1>
          </div>
          {talks && talks.length === 0 && <p className="soon">{t('noTalks')}</p>}
          <div className="grid">{(talks || []).map((x) => <TalkCard key={x.id} talk={x} t={t} />)}</div>
        </>
      ) : (
        <>
          {review.length > 0 && <Row id="row-review" title={<>{t('revRow')} · <Link href="/learning">{t('lrTitle')}</Link></>} talks={review} t={t} />}
          {quizTodo.length > 0 && <Row id="row-quiz" title={<>{t('qpTodoRow')} · <Link href="/library">{t('library')}</Link></>} talks={quizTodo} t={t} />}
          {cont.length > 0 && <Row id="row-continue" title={<>{t('continueWatching')} · <Link href="/library">{t('library')}</Link></>} talks={cont} t={t} progressOf={(x) => (x.durationMs ? x.positionMs / x.durationMs : 0)} />}
          {home && rows.length === 0 && <p className="soon">{t('noTalks')}</p>}
          {rows.map((r, i) => (
            <Fragment key={r.key}>
              {r.key === 'series' ? (
                <Row id="row-series" title={<>{t('rowSeries')} · <Link href="/series">{t('rowSeeAll')}</Link></>} talks={r.series} t={t} renderItem={(x) => <SeriesCard series={x} t={t} />} />
              ) : (
                <Row id={`row-${r.key.replace(':', '-')}`} talks={r.talks} t={t} badge={r.forYou ? `★ ${t('forYou')}` : null}
                  title={r.key === 'new' ? t('rowNew') : r.key === 'beginner' ? t('rowBeginner') : r.title}
                  onSeeAll={r.categoryId && r.total > r.talks.length ? () => { setCat(String(r.categoryId)); window.scrollTo({ top: 0 }); } : undefined} />
              )}
              {i === 0 && <KidsBand data={kids} />}
            </Fragment>
          ))}
          {rows.length === 0 && <KidsBand data={kids} />}
          <CitationCard c={cit} t={t} framed />
        </>
      )}
    </>
  );
}
