import { cookies } from 'next/headers';
// Polices auto-hébergées (fichiers servis par le site, aucun appel à Google Fonts : conforme RGPD).
import '@fontsource-variable/montserrat';
import '@fontsource-variable/fredoka';
import '@fontsource-variable/dm-sans';
import '@fontsource-variable/noto-kufi-arabic';
import '@fontsource-variable/noto-sans-arabic';
import './globals.css';
import Providers from '../components/Providers';
import Header from '../components/Header';
import Footer from '../components/Footer';
import RouteGate from '../components/RouteGate';
import MemberShell from '../components/MemberShell';
import StatsBeacon from '../components/StatsBeacon';
import ResponsiveTables from '../components/ResponsiveTables';
import SkipLink from '../components/SkipLink';
import { DIR, getLocale } from '../lib/i18n';
import { seoSite } from '../lib/seo';
import { siteTheme, themeBg } from '../lib/theme';
import { dictFor } from '../lib/texts';
import { pageSlots, siteLayout } from '../lib/pages';
import { PageSlots } from '../components/PageBlocks';
import EditMode from '../components/EditMode';
import { webFeatures, hasWebModule } from '../lib/modules'; // étape M3b : fonctions dont la partie web du module est présente
import TopBar from '../components/TopBar';

export const dynamic = 'force-dynamic';
// Nom du site et durée de l'essai : réglés dans Admin → Paramètres (GET /config), à défaut variable APP_NAME.
async function siteConfig() {
  try {
    const res = await fetch(`${process.env.API_URL || 'http://localhost:3000'}/config`, { cache: 'no-store', signal: AbortSignal.timeout(2000) });
    const c = await res.json();
    if (c.appName) return { appName: c.appName, trialDays: Number(c.trialDays) || 0, cards: c.cards || null, hasSeries: Boolean(c.hasSeries), hasBooks: Boolean(c.hasBooks), stats: c.stats !== false, features: c.features || {}, modules: c.modules || {} };
  } catch { /* API injoignable : valeurs de secours */ }
  return { appName: process.env.APP_NAME || 'Mejliss TV', trialDays: 7 };
}
// Titre « Page | Nom du site », description et aperçu de partage par défaut ; chaque page peut les remplacer (conférences, séries).
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
  };
};
// Couleur de la barre d'adresse des téléphones : le fond du thème publié (Admin → Apparence).
export const generateViewport = async () => ({ themeColor: themeBg(await siteTheme()), width: 'device-width', initialScale: 1 });

export default async function RootLayout({ children }) {
  const locale = getLocale(cookies().get('locale')?.value);
  const [{ appName, trialDays, cards, hasSeries, hasBooks, stats, features, modules }, theme, dict, slots, layout] = await Promise.all([siteConfig(), siteTheme(), dictFor(locale), pageSlots(), siteLayout()]);
  return (
    <html lang={locale} dir={DIR[locale]}>
      <body>
        {/* Thème publié (Admin → Apparence) : placé après la feuille de style du site, il la remplace. L'aperçu de
            l'administration réécrit cette balise (id="theme-vars") pour montrer un brouillon sans le publier. */}
        <style id="theme-vars" dangerouslySetInnerHTML={{ __html: theme?.css || '' }} />
        <Providers locale={locale} dict={dict} appName={appName} trialDays={trialDays} cards={cards} hasSeries={Boolean(hasSeries) && hasWebModule('series')} hasBooks={Boolean(hasBooks) && hasWebModule('books')} statsOn={stats !== false && hasWebModule('stats')} features={webFeatures(features || {})} modules={modules || {}} layout={layout}>
          <StatsBeacon />
          <ResponsiveTables />
          <SkipLink />
          <TopBar />
          <Header />
          <MemberShell><RouteGate><PageSlots slots={slots}>{children}</PageSlots></RouteGate></MemberShell>
          <Footer />
          <EditMode />
        </Providers>
      </body>
    </html>
  );
}
