'use client';
// Accueil : bande « Prochains événements en direct » (3 au plus). Invisible s'il n'y en a pas ou si la fonction est coupée.
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useApp } from './Providers';
import { PhaseBadge, evDate, useNow } from './EventBits';

export default function EventsBand() {
  const { t, call, feat, locale, ready } = useApp();
  const [list, setList] = useState([]);
  const on = feat('events');
  const now = useNow(list.length > 0);
  useEffect(() => {
    if (!on || !ready) return undefined;
    let dead = false;
    call('/events?scope=upcoming').then((r) => { if (!dead && r.ok) setList(r.data.filter((e) => e.phase !== 'cancelled').slice(0, 3)); });
    return () => { dead = true; };
  }, [on, ready, call]);
  if (!on || list.length === 0) return null;
  return (
    <section className="row evn-band" aria-labelledby="evn-band-h">
      <h2 id="evn-band-h">{t('evnBand')} · <Link href="/events">{t('evnSeeAll')}</Link></h2>
      <ul className="evn-list">
        {list.map((e) => (
          <li key={e.id} className="evn-card">
            <div className="evn-head"><PhaseBadge ev={e} now={now} /><span className="meta">{evDate(e.startsAt, locale)}</span></div>
            <h3><Link href={`/events/${e.id}`}>{e.title}</Link></h3>
            {e.speaker && <p className="meta">{e.speaker}</p>}
          </li>
        ))}
      </ul>
    </section>
  );
}
