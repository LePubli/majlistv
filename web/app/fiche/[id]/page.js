// Amélioration 3.3 — Fiche imprimable d'une vidéo : jamais indexée (contenu personnel : notes du membre).
import FicheClient from '../../../components/FicheClient';

export const metadata = { title: 'Fiche', robots: { index: false, follow: false } };

export default function Page({ params }) {
  return <FicheClient id={params.id} />;
}
