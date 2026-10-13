// Page d'une série (serveur) : balises <head>, données structurées TVSeries (avec ses épisodes) pour Google, puis SeriesClient.
import SeriesClient from './SeriesClient';
import { seoGet, absolute, clip, jsonLd } from '../../../lib/seo';

export async function generateMetadata({ params }) {
  const s = await seoGet(`series/${params.id}`);
  if (!s) return { title: 'Série', robots: { index: false, follow: false } };
  const base = s.site.baseUrl;
  const description = clip(s.description, 160) || s.site.description || undefined;
  const image = absolute(base, s.posterPath);
  const url = `${base}/series/${s.id}`;
  return {
    title: s.title,
    description,
    alternates: { canonical: url },
    openGraph: { type: 'video.tv_show', siteName: s.site.appName, title: s.title, description, url, ...(image ? { images: [image] } : {}) },
    twitter: { card: image ? 'summary_large_image' : 'summary', title: s.title, description, ...(image ? { images: [image] } : {}) },
  };
}

export default async function Page({ params }) {
  const s = await seoGet(`series/${params.id}`);
  let ld = null;
  if (s) {
    const base = s.site.baseUrl;
    const image = absolute(base, s.posterPath);
    ld = {
      '@context': 'https://schema.org',
      '@type': 'TVSeries',
      name: s.title,
      description: clip(s.description, 500) || s.title,
      url: `${base}/series/${s.id}`,
      ...(image ? { image } : {}),
      ...(s.speaker ? { creator: { '@type': 'Person', name: s.speaker } } : {}),
      numberOfEpisodes: s.episodes.length,
      episode: s.episodes.slice(0, 100).map((e, i) => ({
        '@type': 'TVEpisode', name: e.title, episodeNumber: e.number || i + 1, url: `${base}/talks/${e.id}`,
        ...(e.seasonNumber ? { partOfSeason: { '@type': 'TVSeason', seasonNumber: e.seasonNumber } } : {}),
      })),
    };
  }
  return (
    <>
      {ld && <script type="application/ld+json" dangerouslySetInnerHTML={jsonLd(ld)} />}
      <SeriesClient initial={s ? { title: s.title, speaker: s.speaker, description: s.description, episodes: s.episodes.map((e) => ({ id: e.id, title: e.title })) } : null} />
    </>
  );
}
