// /explorer — « Explorer » : tous les grands thèmes du site (sans les sous-thèmes), un clic mène à la page du thème.
// Remplace l'ancienne entrée « Catalogue » du menu (redondante avec l'accueil) ; /catalogue sans filtre y renvoie.
import { seoSite } from '../../lib/seo';
import ExplorerClient from './ExplorerClient';

export const dynamic = 'force-dynamic';

export async function generateMetadata() {
  const site = await seoSite();
  const title = 'Explorer';
  const description = 'Explorez tous les thèmes : foi, Coran, histoire, sciences, société… et trouvez la vidéo qui vous éclaire.';
  const url = `${site.baseUrl}/explorer`;
  return { title, description, alternates: { canonical: url }, openGraph: { type: 'website', siteName: site.appName, title, description, url } };
}

export default function Page() { return <ExplorerClient />; }
