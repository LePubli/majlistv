// Fil de shorts de l'espace Kids : /kids/shorts (le jeton enfant ne montre que les shorts adaptés à son âge).
import ShortsFeed from '../../../../components/ShortsFeed';

export const metadata = { title: 'Shorts', robots: { index: false } };

export default function Page() { return <ShortsFeed />; }
