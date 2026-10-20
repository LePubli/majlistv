// Un short, puis la suite du fil : /shorts/<id> (et ?channel=<chaîne> pour rester dans une chaîne).
import ShortsFeed from '../../../../components/ShortsFeed';

export const metadata = { title: 'Shorts' };

export default function Page({ params, searchParams }) {
  const id = /^[0-9a-f-]{36}$/i.test(String(params.id)) ? String(params.id) : 'x';
  const ch = typeof searchParams?.channel === 'string' && /^[a-z0-9-]{1,120}$/.test(searchParams.channel) ? searchParams.channel : undefined;
  return <ShortsFeed firstId={id} channel={ch} />;
}
