// Ancienne adresse d'une conférence : /talks/<identifiant>. Une conférence publique est redirigée (308) vers son adresse lisible ;
// une conférence non publique (brouillon d'un organisateur…) s'affiche ici, en « noindex ».
import { permanentRedirect } from 'next/navigation';
import { seoGet } from '../../../lib/seo';
import { talkMetadata, TalkView } from '../../../lib/talkPage';

export const generateMetadata = ({ params }) => talkMetadata(params.id);

export default async function Page({ params, searchParams }) {
  const t = await seoGet(`talks/${params.id}`);
  if (t?.slug) {
    const qs = new URLSearchParams(Object.entries(searchParams || {}).flatMap(([k, v]) => (Array.isArray(v) ? v.map((x) => [k, x]) : [[k, v]]))).toString();
    permanentRedirect(`/conferences/${t.slug}${qs ? `?${qs}` : ''}`);
  }
  return <TalkView t={null} routeId={params.id} />;
}
