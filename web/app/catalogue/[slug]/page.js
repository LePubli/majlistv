// Nouveau catalogue, phase 3 — /catalogue/<slug> : page publique d'une catégorie du catalogue adultes, rendue côté serveur
// (titre, description, fil d'Ariane en données structurées, canonique ; « noindex » tant qu'elle ne contient aucune vidéo).
import { cookies } from 'next/headers';
import { notFound } from 'next/navigation';
import { getLocale } from '../../../lib/locales';
import { apiGet, seoSite, clip, jsonLd } from '../../../lib/seo';
import CategoryView from '../../../components/CategoryView';

export const dynamic = 'force-dynamic';
const PAGE = 24;
const pageOf = (sp) => { const n = parseInt(sp?.page, 10); return Number.isInteger(n) && n > 0 && n < 10000 ? n : 1; };
const load = async (slug, locale) => (/^[a-z0-9-]{1,120}$/.test(slug) ? apiGet(`/catalogue/categories/${slug}?lang=${locale}`) : null);

export async function generateMetadata({ params, searchParams }) {
  const locale = getLocale(cookies().get('locale')?.value);
  const [cat, site] = await Promise.all([load(params.slug, locale), seoSite()]);
  if (!cat) return { title: 'Catégorie', robots: { index: false, follow: false } };
  const page = pageOf(searchParams);
  const title = cat.seoTitle || cat.name;
  const description = clip(cat.seoDescription || cat.shortDescription || cat.description, 160) || undefined;
  const url = `${site.baseUrl}/catalogue/${cat.slug}${page > 1 ? `?page=${page}` : ''}`;
  return {
    title, description, alternates: { canonical: url },
    robots: cat.count === 0 ? { index: false, follow: true } : undefined,
    openGraph: { type: 'website', siteName: site.appName, title, description, url, ...(cat.heroImage || cat.image ? { images: [cat.heroImage || cat.image] } : {}) },
  };
}

export default async function Page({ params, searchParams }) {
  const locale = getLocale(cookies().get('locale')?.value);
  const cat = await load(params.slug, locale);
  if (!cat) notFound();
  const page = pageOf(searchParams);
  const pages = Math.max(1, Math.ceil(cat.count / PAGE));
  if (page > pages) notFound();
  const talks = (await apiGet(`/talks?category=${cat.id}&limit=${PAGE}&offset=${(page - 1) * PAGE}`)) || [];
  const site = await seoSite();
  const ld = {
    '@context': 'https://schema.org', '@type': 'BreadcrumbList',
    itemListElement: [{ name: 'Catalogue', item: `${site.baseUrl}/catalogue` }, ...cat.breadcrumbs.map((b) => ({ name: b.name, item: `${site.baseUrl}/catalogue/${b.slug}` }))]
      .map((x, i) => ({ '@type': 'ListItem', position: i + 1, name: x.name, item: x.item })),
  };
  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={jsonLd(ld)} />
      <CategoryView cat={cat} talks={talks} page={page} pages={pages} />
    </>
  );
}
