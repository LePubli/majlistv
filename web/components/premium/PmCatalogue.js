'use client';
// Catalogue du thème Premium (et liste /series). Depuis l'étape 4b de l'éditeur visuel, il est fait de cinq sections
// (PmCatalogueSections.js) : bannière, thèmes, rangées, résultats, liens Apprendre / Kids. On peut les recomposer dans
// Admin → Éditeur du site → Pages → « Catalogue ». Tant qu'aucun Catalogue en blocs n'est publié, la composition d'origine
// ci-dessous s'affiche (même ordre, mêmes sections). La liste /series garde toujours sa composition d'origine.
import { Suspense, useEffect, useState } from 'react';
import { useApp } from '../Providers';
import { BlocksView } from '../PageBlocks';
import { DIR } from '../../lib/locales';
import { CatProvider, CatHeroSection, CatChipsSection, CatRailsSection, CatResultsSection, CatCrossSection } from './PmCatalogueSections';

export default function PmCatalogue(props) {
  return <Suspense fallback={<div className="v20-app pm-page" aria-busy="true" />}><Inner {...props} /></Suspense>;
}

// Catalogue publié dans l'éditeur (adresse interne /_catalogue), adapté à la personne par le serveur. undefined = on vérifie, null = pas de Catalogue en blocs.
function usePublishedCatalogue(on) {
  const { ready, call, user } = useApp();
  const [page, setPage] = useState(on ? undefined : null);
  useEffect(() => {
    if (!on) { setPage(null); return undefined; }
    if (!ready) return undefined;
    let dead = false;
    call('/pages/view?path=%2F_catalogue').then((r) => { if (!dead) setPage(r.ok && r.data?.zones?.main ? r.data : null); }).catch(() => { if (!dead) setPage(null); });
    return () => { dead = true; };
  }, [call, ready, on, user?.id]);
  return page;
}

/** Composition d'origine du Catalogue. */
function DefaultCatalogue() {
  return (
    <div className="v20-app pm-page pm-ott pm-ott-cat">
      <CatHeroSection />
      <CatChipsSection />
      <main className="pm-ott-body">
        <CatRailsSection />
        <CatResultsSection />
        <CatCrossSection />
      </main>
    </div>
  );
}

/** Catalogue recomposé dans l'éditeur : les blocs publiés, dans l'ordre choisi. */
function BlocksCatalogue({ page }) {
  const { locale } = useApp();
  const blocks = page.zones?.main || [];
  const hasHero = blocks.some((b) => b.type === 'pm_cat_hero');
  // Sans la bannière, l'en-tête (posé sur l'image) recouvrirait le premier bloc : on lui garde sa place.
  return (
    <main className={`pm-blocks-cat${hasHero ? '' : ' pm-nohero'}`} data-pbpath="/_catalogue" lang={locale} dir={DIR[locale] || 'ltr'}>
      <BlocksView blocks={blocks} locale={locale} />
    </main>
  );
}

function Inner({ series = false }) {
  const page = usePublishedCatalogue(!series);
  return (
    <CatProvider series={series}>
      {page === undefined ? <div className="v20-app pm-page pm-ott pm-ott-cat" aria-busy="true" /> : page ? <BlocksCatalogue page={page} /> : <DefaultCatalogue />}
    </CatProvider>
  );
}
