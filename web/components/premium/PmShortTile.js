'use client';
// Tuile Short du thème Premium (maquette V22) : affiche verticale 9:16, étiquette « SHORT », durée, bouton lecture, titre et thème.
// Utilisée par le hub /shorts (clic = lecteur en carte, via onOpen) et par la rangée de l'accueil (clic = fil vertical du short).
import Link from 'next/link';
import { useApp } from '../Providers';
import { mmss } from '../ShortsRail';

/** Libellé sous le titre : le thème principal du short (« Spiritualité », « Histoire »…), à défaut la chaîne. */
export const shortSub = (s) => s?.themes?.[0]?.name || s?.channel?.name || '';

export default function PmShortTile({ s, href, onOpen }) {
  const { t } = useApp();
  const sub = shortSub(s);
  const plain = (e) => e.button === 0 && !e.metaKey && !e.ctrlKey && !e.shiftKey && !e.altKey;
  return (
    <Link href={href || `/shorts/${s.id}`} className="pm-sh-card" data-short={s.id} aria-label={s.title}
      onClick={onOpen ? (e) => { if (plain(e)) { e.preventDefault(); onOpen(e.currentTarget); } } : undefined}
      style={s.posterUrl ? { '--poster': `url("${String(s.posterUrl).replace(/"/g, '%22')}")` } : undefined}>
      <span className="pm-sh-tag">{t('pmShortTag')}</span>
      {s.duration != null && <span className="pm-sh-dur">{mmss(s.duration)}</span>}
      <span className="pm-sh-play" aria-hidden="true">▶</span>
      <span className="pm-sh-copy"><b>{s.title}</b>{sub && <small>{sub}</small>}</span>
    </Link>
  );
}
