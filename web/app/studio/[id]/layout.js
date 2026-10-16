// Fiche d'une conférence dans le Studio : l'adresse doit contenir un identifiant de conférence.
// Étape M3b : sans cette vérification, une page de module retirée (ex. /studio/quiz) tombait ici au lieu d'afficher « page introuvable ».
import { notFound } from 'next/navigation';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default async function StudioTalkLayout({ children, params }) {
  const { id } = await params;
  if (!UUID.test(id)) notFound();
  return children;
}
