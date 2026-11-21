// /catalogue — enveloppe serveur de l'écran du Catalogue (CatalogueClient) : titre, description, adresse canonique et
// consignes aux moteurs de recherche. Une page filtrée (langue, durée, thème, recherche…) est un doublon de /catalogue :
// elle est marquée « noindex, follow » et sa canonique pointe vers /catalogue (phase 7, SEO).
import { seoSite } from '../../lib/seo';
import CatalogueClient from './CatalogueClient';

export const dynamic = 'force-dynamic';

export async function generateMetadata({ searchParams }) {
  const site = await seoSite();
  const title = 'Catalogue';
  const description = 'Parcourez toutes les vidéos par format et par catégorie : conférences, cours, récitations, documentaires, séries, avec sous-titres traduits et transcription.';
  const filtered = Object.keys(searchParams || {}).length > 0;
  const url = `${site.baseUrl}/catalogue`;
  return {
    title, description, alternates: { canonical: url },
    robots: filtered ? { index: false, follow: true } : undefined,
    openGraph: { type: 'website', siteName: site.appName, title, description, url },
  };
}

export default function Page() {
  return <CatalogueClient />;
}
