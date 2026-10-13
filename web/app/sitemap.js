// sitemap.xml : accueil, séries, conférences et séries visibles, pages légales et abonnement. Rendu à chaque demande (mis en cache 5 min côté API).
import { seoGet, seoSite } from '../lib/seo';

export const dynamic = 'force-dynamic';
export default async function sitemap() {
  const info = (await seoGet('sitemap')) || { ...(await seoSite()), talks: [], series: [] };
  const base = info.baseUrl;
  const fixed = ['', '/series', '/pricing', '/legal/mentions-legales', '/legal/cgv', '/legal/confidentialite'].map((p) => ({ url: `${base}${p}`, changeFrequency: p === '' ? 'daily' : 'weekly', priority: p === '' ? 1 : 0.6 }));
  const series = info.series.map((s) => ({ url: `${base}/series/${s.id}`, lastModified: s.lastmod || undefined, changeFrequency: 'weekly', priority: 0.7 }));
  const talks = info.talks.map((t) => ({ url: `${base}/talks/${t.id}`, lastModified: t.lastmod || undefined, changeFrequency: 'monthly', priority: 0.8 }));
  return [...fixed, ...series, ...talks];
}
