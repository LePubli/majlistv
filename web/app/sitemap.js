// sitemap.xml : accueil, séries, conférences et séries visibles, pages légales et abonnement. Rendu à chaque demande (mis en cache 5 min côté API).
import { seoGet, seoSite } from '../lib/seo';
import { publicPages } from '../lib/pages';

export const dynamic = 'force-dynamic';
export default async function sitemap() {
  const info = (await seoGet('sitemap')) || { ...(await seoSite()), talks: [], series: [] };
  const base = info.baseUrl;
  const fixed = ['', '/series', '/books', '/chaines', '/pricing', '/legal/mentions-legales', '/legal/cgv', '/legal/confidentialite'].map((p) => ({ url: `${base}${p}`, changeFrequency: p === '' ? 'daily' : 'weekly', priority: p === '' ? 1 : 0.6 }));
  const series = info.series.map((s) => ({ url: `${base}/series/${s.slug || s.id}`, lastModified: s.lastmod || undefined, changeFrequency: 'weekly', priority: 0.7 }));
  const talks = info.talks.map((t) => ({ url: `${base}/conferences/${t.slug || t.id}`, lastModified: t.lastmod || undefined, changeFrequency: 'monthly', priority: 0.8, ...(t.hasPoster ? { images: [`${base}/api/seo/poster/talks/${t.id}`] } : {}) }));
  const books = (info.books || []).map((b) => ({ url: `${base}/books/${b.id}`, lastModified: b.lastmod || undefined, changeFrequency: 'monthly', priority: 0.6 }));
  const speakers = (info.speakers || []).map((x) => ({ url: `${base}/chaines/${x.slug}`, changeFrequency: 'weekly', priority: 0.5 }));
  const pages = (await publicPages()).map((p) => ({ url: `${base}${p.path}`, lastModified: p.updatedAt || undefined, changeFrequency: 'weekly', priority: 0.6 })); // pages créées dans Admin → Pages
  return [...fixed, ...series, ...talks, ...books, ...speakers, ...pages];
}
