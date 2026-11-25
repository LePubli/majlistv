// Pages légales (serveur : titre et adresse canonique pour Google), puis le texte affiché par LegalClient.
import { cookies } from 'next/headers';
import { getLocale } from '../../../lib/i18n';
import { seoSite, apiGet } from '../../../lib/seo';
import LegalClient from './LegalClient';

export async function generateMetadata({ params }) {
  const locale = getLocale(cookies().get('locale')?.value);
  const site = await seoSite();
  const p = await apiGet(`/legal/${encodeURIComponent(params.slug)}?lang=${locale}`);
  if (!p) return { title: site.appName, robots: { index: false, follow: false } };
  const url = `${site.baseUrl}/legal/${params.slug}`;
  return { title: p.title, alternates: { canonical: url }, openGraph: { title: p.title, url, siteName: site.appName } };
}
export default function Page() { return <LegalClient />; }
