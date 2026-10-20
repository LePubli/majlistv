// Page d'une conférence côté serveur, partagée par /conferences/[slug] (adresse lisible, canonique) et /talks/[id] (ancienne adresse : redirigée).
// Balises <head>, données structurées VideoObject, puis TalkClient ; chapitres et extrait de transcription (conférences gratuites) dans le HTML.
import TalkClient from '../app/talks/[id]/TalkClient';
import { seoGet, absolute, clip, isoDuration, jsonLd } from './seo';

export const talkUrl = (base, t) => `${base}/conferences/${t.slug}`;

export async function talkMetadata(ref) {
  const t = await seoGet(`talks/${ref}`);
  if (!t) return { title: 'Conférence', robots: { index: false, follow: false } };
  const base = t.site.baseUrl;
  const title = t.speaker ? `${t.title} — ${t.speaker}` : t.title;
  const description = clip(t.description, 160) || t.site.description || undefined;
  const image = absolute(base, t.posterPath);
  const url = talkUrl(base, t);
  return {
    title,
    description,
    alternates: { canonical: url },
    openGraph: { type: 'video.other', siteName: t.site.appName, title, description, url, ...(image ? { images: [image] } : {}) },
    twitter: { card: image ? 'summary_large_image' : 'summary', title, description, ...(image ? { images: [image] } : {}) },
  };
}

const stamp = (ms) => {
  const s = Math.floor(ms / 1000); const h = Math.floor(s / 3600); const m = Math.floor((s % 3600) / 60);
  return `${h ? `${h}:${String(m).padStart(2, '0')}` : m}:${String(s % 60).padStart(2, '0')}`;
};

export function TalkView({ t, routeId }) {
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
      url: talkUrl(base, t),
      isAccessibleForFree: t.access === 'free',
      ...(t.access === 'premium' ? { hasPart: { '@type': 'WebPageElement', isAccessibleForFree: false, cssSelector: '.player-wrap' } } : {}),
      ...(t.speaker ? { creator: { '@type': 'Person', name: t.speaker } } : {}),
      ...(t.series ? { isPartOf: { '@type': 'CreativeWorkSeries', name: t.series.title, url: `${base}/series/${t.series.slug || t.series.id}` } } : {}),
      ...(t.chapters?.length ? { hasPart: t.chapters.map((c) => ({ '@type': 'Clip', name: c.title, startOffset: Math.floor(c.ms / 1000), url: `${talkUrl(base, t)}?t=${Math.floor(c.ms / 1000)}` })) } : {}),
      publisher: { '@type': 'Organization', name: t.site.appName, url: base },
    };
  }
  const more = t && (t.chapters?.length || t.excerpt || t.summary);
  return (
    <>
      {ld && <script type="application/ld+json" dangerouslySetInnerHTML={jsonLd(ld)} />}
      {/* Chapitres et extrait (HTML lisible par les moteurs de recherche) : affichés par TalkClient AU-DESSUS de « À suivre » (demande d'Epok du 20/10). */}
      <TalkClient talkId={t?.id || routeId} initial={t ? { title: t.title, speaker: t.speaker, category: t.category, description: t.description } : null}
        extra={more ? (
          <details className="seo-extra">
            <summary>{t.chapters?.length ? 'Chapitres et extrait' : 'Résumé et extrait'}</summary>
            {t.summary && <p>{t.summary}</p>}
            {t.chapters?.length > 0 && (
              <>
                <h2>Chapitres</h2>
                <ol>{t.chapters.map((c) => <li key={c.ms}><a href={`/conferences/${t.slug}?t=${Math.floor(c.ms / 1000)}`}>{stamp(c.ms)}</a> {c.title}</li>)}</ol>
              </>
            )}
            {t.excerpt && <><h2>Extrait de la transcription</h2><p lang={t.language || undefined}>{t.excerpt}</p></>}
          </details>
        ) : null} />
    </>
  );
}
