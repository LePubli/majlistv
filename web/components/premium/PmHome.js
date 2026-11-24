'use client';
// Accueil du thème Premium : une de la maquette V20 (classes « v20-… ») puis, depuis la V22, rangées « OTT » (cartes 16:9,
// 5 par ligne), remplies avec les vraies données du site. Depuis l'étape 4 de l'éditeur visuel, chaque partie est une section
// (PmHomeSections.js) et l'accueil peut être recomposé en blocs : Admin → Éditeur du site → Accueil. Tant qu'aucun accueil en
// blocs n'est publié, la composition d'origine ci-dessous s'affiche (même ordre, mêmes sections).
//   1. La une · 2. Univers (téléphone) · 3. Continuer à regarder · 4. Rangées avec, entre elles, sélections et Shorts · 5. Kids · 6. Apprendre · 7. « La découverte continue »
import { useEffect, useState } from 'react';
import { useApp } from '../Providers';
import { BlocksView } from '../PageBlocks';
import { DIR } from '../../lib/locales';
import {
  PmHeroSection, PmUniversesSection, PmContinueSection, PmFeedSection, PmKidsSection, PmLearnSection, PmDiscoverSection,
} from './PmHomeSections';

// Accueil publié dans l'éditeur (adresse interne /_home), adapté à la personne par le serveur. undefined = on vérifie, null = pas d'accueil en blocs.
function usePublishedHome() {
  const { ready, call, user } = useApp();
  const [page, setPage] = useState(undefined);
  useEffect(() => {
    if (!ready) return undefined;
    let dead = false;
    call('/pages/view?path=%2F_home').then((r) => { if (!dead) setPage(r.ok && r.data?.zones?.main ? r.data : null); }).catch(() => { if (!dead) setPage(null); });
    return () => { dead = true; };
  }, [call, ready, user?.id]);
  return page;
}

/** Composition d'origine de l'accueil Premium. */
function DefaultHome() {
  return (
    <div className="v20-app pm-home pm-ott">
      <div className="v20-signature-home v20-faithful-home">
        <PmHeroSection />
        <PmUniversesSection />
        <main className="pm-ott-body">
          <PmContinueSection />
          <PmFeedSection />
          <PmKidsSection />
          <PmLearnSection />
          <PmDiscoverSection />
        </main>
      </div>
    </div>
  );
}

/** Accueil recomposé dans l'éditeur : les blocs publiés, dans l'ordre choisi. */
function BlocksHome({ page }) {
  const { locale } = useApp();
  const blocks = page.zones?.main || [];
  const hasHero = blocks.some((b) => b.type === 'pm_hero');
  // Sans la une, l'en-tête (posé sur l'image) recouvrirait le premier bloc : on lui garde sa place.
  return (
    <main className={`pm-blocks-home${hasHero ? '' : ' pm-nohero'}`} data-pbpath="/_home" lang={locale} dir={DIR[locale] || 'ltr'}>
      <BlocksView blocks={blocks} locale={locale} />
    </main>
  );
}

export default function PmHome() {
  const page = usePublishedHome();
  if (page === undefined) return <div className="v20-app pm-home pm-ott"><div className="v20-signature-home v20-faithful-home"><section className="v20-hero v20-faithful-hero v20-hero-home" aria-busy="true" /></div></div>;
  return page ? <BlocksHome page={page} /> : <DefaultHome />;
}
