'use client';
// Ma bibliothèque : "Continuer à regarder" et favoris.
import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useApp } from '../../components/Providers';
import TalkCard from '../../components/TalkCard';
import SeriesCard from '../../components/SeriesCard';

export default function Library() {
  const { user, ready, t, call } = useApp();
  const router = useRouter();
  const [cont, setCont] = useState(null);
  const [favs, setFavs] = useState(null);
  const [mine, setMine] = useState(null);
  const [todo, setTodo] = useState([]);

  useEffect(() => { if (ready && !user) router.replace('/login'); }, [ready, user, router]);
  const load = useCallback(() => {
    call('/me/continue').then((r) => setCont(r.ok ? r.data : []));
    call('/me/favorites').then((r) => setFavs(r.ok ? r.data : []));
    call('/me/series').then((r) => setMine(r.ok ? r.data : []));
    call('/me/quiz/todo').then((r) => setTodo(r.ok ? r.data : []));
  }, [call]);
  useEffect(() => { if (user) load(); }, [user, load]);
  if (!user) return null;

  const dropProgress = async (id) => { setCont((l) => l.filter((x) => x.id !== id)); await call(`/me/progress/${id}`, { method: 'DELETE' }); };
  const dropFav = async (id) => { setFavs((l) => l.filter((x) => x.id !== id)); await call(`/me/favorites/${id}`, { method: 'DELETE' }); };

  return (
    <main className="page">
      <h1>{t('library')}</h1>
      {todo.length > 0 && (
        <>
          <h2>{t('qpTodoRow')}</h2>
          <div className="grid">{todo.map((x) => <TalkCard key={x.id} talk={x} t={t} />)}</div>
        </>
      )}
      <h2>{t('continueWatching')}</h2>
      {cont && cont.length === 0 && <p className="meta">{t('nothingToContinue')}</p>}
      <div className="grid">
        {(cont || []).map((x) => (
          <TalkCard key={x.id} talk={x} t={t} progress={x.durationMs ? x.positionMs / x.durationMs : 0} onRemove={() => dropProgress(x.id)} removeLabel={t('removeFromList')} />
        ))}
      </div>
      {mine && mine.length > 0 && (
        <>
          <h2>{t('mySeries')}</h2>
          <div className="grid">{mine.map((x) => <SeriesCard key={x.id} series={x} t={t} />)}</div>
        </>
      )}
      <h2>{t('myFavorites')}</h2>
      {favs && favs.length === 0 && <p className="meta">{t('noFavorites')} <Link href="/">{t('browseCatalog')}</Link></p>}
      <div className="grid">
        {(favs || []).map((x) => <TalkCard key={x.id} talk={x} t={t} onRemove={() => dropFav(x.id)} removeLabel={t('removeFav')} />)}
      </div>
    </main>
  );
}
