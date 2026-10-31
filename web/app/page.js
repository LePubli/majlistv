'use client';
import { Fragment, Suspense, useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useApp } from '../components/Providers';
import TalkCard from '../components/TalkCard';
import HomeHero from '../components/HomeHero';
import Row from '../components/Row';
import SeriesCard from '../components/SeriesCard';
import CitationCard from '../components/CitationCard';
import Vitrine from '../components/Vitrine';
import { KidsBand } from '../components/KidsBanner';
import { HomeBlocks } from '../components/PageBlocks';
import FormatTiles from '../components/FormatTiles';
import SeasonBand from '../components/SeasonBand';

// Première rangée de conférences de l'accueil (nouveautés) : elle sert de « Dernières conférences » sous la vitrine.
const rows0 = (home) => (home?.rows || []).find((r) => r.talks)?.talks || [];

export default function Home() {
  return <Suspense fallback={null}><HomeInner /></Suspense>; // useSearchParams (?cat=…) demande une limite Suspense
}

function HomeInner() {
  const { t, trialDays, user, ready, call, feat } = useApp();
  const router = useRouter();
  const sp = useSearchParams();
  const [home, setHome] = useState(null);   // { hero, rows } : accueil vitrine
  const [talks, setTalks] = useState(null); // grille quand une catégorie est choisie
  const [cats, setCats] = useState([]);
  // Catégorie choisie (« Tout voir » d'une rangée) : dans l'adresse (?cat=12), donc le bouton « retour » du navigateur fonctionne.
  const cat = /^\d{1,9}$/.test(sp.get('cat') || '') ? sp.get('cat') : '';
  const setCat = (id) => { router.push(id ? `/?cat=${id}` : '/'); };
  // Accueil en blocs (Admin → Pages → Accueil des membres) : s'il est publié, il remplace l'accueil d'origine. undefined = on vérifie, null = pas d'accueil en blocs.
  const [blocks, setBlocks] = useState(undefined);
  useEffect(() => {
    if (!ready) return undefined;
    let dead = false;
    call('/pages/view?path=%2F_home').then((r) => { if (!dead) setBlocks(r.ok ? r.data : null); });
    return () => { dead = true; };
  }, [call, ready]);
  // L'accueil d'origine (et la vitrine des visiteurs) n'a besoin de ses données que si l'accueil en blocs n'est pas publié.
  const legacy = blocks === null || (!user && feat('showcase'));
  const [cont, setCont] = useState([]);
  const [cit, setCit] = useState(null); // citation du jour (verset ou hadith), la même pour tous
  const [kids, setKids] = useState(null); // bande « Espace Kids » : dernières conférences Kids
  useEffect(() => { if (legacy) call('/home/kids', {}, null).then((r) => setKids(r.ok ? r.data : null)); }, [call, legacy]);
  useEffect(() => { if (legacy) call('/citation/today', {}, null).then((r) => setCit(r.ok ? r.data : null)); }, [call, legacy]);

  useEffect(() => { call('/categories', {}, null).then((r) => r.ok && setCats(r.data)); }, [call]);
  // Avec le jeton du compte, l'accueil met en premier les thèmes préférés (« Pour vous »).
  useEffect(() => { if (ready && legacy) call('/home').then((r) => setHome(r.ok ? r.data : { hero: { mode: 'text' }, rows: [] })); }, [call, ready, legacy]);
  useEffect(() => { if (user && legacy) call('/me/continue').then((r) => setCont(r.ok ? r.data : [])); else setCont([]); }, [user, call, legacy]);
  const [quizTodo, setQuizTodo] = useState([]);
  const [review, setReview] = useState([]); // « À réviser aujourd'hui » (Apprentissage ; 403 sinon)
  useEffect(() => { if (user && legacy) call('/me/revision').then((r) => setReview(r.ok ? r.data.items : [])); else setReview([]); }, [user, call, legacy]);
  useEffect(() => { if (user && legacy) call('/me/quiz/todo').then((r) => setQuizTodo(r.ok ? r.data : [])); else setQuizTodo([]); }, [user, call, legacy]);

  // Catégorie choisie (« Tout voir » d'une rangée) : grille filtrée. La recherche par mot-clé est dans la loupe du header.
  useEffect(() => {
    if (!cat) { setTalks(null); return; }
    call('/talks?' + new URLSearchParams({ category: cat }), {}, null).then((r) => setTalks(r.ok ? r.data : []));
  }, [cat, call]);

  // Visiteur non connecté : la vitrine (méthode, exemple, tarifs). Invisible (mais présente dans la page) le temps de connaître la session.
  if (!user && !cat && feat('showcase')) {
    const latest = rows0(home);
    return <Vitrine cit={cit} latest={latest} wait={!ready} hero={home?.hero} />;
  }
  if (!cat && blocks === undefined) return <main className="pb-page" aria-busy="true" />;
  if (!cat && blocks) return <><SeasonBand /><HomeBlocks page={blocks} /></>;
  const browsing = !cat; // accueil vitrine (pas de filtre)
  const catName = cats.find((c) => String(c.id) === cat);
  const rows = home?.rows || [];
  return (
    <main>
      {browsing && <HomeHero hero={home?.hero} t={t} user={user} trialDays={trialDays} />}
      {browsing && <SeasonBand />}
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
          {user && <FormatTiles />}
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
    </main>
  );
}
