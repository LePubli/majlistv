// Un short de l'espace Kids, puis la suite du fil.
import ShortsFeed from '../../../../../components/ShortsFeed';

export const metadata = { title: 'Shorts', robots: { index: false } };

export default function Page({ params }) {
  const id = /^[0-9a-f-]{36}$/i.test(String(params.id)) ? String(params.id) : 'x';
  return <ShortsFeed firstId={id} />;
}
