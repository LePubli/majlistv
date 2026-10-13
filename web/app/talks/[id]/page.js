// Page d'une conférence (serveur) : balises <head> (titre, description, aperçu de partage, adresse canonique), données structurées
// VideoObject pour Google, puis l'interface complète (TalkClient). Les conférences invisibles ou inconnues sont « noindex ».
import TalkClient from './TalkClient';
import { seoGet, absolute, clip, isoDuration, jsonLd } from '../../../lib/seo';

export async function generateMetadata({ params }) {
  const t = await seoGet(`talks/${params.id}`);
  if (!t) return { title: 'Conférence', robots: { index: false, follow: false } };
  const base = t.site.baseUrl;
  const title = t.speaker ? `${t.title} — ${t.speaker}` : t.title;
  const description = clip(t.description, 160) || t.site.description || undefined;
  const image = absolute(base, t.posterPath);
  const url = `${base}/talks/${t.id}`;
  return {
    title,
    description,
    alternates: { canonical: url },
    openGraph: { type: 'video.other', siteName: t.site.appName, title, description, url, ...(image ? { images: [image] } : {}) },
    twitter: { card: image ? 'summary_large_image' : 'summary', title, description, ...(image ? { images: [image] } : {}) },
  };
}

export default async function Page({ params }) {
  const t = await seoGet(`talks/${params.id}`);
  let ld = null;
  if (t) {
    const base = t.site.baseUrl;
    const image = absolute(base, t.posterPath);
    const embedUrl = t.embed ? (t.embed.kind === 'youtube' ? `https://www.youtube.com/embed/${t.embed.ref}` : `https://player.vimeo.com/video/${t.embed.ref}`) : undefined;
    ld = {
      '@context': 'https://schema.org',
      '@type': 'VideoObject',
      name: t.title,
      description: clip(t.description, 500) || t.title,
      ...(image ? { thumbnailUrl: [image] } : {}),
      uploadDate: new Date(t.publishedAt).toISOString(),
      ...(isoDuration(t.durationSeconds) ? { duration: isoDuration(t.durationSeconds) } : {}),
      ...(t.language ? { inLanguage: t.language } : {}),
      ...(embedUrl ? { embedUrl } : {}),
      url: `${base}/talks/${t.id}`,
      isAccessibleForFree: t.access === 'free',
      ...(t.access === 'premium' ? { hasPart: { '@type': 'WebPageElement', isAccessibleForFree: false, cssSelector: '.player-wrap' } } : {}),
      ...(t.speaker ? { creator: { '@type': 'Person', name: t.speaker } } : {}),
      ...(t.series ? { isPartOf: { '@type': 'CreativeWorkSeries', name: t.series.title, url: `${base}/series/${t.series.id}` } } : {}),
      publisher: { '@type': 'Organization', name: t.site.appName, url: base },
    };
  }
  return (
    <>
      {ld && <script type="application/ld+json" dangerouslySetInnerHTML={jsonLd(ld)} />}
      <TalkClient initial={t ? { title: t.title, speaker: t.speaker, category: t.category, description: t.description } : null} />
    </>
  );
}
