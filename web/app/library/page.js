'use client';
// Ma bibliothèque. Étape N5 (16/11) : 4 onglets — Reprendre · Ma liste (favoris + « à regarder plus tard » réunis) · Listes · Notes.
// Les chaînes suivies sont dans Catalogue → Chaînes. Anciennes adresses : ?tab=favs et ?tab=later → Ma liste ; ?tab=follows → /chaines.
import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useApp } from '../../components/Providers';
import TalkCard from '../../components/TalkCard';
import EmptyState from '../../components/EmptyState';
import SeriesCard from '../../components/SeriesCard';
import { clock } from '../../lib/clock';
import ListsPanel from '../../components/ListsPanel';
import Crumbs from '../../components/Crumbs';
import { TabBar, TabPanel, useTab } from '../../components/Tabs';

// Anciens onglets (avant N5) → nouvel onglet.
export const LEGACY_TABS = { favs: ['list'], later: ['list'] };

// « Ma liste » : vidéos gardées pour plus tard d'abord (avec leur avancement), puis les favoris, sans doublon.
export function mergeMyList(lat, favs) {
  const seen = new Set();
  const out = [];
  for (const [x, src] of [...(lat || []).map((v) => [v, 'later']), ...(favs || []).map((v) => [v, 'fav'])]) {
    if (seen.has(x.id)) { const o = out.find((y) => y.id === x.id); o.srcs.push(src); continue; }
    seen.add(x.id);
    out.push({ ...x, srcs: [src] });
  }
  return out;
}

export default function Library() {
  const { user, ready, t, call, feat , later, toggleLater } = useApp();
  const router = useRouter();
  const [cont, setCont] = useState(null);
  const [favs, setFavs] = useState(null);
  const [lat, setLat] = useState(null); // « À regarder plus tard »
  const [mine, setMine] = useState(null);
  const [todo, setTodo] = useState([]);
  const [notes, setNotes] = useState([]);

  const myList = feat('watchlater') || feat('favorites');
  const tabs = [
    { id: 'resume', label: t('tbResume') },
    ...(myList ? [{ id: 'list', label: t('lbMyList') }] : []),
    ...(feat('lists') ? [{ id: 'lists', label: t('tbLists') }] : []),
    ...(feat('notes') ? [{ id: 'notes', label: t('tbNotes') }] : []),
  ];
  const [tab, go] = useTab(tabs, undefined, LEGACY_TABS);
  const params = useSearchParams();
  const wantFollows = params.get('tab') === 'follows';
  useEffect(() => { if (wantFollows) router.replace('/chaines#suivies'); }, [wantFollows, router]);
  useEffect(() => { if (ready && !user) router.replace('/login'); }, [ready, user, router]);
  const load = useCallback(() => {
    call('/me/continue').then((r) => setCont(r.ok ? r.data : []));
    call('/me/favorites').then((r) => setFavs(r.ok ? r.data : []));
    if (feat('watchlater')) call('/me/watchlater').then((r) => setLat(r.ok ? r.data : []));
    call('/me/series').then((r) => setMine(r.ok ? r.data : []));
    call('/me/quiz/todo').then((r) => setTodo(r.ok ? r.data : []));
    call('/me/notes').then((r) => setNotes(r.ok ? r.data : []));
  }, [call, feat]);
  useEffect(() => { if (user) load(); }, [user, load]);
  if (!user) return null;

  const dropProgress = async (id) => { setCont((l) => l.filter((x) => x.id !== id)); await call(`/me/progress/${id}`, { method: 'DELETE' }); };
  const dropLater = async (id) => { setLat((l) => l.filter((x) => x.id !== id)); if (later?.has(id)) await toggleLater(id); else await call(`/me/watchlater/${id}`, { method: 'DELETE' }); };
  const dropFav = async (id) => { setFavs((l) => l.filter((x) => x.id !== id)); await call(`/me/favorites/${id}`, { method: 'DELETE' }); };
  // Retirer de « Ma liste » : on retire des deux (favoris et plus tard) là où la vidéo se trouve.
  const dropMine = async (x) => {
    if (x.srcs.includes('later')) await dropLater(x.id);
    if (x.srcs.includes('fav')) await dropFav(x.id);
  };
  const mine2 = mergeMyList(feat('watchlater') ? lat : [], feat('favorites') ? favs : []);
  const listReady = (!feat('watchlater') || lat) && (!feat('favorites') || favs);

  const dropNote = async (gid, nid) => {
    setNotes((l) => l.map((g) => (g.talkId === gid ? { ...g, notes: g.notes.filter((n) => n.id !== nid) } : g)).filter((g) => g.notes.length));
    await call(`/me/notes/${nid}`, { method: 'DELETE' });
  };
  const noteHref = (g, n) => `${g.slug ? `/conferences/${g.slug}` : `/talks/${g.talkId}`}?t=${Math.floor(n.positionMs / 1000)}`;

  return (
    <main className="page">
      <Crumbs items={[[null, t('msSpace')], ['/library', t('library')], ...(tab !== 'resume' ? [[null, tabs.find((x) => x.id === tab).label]] : [])]} />
      <h1>{t('library')}</h1>
      <TabBar tabs={tabs} current={tab} onChange={go} label={t('tbLabel')} />

      <TabPanel id="resume" current={tab}>
        {todo.length > 0 && (
          <>
            <h2>{t('qpTodoRow')}</h2>
            <div className="grid">{todo.map((x) => <TalkCard key={x.id} talk={x} t={t} />)}</div>
          </>
        )}
        <h2>{t('continueWatching')}</h2>
        {cont && cont.length === 0 && <EmptyState compact text={t('nothingToContinue')} actions={[{ href: '/catalogue', label: t('esFindTalk') }]} />}
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
      </TabPanel>

      <TabPanel id="list" current={tab}>
        <p className="meta">{t('lbMyListIntro')}</p>
        {listReady && mine2.length === 0 && <EmptyState text={t('lbMyListEmpty')} actions={[{ href: '/catalogue', label: t('esFindTalk') }]} />}
        <div className="grid">
          {mine2.map((x) => <TalkCard key={x.id} talk={x} t={t} progress={x.positionMs && x.durationSeconds ? x.positionMs / (x.durationSeconds * 1000) : 0} onRemove={() => dropMine(x)} removeLabel={t('lbMyListRemove')} />)}
        </div>
      </TabPanel>

      <TabPanel id="lists" current={tab}><ListsPanel /></TabPanel>

      <TabPanel id="notes" current={tab}>
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
      </TabPanel>
    </main>
  );
}
