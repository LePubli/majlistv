// robots.txt : tout le catalogue public est ouvert aux moteurs ; comptes, studio et administration restent privés.
import { seoSite } from '../lib/seo';

export const dynamic = 'force-dynamic';
export default async function robots() {
  const { baseUrl } = await seoSite();
  return {
    rules: [{ userAgent: '*', allow: '/', disallow: ['/api/', '/admin', '/studio', '/organizer', '/account', '/library', '/welcome', '/login', '/register', '/forgot', '/reset'] }],
    sitemap: `${baseUrl}/sitemap.xml`,
  };
}
