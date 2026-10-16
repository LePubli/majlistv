// Fiche d'un ouvrage (serveur) : balises <head> et données structurées « Book » pour Google, puis la fiche.
import BookClient from './BookClient';
import { seoGet, absolute, clip, jsonLd } from '../../../../lib/seo';

export async function generateMetadata({ params }) {
  const b = await seoGet(`books/${params.id}`);
  if (!b) return { title: 'Ouvrage', robots: { index: false, follow: false } };
  const base = b.site.baseUrl;
  const description = clip(b.description, 160) || b.site.description || undefined;
  const image = absolute(base, b.posterPath);
  const url = `${base}/books/${b.id}`;
  const title = b.author ? `${b.title} — ${b.author}` : b.title;
  return {
    title, description, alternates: { canonical: url },
    openGraph: { type: 'book', siteName: b.site.appName, title, description, url, ...(image ? { images: [image] } : {}) },
    twitter: { card: image ? 'summary_large_image' : 'summary', title, description, ...(image ? { images: [image] } : {}) },
  };
}

export default async function Page({ params }) {
  const b = await seoGet(`books/${params.id}`);
  const ld = b ? {
    '@context': 'https://schema.org', '@type': 'Book', name: b.title, url: `${b.site.baseUrl}/books/${b.id}`,
    description: clip(b.description, 500) || b.title,
    ...(b.author ? { author: { '@type': 'Person', name: b.author } } : {}),
    ...(absolute(b.site.baseUrl, b.posterPath) ? { image: absolute(b.site.baseUrl, b.posterPath) } : {}),
    inLanguage: b.langs,
  } : null;
  return (
    <>
      {ld && <script type="application/ld+json" dangerouslySetInnerHTML={jsonLd(ld)} />}
      <BookClient initial={b ? { title: b.title, author: b.author, description: b.description } : null} />
    </>
  );
}
