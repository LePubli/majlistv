// Page publique « Ouvrages » (serveur : titre et description pour Google), puis la liste.
import { cookies } from 'next/headers';
import { DICT, getLocale } from '../../lib/i18n';
import { dictFor } from '../../lib/texts';
import { seoSite } from '../../lib/seo';
import BooksClient from './BooksClient';

export async function generateMetadata() {
  const dict = await dictFor(getLocale(cookies().get('locale')?.value)); // textes d'origine + textes modifiés (Admin → Textes)
  const t = (k) => dict[k] || DICT.fr[k];
  const site = await seoSite();
  return { title: t('bkTitle'), description: t('bkIntro'), alternates: { canonical: `${site.baseUrl}/books` }, openGraph: { title: t('bkTitle'), description: t('bkIntro'), url: `${site.baseUrl}/books`, siteName: site.appName } };
}
export default function Page() { return <BooksClient />; }
