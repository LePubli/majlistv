// Aperçu de l'éditeur Admin → Pages : cette page est chargée dans un cadre ; elle reçoit le contenu du brouillon par
// postMessage et le dessine avec les mêmes blocs que le site. Elle n'accède à aucune donnée : elle n'affiche que ce que
// l'éditeur lui envoie (même origine uniquement).
import PreviewClient from './PreviewClient';

export const metadata = { title: 'Aperçu', robots: { index: false, follow: false } };
export default function Page() { return <PreviewClient />; }
