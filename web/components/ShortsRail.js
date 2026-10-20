'use client';
// Shorts publics : vignette verticale 9:16, rangée (accueil) et grille (page d'une chaîne). Le fil vertical est dans ShortsFeed.js.
import Link from 'next/link';
import { useApp } from './Providers';

export const mmss = (s) => {
  const n = Math.max(0, Math.round(Number(s) || 0));
  return `${Math.floor(n / 60)}:${String(n % 60).padStart(2, '0')}`;
};

export function ShortCard({ s, href }) {
  const { t, locale } = useApp();
  return (
    <Link href={href || `/shorts/${s.id}`} className="sh-card" data-short={s.id}>
      <span className="sh-card-thumb" style={s.posterUrl ? { backgroundImage: `url(${s.posterUrl})` } : undefined}>
        <span className="sh-card-play" aria-hidden="true">▶</span>
        {s.duration != null && <span className="sh-card-dur">{mmss(s.duration)}</span>}
      </span>
      <b className="sh-card-title">{s.title}</b>
      <span className="sh-card-meta">{s.channel?.name ? `${s.channel.name} · ` : ''}{t('shrViews').replace('{n}', Number(s.views || 0).toLocaleString(locale))}</span>
    </Link>
  );
}

// Rangée qui défile (téléphone : au doigt ; ordinateur : trackpad, molette ou barre).
export function ShortsRail({ list, channel, base = '/shorts' }) {
  const q = channel ? `?channel=${encodeURIComponent(channel)}` : '';
  return (
    <ul className="sh-rail">
      {list.map((s) => <li key={s.id}><ShortCard s={s} href={`${base}/${s.id}${q}`} /></li>)}
    </ul>
  );
}

export function ShortsGrid({ list, channel, base = '/shorts' }) {
  const q = channel ? `?channel=${encodeURIComponent(channel)}` : '';
  return (
    <ul className="sh-grid">
      {list.map((s) => <li key={s.id}><ShortCard s={s} href={`${base}/${s.id}${q}`} /></li>)}
    </ul>
  );
}
