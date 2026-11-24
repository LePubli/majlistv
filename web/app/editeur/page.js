// Éditeur visuel du site (étape 2) : écran plein écran, réservé aux administrateurs (le contrôle se fait dans le composant
// et, côté API, sur chaque appel /admin/pages). Aucune donnée n'est chargée ici.
import SiteEditor from '../../components/editor/SiteEditor';
import './editor.css';

export const metadata = { title: 'Éditeur du site', robots: { index: false, follow: false } };
export default function Page() { return <SiteEditor />; }
