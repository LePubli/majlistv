import { cookies } from 'next/headers';
// Polices auto-hébergées (fichiers servis par le site, aucun appel à Google Fonts : conforme RGPD).
import '@fontsource-variable/montserrat';
import '@fontsource-variable/fredoka';
import '@fontsource-variable/dm-sans';
import '@fontsource-variable/inter'; // thème « Mejliss bleu » (étape D2)
import '@fontsource-variable/noto-kufi-arabic';
import '@fontsource-variable/noto-sans-arabic';
import '@fontsource/marcellus';
import '@fontsource/amiri/400.css';
import '@fontsource/amiri/700.css';
import './globals.css';
import './skin-nuit.css'; // thème « Nuit et or » (html[data-skin="nuit"])
import './skin-bleu.css'; // thème « Mejliss bleu » (html[data-skin="bleu"], étape D2)
import './skin-premium.css'; // thème « Premium » V20 (html[data-skin="premium"] : couleurs des écrans pas encore refaits)
import Providers from '../components/Providers';
import Header from '../components/Header';
import Footer from '../components/Footer';
import RouteGate from '../components/RouteGate';
import MemberShell from '../components/MemberShell';
import SectionTabs from '../components/SectionTabs';
import StatsBeacon from '../components/StatsBeacon';
import ErrorReporter from '../components/ErrorReporter'; // étape 39 : suivi des erreurs du navigateur
import ResponsiveTables from '../components/ResponsiveTables';
import SkipLink from '../components/SkipLink';
import { DIR, getLocale } from '../lib/locales';
import { seoSite } from '../lib/seo';
import { siteTheme, themeBg } from '../lib/theme';
import { dictFor } from '../lib/texts';
import { pageSlots, siteLayout } from '../lib/pages';
import { PageSlots } from '../components/PageBlocks';
import EditMode from '../components/EditMode';
import { webFeatures, hasWebModule } from '../lib/modules'; // étape M3b : fonctions dont la partie web du module est présente
import TopBar from '../components/TopBar';
import PwaRegister from '../components/PwaRegister'; // étape 22a : site installable
import SeasonTheme from '../components/SeasonTheme'; // étape 45H : thème de saison
import AdhanPlayer from '../components/AdhanPlayer'; // adhan à l'heure de la prière (site ouvert)
import PrayerGate from '../components/PrayerGate'; // étape 23a : pause de la lecture à l'heure de la prière
import { visitorHeaders } from '../lib/visitorIp';
import { V20_CSS, BO_CSS } from '../lib/skin';

export const dynamic = 'force-dynamic';
// Nom du site et durée de l'essai : réglés dans Admin → Paramètres (GET /config), à défaut variable APP_NAME.
async function siteConfig() {
  try {
    const res = await fetch(`${process.env.API_URL || 'http://localhost:3000'}/config`, { cache: 'no-store', headers: await visitorHeaders(), signal: AbortSignal.timeout(2000) });
    const c = await res.json();
    if (c.appName) return { skin: c.skin || null, appName: c.appName, trialDays: Number(c.trialDays) || 0, prayer: c.prayer || null, cards: c.cards || null, hasSeries: Boolean(c.hasSeries), hasBooks: Boolean(c.hasBooks), stats: c.stats !== false, features: c.features || {}, modules: c.modules || {} };
  } catch { /* API injoignable : valeurs de secours */ }
  return { appName: process.env.APP_NAME || 'Mejliss TV', trialDays: 7 };
}
// Titre « Page | Nom du site », description et aperçu de partage par défaut ; chaque page peut les remplacer (vidéos, séries).
export const generateMetadata = async () => {
  const site = await seoSite();
  const name = site.appName || (await siteConfig()).appName;
  let metadataBase;
  try { metadataBase = new URL(site.baseUrl); } catch { /* adresse du site non valide : adresses relatives */ }
  return {
    metadataBase,
    title: { default: name, template: `%s | ${name}` },
    description: site.description || undefined,
    applicationName: name,
    openGraph: { type: 'website', siteName: name, title: name, description: site.description || undefined, images: ['/icon-512.png'] },
    twitter: { card: 'summary', title: name, description: site.description || undefined },
    icons: { icon: [{ url: '/favicon.png', type: 'image/png' }], apple: '/apple-touch-icon.png' },
    // Étape 22a : site installable (écran d'accueil, plein écran). iPhone / iPad : ouverture sans la barre de Safari.
    manifest: '/manifest.webmanifest',
    appleWebApp: { capable: true, title: name, statusBarStyle: 'black' },
  };
};
// Couleur de la barre d'adresse des téléphones : le fond du thème publié (Admin → Apparence).
export const generateViewport = async () => ({ themeColor: themeBg(await siteTheme()), width: 'device-width', initialScale: 1 });

// Thèmes visuels : « classique » (noir et or), « nuit » (Nuit et or), « bleu » (Mejliss bleu, étape D2), « premium » (thème V20,
// autonome : voir lib/skin.js).
const SKINS = ['classique', 'nuit', 'bleu', 'premium'];

export default async function RootLayout({ children }) {
  const locale = getLocale(cookies().get('locale')?.value);
  const [{ appName, trialDays, prayer, cards, hasSeries, hasBooks, stats, features, modules, skin: skinCfg }, theme, dict, slots, layout] = await Promise.all([siteConfig(), siteTheme(), dictFor(locale), pageSlots(), siteLayout()]);
  // Thème visuel : choix du visiteur (cookie « skin ») s'il est permis, sinon celui par défaut (Admin → Paramètres → Général).
  const skinDef = SKINS.includes(skinCfg?.def) ? skinCfg.def : 'classique';
  const wanted = cookies().get('skin')?.value;
  const skin = skinCfg?.choice === true && SKINS.includes(wanted) ? wanted : skinDef;
  return (
    <html lang={locale} dir={DIR[locale]} data-skin={skin}>
      {/* Thème « Premium » (V20) : sa feuille n'est chargée que pour ce thème (≈ 230 Ko, inutile aux autres). */}
      <head>{skin === 'premium' && <link id="v20-css" rel="stylesheet" href={V20_CSS} />}{skin === 'premium' && <link id="bo-css" rel="stylesheet" href={BO_CSS} />}</head>
      <body>
        {/* Thème publié (Admin → Apparence) : placé après la feuille de style du site, il la remplace. L'aperçu de
            l'administration réécrit cette balise (id="theme-vars") pour montrer un brouillon sans le publier. */}
        <style id="theme-vars" dangerouslySetInnerHTML={{ __html: theme?.css || '' }} />
        <Providers skin={skin} skinChoice={skinCfg?.choice === true} locale={locale} dict={dict} appName={appName} trialDays={trialDays} prayerCfg={prayer} cards={cards} hasSeries={Boolean(hasSeries) && hasWebModule('series')} hasBooks={Boolean(hasBooks) && hasWebModule('books')} statsOn={stats !== false && hasWebModule('stats')} features={webFeatures(features || {})} modules={modules || {}} layout={layout}>
          <StatsBeacon />
          <ErrorReporter />
          <PwaRegister />
          <SeasonTheme />
          <PrayerGate />
          <AdhanPlayer />
          <ResponsiveTables />
          <SkipLink />
          <TopBar />
          <Header />
          {/* Zone de page d'au moins un écran : le pied de page reste sous la ligne de flottaison pendant le chargement des données (sinon il « saute » vers le bas : décalage de mise en page, CLS) */}
          <div className="page-shell"><MemberShell><SectionTabs /><RouteGate><PageSlots slots={slots}>{children}</PageSlots></RouteGate></MemberShell></div>
          <Footer />
          <EditMode />
        </Providers>
      </body>
    </html>
  );
}
