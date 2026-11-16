'use client';
import { Fragment, Suspense, useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useApp } from '../components/Providers';
import HomeHero from '../components/HomeHero';
import Row from '../components/Row';
import SeriesCard from '../components/SeriesCard';
import CitationCard from '../components/CitationCard';
import Vitrine from '../components/Vitrine';
import { KidsBand } from '../components/KidsBanner';
import { HomeBlocks } from '../components/PageBlocks';
import SeasonBands from '../components/SeasonBands';
import TodayBlock from '../components/TodayBlock';
import { StartCards, Tour } from '../components/Onboarding';
import EventsBand from '../components/EventsBand';

// Première rangée de vidéos de l'accueil (nouveautés) : elle sert de « Dernières vidéos » sous la vitrine.
const rows0 = (home) => (home?.rows || []).find((r) => r.talks)?.talks || [];

export default function Home() {
  return <Suspense fallback={null}><HomeInner /></Suspense>; // useSearchParams (?cat=…) demande une limite Suspense
}

function HomeInner() {
  const { t, trialDays, user, ready, call, feat } = useApp();
  const router = useRouter();
  const sp = useSearchParams();
  const [home, setHome] = useState(null);   // { hero, rows } : accueil vitrine
  // Étape N4 (16/11) : la grille d'un thème est celle du Catalogue (avec ses filtres) ; l'ancienne adresse /?cat=12 y mène.
  const cat = /^\d{1,9}$/.test(sp.get('cat') || '') ? sp.get('cat') : '';
  useEffect(() => { if (cat) router.replace(`/catalogue?cat=${cat}`); }, [cat, router]);
  // Visite guidée (étape B2) : /?tour=1 (bouton « Faire la visite guidée » ou menu du compte).
  const tour = user && feat('onboarding') && sp.get('tour') === '1' ? <Tour onClose={() => router.replace('/', { scroll: false })} /> : null;
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
  const [kids, setKids] = useState(null); // bande « Espace Kids » : dernières vidéos Kids
  useEffect(() => { if (legacy) call('/home/kids', {}, null).then((r) => setKids(r.ok ? r.data : null)); }, [call, legacy]);
  useEffect(() => { if (legacy) call('/citation/today', {}, null).then((r) => setCit(r.ok ? r.data : null)); }, [call, legacy]);

  // Avec le jeton du compte, l'accueil met en premier les thèmes préférés (« Pour vous »).
  useEffect(() => { if (ready && legacy) call('/home').then((r) => setHome(r.ok ? r.data : { hero: { mode: 'text' }, rows: [] })); }, [call, ready, legacy]);
  useEffect(() => { if (user && legacy) call('/me/continue').then((r) => setCont(r.ok ? r.data : [])); else setCont([]); }, [user, call, legacy]);
  const [later, setLater] = useState([]); // « À regarder plus tard » (amélioration 2.5)
  useEffect(() => { if (user && legacy && feat('watchlater')) call('/me/watchlater').then((r) => setLater(r.ok ? r.data.slice(0, 16) : [])); else setLater([]); }, [user, call, legacy, feat]);

  if (cat) return <main aria-busy="true" />; // ancienne adresse /?cat=… : on part vers le Catalogue
  // Visiteur non connecté : la vitrine (méthode, exemple, tarifs). Invisible (mais présente dans la page) le temps de connaître la session.
  if (!user && feat('showcase')) {
    const latest = rows0(home);
    return <Vitrine cit={cit} latest={latest} wait={!ready} hero={home?.hero} />;
  }
  if (blocks === undefined) return <main className="pb-page" aria-busy="true" />;
  // Étape N3 (15/11) : en haut de l'accueil, une seule carte « À faire aujourd'hui » et une seule bande de saison.
  if (blocks) return <><StartCards /><TodayBlock home /><SeasonBands /><HomeBlocks page={blocks} />{tour}</>;
  const rows = home?.rows || [];
  return (
    <main>
      <HomeHero hero={home?.hero} t={t} user={user} trialDays={trialDays} />
      <StartCards />
      <TodayBlock home />
      <SeasonBands />
      {/* Étape N3 (15/11) : « Reprendre », puis les rangées. Les révisions et quiz à passer sont dans la carte « À faire aujourd'hui » ;
          les formats sont des onglets du Catalogue. */}
      {cont.length > 0 && <Row id="row-continue" title={<>{t('continueWatching')} · <Link href="/library">{t('library')}</Link></>} talks={cont} t={t} progressOf={(x) => (x.durationMs ? x.positionMs / x.durationMs : 0)} />}
      {later.length > 0 && <Row id="row-later" title={<>{t('wlRow')} · <Link href="/library?tab=list">{t('library')}</Link></>} talks={later} t={t} />}
      <EventsBand />
      {home && rows.length === 0 && <p className="soon">{t('noTalks')}</p>}
      {rows.map((r, i) => (
        <Fragment key={r.key}>
          {r.key === 'series' ? (
            <Row id="row-series" title={<>{t('rowSeries')} · <Link href="/series">{t('rowSeeAll')}</Link></>} talks={r.series} t={t} renderItem={(x) => <SeriesCard series={x} t={t} />} />
          ) : (
            <Row id={`row-${r.key.replace(':', '-')}`} talks={r.talks} t={t} badge={r.forYou ? `★ ${t('forYou')}` : null}
              title={r.key === 'new' ? t('rowNew') : r.key === 'foryou' ? t('forYou') : r.key === 'beginner' ? t('rowBeginner') : r.title}
              onSeeAll={r.categoryId && r.total > r.talks.length ? () => router.push(`/catalogue?cat=${r.categoryId}`) : undefined} />
          )}
          {i === 0 && <KidsBand data={kids} />}
        </Fragment>
      ))}
      {rows.length === 0 && <KidsBand data={kids} />}
      <CitationCard c={cit} t={t} framed />
      {tour}
    </main>
  );
}
