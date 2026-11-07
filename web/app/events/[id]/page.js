'use client';
// Fiche d'un événement : décompte, direct intégré (YouTube / Vimeo) dès l'ouverture, rappel, agenda, rediffusion.
import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useApp } from '../../../components/Providers';
import { CalendarLink, PhaseBadge, RemindButton, evDate, useNow } from '../../../components/EventBits';
import { embedSrc } from '../../../lib/events';

export default function EventPage() {
  const { id } = useParams();
  const { t, call, feat, locale } = useApp();
  const [ev, setEv] = useState(undefined); // undefined : chargement ; null : introuvable
  const now = useNow(ev && ev.phase !== 'ended' && ev.phase !== 'cancelled');
  const load = useCallback(() => call(`/events/${id}`).then((r) => setEv(r.ok ? r.data : null)), [call, id]);
  useEffect(() => { load(); }, [load]);
  // Passage annoncé → direct → terminé : on relit la fiche à l'heure d'ouverture, puis toutes les minutes pendant le direct.
  useEffect(() => {
    if (!ev || ev.phase === 'ended' || ev.phase === 'cancelled') return undefined;
    const ms = ev.phase === 'upcoming' ? Math.min(new Date(ev.startsAt).getTime() - Date.now() + 1000, 60000) : 60000;
    const h = setTimeout(load, Math.max(ms, 5000));
    return () => clearTimeout(h);
  }, [ev, load]);
  if (!feat('events')) return <main className="page"><p className="meta">{t('evnOff')}</p></main>;
  if (ev === undefined) return <main className="page"><p className="meta">…</p></main>;
  if (ev === null) return <main className="page"><p className="meta">{t('evnMissing')}</p><p><Link href="/events">← {t('evnBack')}</Link></p></main>;
  const src = ev.phase === 'live' ? embedSrc(ev.video) : null;
  return (
    <main className="page evn-page">
      <p><Link href="/events">← {t('evnBack')}</Link></p>
      <div className="evn-head"><PhaseBadge ev={ev} now={now} /></div>
      <h1>{ev.title}</h1>
      {ev.speaker && <p className="meta">{ev.speaker}</p>}
      <p className="meta">{t('evnStarts').replace('{d}', evDate(ev.startsAt, locale))} · {t('evnDuration').replace('{n}', ev.durationMinutes)}</p>
      {src ? (
        <div className="evn-player"><iframe src={src} title={t('evnLiveFrame').replace('{title}', ev.title)} allow="autoplay; encrypted-media; picture-in-picture; fullscreen" allowFullScreen referrerPolicy="strict-origin-when-cross-origin" /></div>
      ) : ev.phase === 'upcoming' ? (
        <p className="evn-note">{t('evnLiveStarts')}</p>
      ) : ev.phase === 'ended' ? (
        <p className="evn-note">{ev.replay ? '' : t('evnNoReplay')}</p>
      ) : null}
      <div className="evn-actions">
        {ev.replay && <Link className="btn" href={`/talks/${ev.replay.talkId}`}>▶ {t('evnReplay')} : {ev.replay.title}</Link>}
        <RemindButton ev={ev} onChange={(v) => setEv((e) => ({ ...e, reminded: v }))} />
        <CalendarLink ev={ev} />
      </div>
      {ev.description && <p className="evn-desc">{ev.description}</p>}
    </main>
  );
}
