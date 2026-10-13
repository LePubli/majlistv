// Adresse lisible d'une conférence : /conferences/la-patience-dans-l-epreuve (adresse canonique).
import { notFound } from 'next/navigation';
import { seoGet } from '../../../lib/seo';
import { talkMetadata, TalkView } from '../../../lib/talkPage';

export const generateMetadata = ({ params }) => talkMetadata(params.slug);

export default async function Page({ params }) {
  const t = await seoGet(`talks/${params.slug}`);
  if (!t) notFound(); // inconnue ou non publiée : les adresses privées passent par /talks/<identifiant>
  return <TalkView t={t} />;
}
