// Page d'une chaîne (serveur) : <head>, données structurées Person, présentation et liste des conférences dans le HTML ; ChannelClient affiche les onglets.
import { notFound } from 'next/navigation';
import ChannelClient from '../../../components/ChannelClient';
import { seoGet, clip, jsonLd } from '../../../lib/seo';

export async function generateMetadata({ params }) {
  const s = await seoGet(`speakers/${params.slug}`);
  if (!s) return { title: 'Chaîne', robots: { index: false, follow: false } };
  const url = `${s.site.baseUrl}/chaines/${s.slug}`;
  const description = clip(s.bio, 160) || `Conférences et séries de ${s.name} sur ${s.site.appName}.`;
  return {
    title: s.name, description, alternates: { canonical: url },
    openGraph: { type: 'profile', siteName: s.site.appName, title: s.name, description, url },
    twitter: { card: 'summary', title: s.name, description },
  };
}

export default async function Page({ params }) {
  const s = await seoGet(`speakers/${params.slug}`);
  if (!s) notFound();
  const base = s.site.baseUrl;
  const ld = {
    '@context': 'https://schema.org', '@type': 'Person', name: s.name, url: `${base}/chaines/${s.slug}`,
    ...(s.bio ? { description: clip(s.bio, 500) } : {}),
    subjectOf: s.talks.slice(0, 50).map((t) => ({ '@type': 'VideoObject', name: t.title, url: `${base}/conferences/${t.slug}` })),
  };
  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={jsonLd(ld)} />
      <ChannelClient slug={s.slug} initial={{ name: s.name, bio: s.bio, talks: s.talks, series: s.series }} />
    </>
  );
}
