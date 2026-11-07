'use client';
// Morceaux communs des pages « Événements en direct » : date, pastille de phase, bouton « Me rappeler », lien agenda.
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useApp } from './Providers';
import { fmtCountdown } from '../lib/events';

export const evDate = (iso, locale) => new Date(iso).toLocaleString(locale, { weekday: 'long', day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' });

// Horloge partagée d'une page : se met à jour chaque seconde (le décompte), sans réseau.
export function useNow(active = true) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => { if (!active) return undefined; const id = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(id); }, [active]);
  return now;
}

export function PhaseBadge({ ev, now }) {
  const { t } = useApp();
  const units = { d: t('evnD'), h: t('evnH'), m: t('evnM'), s: t('evnS') };
  if (ev.phase === 'cancelled') return <span className="evn-badge off">{t('evnCancelled')}</span>;
  if (ev.phase === 'ended') return <span className="evn-badge">{t('evnEnded')}</span>;
  if (ev.phase === 'live') return <span className="evn-badge live"><i aria-hidden="true" /> {t('evnLive')}</span>;
  return <span className="evn-badge soon">{t('evnSoon').replace('{t}', fmtCountdown(new Date(ev.startsAt).getTime() - now, units))}</span>;
}

// « Me rappeler » : inscription du membre connecté ; un visiteur est invité à se connecter.
export function RemindButton({ ev, onChange }) {
  const { t, call, user } = useApp();
  const [busy, setBusy] = useState(false);
  if (ev.phase === 'ended' || ev.phase === 'cancelled') return null;
  if (!user) return <Link className="btn ghost" href="/login">{t('evnLoginRemind')}</Link>;
  const toggle = async () => {
    setBusy(true);
    const r = await call(`/me/events/${ev.id}/remind`, { method: ev.reminded ? 'DELETE' : 'PUT' });
    setBusy(false);
    if (r.ok) onChange?.(r.data.reminded);
  };
  return <button type="button" className={ev.reminded ? 'btn ghost on' : 'btn'} onClick={toggle} disabled={busy} aria-pressed={ev.reminded}>{ev.reminded ? `✓ ${t('evnReminded')}` : `🔔 ${t('evnRemind')}`}</button>;
}

export const CalendarLink = ({ ev }) => {
  const { t } = useApp();
  return ev.phase === 'ended' || ev.phase === 'cancelled' ? null : <a className="btn ghost" href={`/api/events/${ev.id}/calendar.ics`} download>📅 {t('evnCalendar')}</a>;
};
