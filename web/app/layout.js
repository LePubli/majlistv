import { cookies } from 'next/headers';
// Polices auto-hébergées (fichiers servis par le site, aucun appel à Google Fonts : conforme RGPD).
import '@fontsource-variable/montserrat';
import '@fontsource-variable/dm-sans';
import '@fontsource-variable/noto-kufi-arabic';
import '@fontsource-variable/noto-sans-arabic';
import './globals.css';
import Providers from '../components/Providers';
import Header from '../components/Header';
import Footer from '../components/Footer';
import { DICT, DIR, getLocale } from '../lib/i18n';
import { seoSite } from '../lib/seo';

export const dynamic = 'force-dynamic';
// Nom du site et durée de l'essai : réglés dans Admin → Paramètres (GET /config), à défaut variable APP_NAME.
async function siteConfig() {
  try {
    const res = await fetch(`${process.env.API_URL || 'http://localhost:3000'}/config`, { cache: 'no-store', signal: AbortSignal.timeout(2000) });
    const c = await res.json();
    if (c.appName) return { appName: c.appName, trialDays: Number(c.trialDays) || 0, cards: c.cards || null, hasSeries: Boolean(c.hasSeries) };
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
export const viewport = { themeColor: '#0B0906', width: 'device-width', initialScale: 1 };

export default async function RootLayout({ children }) {
  const locale = getLocale(cookies().get('locale')?.value);
  const { appName, trialDays, cards, hasSeries } = await siteConfig();
  return (
    <html lang={locale} dir={DIR[locale]}>
      <body>
        <Providers locale={locale} dict={DICT[locale]} appName={appName} trialDays={trialDays} cards={cards} hasSeries={Boolean(hasSeries)}>
          <Header />
          {children}
          <Footer />
        </Providers>
      </body>
    </html>
  );
}
