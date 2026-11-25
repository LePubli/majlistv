// Liste des séries (serveur : titre, description et adresse canonique pour Google), puis la liste elle-même.
import { cookies } from 'next/headers';
import { DICT, getLocale } from '../../../lib/i18n';
import { dictFor } from '../../../lib/texts';
import { seoSite } from '../../../lib/seo';
import SeriesListClient from './SeriesListClient';

export async function generateMetadata() {
  const dict = await dictFor(getLocale(cookies().get('locale')?.value));
  const t = (k) => dict[k] || DICT.fr[k];
  const site = await seoSite();
  const url = `${site.baseUrl}/series`;
  return { title: t('seriesTitle'), description: t('seriesIntro'), alternates: { canonical: url }, openGraph: { title: t('seriesTitle'), description: t('seriesIntro'), url, siteName: site.appName } };
}
export default function Page() { return <SeriesListClient />; }
