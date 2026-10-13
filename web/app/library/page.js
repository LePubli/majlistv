'use client';
// Ma bibliothèque : "Continuer à regarder" et favoris.
import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useApp } from '../../components/Providers';
import TalkCard from '../../components/TalkCard';
import SeriesCard from '../../components/SeriesCard';
import { clock } from '../../lib/clock';

export default function Library() {
  const { user, ready, t, call } = useApp();
  const router = useRouter();
  const [cont, setCont] = useState(null);
  const [favs, setFavs] = useState(null);
  const [mine, setMine] = useState(null);
  const [todo, setTodo] = useState([]);
  const [notes, setNotes] = useState([]);

  useEffect(() => { if (ready && !user) router.replace('/login'); }, [ready, user, router]);
  const load = useCallback(() => {
    call('/me/continue').then((r) => setCont(r.ok ? r.data : []));
    call('/me/favorites').then((r) => setFavs(r.ok ? r.data : []));
    call('/me/series').then((r) => setMine(r.ok ? r.data : []));
    call('/me/quiz/todo').then((r) => setTodo(r.ok ? r.data : []));
    call('/me/notes').then((r) => setNotes(r.ok ? r.data : []));
  }, [call]);
  useEffect(() => { if (user) load(); }, [user, load]);
  if (!user) return null;

  const dropProgress = async (id) => { setCont((l) => l.filter((x) => x.id !== id)); await call(`/me/progress/${id}`, { method: 'DELETE' }); };
  const dropFav = async (id) => { setFavs((l) => l.filter((x) => x.id !== id)); await call(`/me/favorites/${id}`, { method: 'DELETE' }); };

  const dropNote = async (gid, nid) => {
    setNotes((l) => l.map((g) => (g.talkId === gid ? { ...g, notes: g.notes.filter((n) => n.id !== nid) } : g)).filter((g) => g.notes.length));
    await call(`/me/notes/${nid}`, { method: 'DELETE' });
  };
  const noteHref = (g, n) => `${g.slug ? `/conferences/${g.slug}` : `/talks/${g.talkId}`}?t=${Math.floor(n.positionMs / 1000)}`;

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
      <h2>{t('ntLibTitle')}</h2>
      {notes.length === 0 && <p className="meta">{t('ntLibEmpty')}</p>}
      <div className="lib-notes">
        {notes.map((g) => (
          <section key={g.talkId} className="lib-note-group">
            <h3><Link href={g.slug ? `/conferences/${g.slug}` : `/talks/${g.talkId}`}>{g.title}</Link></h3>
            <ul className="notes-list">
              {g.notes.map((n) => (
                <li key={n.id} className={n.body ? 'note' : 'note bm'}>
                  <Link className="note-time" href={noteHref(g, n)}>{n.body ? '📝' : '🔖'} {clock(n.positionMs)}</Link>
                  <div className="note-body">
                    {n.body ? <p>{n.body}</p> : <p className="meta">{t('ntBookmark')}</p>}
                    <span className="note-btns"><button type="button" className="link" onClick={() => dropNote(g.talkId, n.id)}>{t('ntDelete')}</button></span>
                  </div>
                </li>
              ))}
            </ul>
          </section>
        ))}
      </div>
      <h2>{t('myFavorites')}</h2>
      {favs && favs.length === 0 && <p className="meta">{t('noFavorites')} <Link href="/">{t('browseCatalog')}</Link></p>}
      <div className="grid">
        {(favs || []).map((x) => <TalkCard key={x.id} talk={x} t={t} onRemove={() => dropFav(x.id)} removeLabel={t('removeFav')} />)}
      </div>
    </main>
  );
}
