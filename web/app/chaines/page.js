// Liste des chaînes (serveur) : chaque chaîne mène à sa page (présentation, conférences, séries). Ex-« Intervenants » (étape C).
import Link from 'next/link';
import { apiGet, seoSite } from '../../lib/seo';
import ChannelAvatar from '../../components/ChannelAvatar';

export async function generateMetadata() {
  const site = await seoSite();
  return {
    title: 'Chaînes', description: `Les chaînes de ${site.appName} : présentation, conférences et séries.`,
    alternates: { canonical: `${site.baseUrl}/chaines` },
  };
}

export default async function Page() {
  const list = (await apiGet('/channels')) || [];
  return (
    <main className="spk-page">
      <h1>Chaînes</h1>
      {list.length === 0 && <p className="soon">Aucune chaîne pour l’instant.</p>}
      <ul className="spk-list">
        {list.map((s) => (
          <li key={s.slug}>
            <Link href={`/chaines/${s.slug}`}>
              <ChannelAvatar name={s.name} url={s.avatarUrl} />
              <span className="ch-li-text"><b>{s.name}</b><span className="meta">{s.talks} conférence{s.talks > 1 ? 's' : ''}{s.series ? ` · ${s.series} série${s.series > 1 ? 's' : ''}` : ''}{s.followers ? ` · ${s.followers} abonné${s.followers > 1 ? 's' : ''}` : ''}</span></span>
            </Link>
          </li>
        ))}
      </ul>
    </main>
  );
}
