// Page créée dans Admin → Pages (adresse /p/<nom>). Le serveur lit les blocs « tout le monde » (titre, description et
// contenu pour Google) ; les blocs réservés à un public sont chargés ensuite par le navigateur, selon la connexion.
import { cookies } from 'next/headers';
import { notFound } from 'next/navigation';
import { getLocale } from '../../../lib/i18n';
import { customPage } from '../../../lib/pages';
import { tx } from '../../../lib/blocks';
import { seoSite } from '../../../lib/seo';
import { CustomPage } from '../../../components/PageBlocks';

export const dynamic = 'force-dynamic';

export async function generateMetadata({ params }) {
  const page = await customPage(params.slug);
  if (!page) return { title: 'Page introuvable', robots: { index: false } };
  const lang = getLocale(cookies().get('locale')?.value);
  const site = await seoSite();
  const title = tx(page.meta?.title, lang) || page.title;
  const description = tx(page.meta?.description, lang) || undefined;
  return { title, description, alternates: { canonical: `${site.baseUrl}${page.path}` }, openGraph: { title, description, url: `${site.baseUrl}${page.path}`, siteName: site.appName } };
}

export default async function Page({ params }) {
  const page = await customPage(params.slug);
  if (!page) notFound();
  return <CustomPage page={page} />;
}
