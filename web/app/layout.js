import { cookies } from 'next/headers';
import './globals.css';
import Providers from '../components/Providers';
import Header from '../components/Header';
import { DICT, DIR, getLocale } from '../lib/i18n';

export const dynamic = 'force-dynamic';
// Nom du site : réglé dans Admin → Paramètres (GET /config), à défaut variable APP_NAME.
async function siteName() {
  try {
    const res = await fetch(`${process.env.API_URL || 'http://localhost:3000'}/config`, { cache: 'no-store', signal: AbortSignal.timeout(2000) });
    const c = await res.json();
    if (c.appName) return c.appName;
  } catch { /* API injoignable : valeur de secours */ }
  return process.env.APP_NAME || 'Majlis TV';
}
export const generateMetadata = async () => ({ title: await siteName(), icons: { icon: '/favicon.svg' } });

export default async function RootLayout({ children }) {
  const locale = getLocale(cookies().get('locale')?.value);
  const appName = await siteName();
  return (
    <html lang={locale} dir={DIR[locale]}>
      <body>
        <Providers locale={locale} dict={DICT[locale]} appName={appName}>
          <Header />
          {children}
        </Providers>
      </body>
    </html>
  );
}
