'use client';
// Événements en direct : liste des événements à venir et passés.
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useApp } from '../../components/Providers';
import { CalendarLink, PhaseBadge, RemindButton, evDate, useNow } from '../../components/EventBits';

export default function EventsPage() {
  const { t, call, feat, locale } = useApp();
  const [scope, setScope] = useState('upcoming');
  const [list, setList] = useState(null);
  const now = useNow(scope === 'upcoming');
  useEffect(() => {
    let dead = false; setList(null);
    call(`/events?scope=${scope}`).then((r) => { if (!dead) setList(r.ok ? r.data : []); });
    return () => { dead = true; };
  }, [scope, call]);
  if (!feat('events')) return <main className="page"><p className="meta">{t('evnOff')}</p></main>;
  const patch = (id, reminded) => setList((l) => l.map((e) => (e.id === id ? { ...e, reminded } : e)));
  return (
    <main className="page evn-page">
      <h1>{t('evnTitle')}</h1>
      <p className="meta">{t('evnIntro')}</p>
      <div className="aw-cats" role="tablist">
        {['upcoming', 'past'].map((k) => <button key={k} type="button" role="tab" aria-selected={scope === k} className={`chip${scope === k ? ' on' : ''}`} onClick={() => setScope(k)}>{t(k === 'upcoming' ? 'evnUpcoming' : 'evnPast')}</button>)}
      </div>
      {!list ? <p className="meta">…</p> : list.length === 0 ? <p className="meta">{t(scope === 'upcoming' ? 'evnEmpty' : 'evnEmptyPast')}</p> : (
        <ul className="evn-list">
          {list.map((e) => (
            <li key={e.id} className="evn-card">
              <div className="evn-head"><PhaseBadge ev={e} now={now} /><span className="meta">{evDate(e.startsAt, locale)}</span></div>
              <h2><Link href={`/events/${e.id}`}>{e.title}</Link></h2>
              {e.speaker && <p className="meta">{e.speaker}</p>}
              <div className="evn-actions">
                {e.phase === 'live' && <Link className="btn" href={`/events/${e.id}`}>▶ {t('evnWatch')}</Link>}
                {e.replay && <Link className="btn" href={`/talks/${e.replay.talkId}`}>▶ {t('evnReplay')}</Link>}
                <RemindButton ev={e} onChange={(v) => patch(e.id, v)} />
                <CalendarLink ev={e} />
              </div>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
