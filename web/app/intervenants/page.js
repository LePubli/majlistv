// Liste des intervenants (serveur) : chaque nom mène à sa page (présentation, conférences, séries).
import Link from 'next/link';
import { apiGet, seoSite } from '../../lib/seo';

export async function generateMetadata() {
  const site = await seoSite();
  return {
    title: 'Intervenants', description: `Les intervenants de ${site.appName} : présentation, conférences et séries.`,
    alternates: { canonical: `${site.baseUrl}/intervenants` },
  };
}

export default async function Page() {
  const list = (await apiGet('/speakers')) || [];
  return (
    <main className="spk-page">
      <h1>Intervenants</h1>
      {list.length === 0 && <p className="soon">Aucun intervenant pour l’instant.</p>}
      <ul className="spk-list">
        {list.map((s) => (
          <li key={s.slug}>
            <Link href={`/intervenants/${s.slug}`}><b>{s.name}</b><span className="meta">{s.talks} conférence{s.talks > 1 ? 's' : ''}{s.series ? ` · ${s.series} série${s.series > 1 ? 's' : ''}` : ''}</span></Link>
          </li>
        ))}
      </ul>
    </main>
  );
}
