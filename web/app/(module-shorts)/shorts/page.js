// Fil de shorts (module « Shorts publics ») : /shorts et /shorts?channel=<chaîne>.
import ShortsFeed from '../../../components/ShortsFeed';

export const metadata = { title: 'Shorts', description: 'Des extraits courts des conférences, en vertical.' };

export default function Page({ searchParams }) {
  const ch = typeof searchParams?.channel === 'string' && /^[a-z0-9-]{1,120}$/.test(searchParams.channel) ? searchParams.channel : undefined;
  return <ShortsFeed channel={ch} />;
}
