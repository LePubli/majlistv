'use client';
// Page d'une collection, thème Premium : en-tête immersif (fond = affiche de la vidéo survolée, titre géant, boutons),
// grille des vidéos et rangée « Autres collections ». Les données viennent de GET /collections/:id et GET /collections.
import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useApp } from '../Providers';
import TalkCard from '../TalkCard';

/** « 2 h 15 » ou « 48 min » à partir d'un total de secondes. */
export function totalTime(talks, t) {
  const min = Math.round(talks.reduce((n, x) => n + (x.durationSeconds || 0), 0) / 60);
  if (!min) return '';
  return min >= 60 ? `${Math.floor(min / 60)} h ${String(min % 60).padStart(2, '0')}` : `${min} ${t('minutes')}`;
}

/** Fond de l'en-tête : deux calques en fondu enchaîné, la vidéo survolée dans la grille prend la place de la précédente. */
export function PmColHero({ c, bg, children }) {
  const { t } = useApp();
  const talks = c.talks || [];
  const posters = talks.filter((x) => x.posterUrl);
  const cur = posters.find((x) => x.id === bg) || posters[0];
  const cover = c.coverUrl || null; // couverture choisie dans le Studio : elle remplace l'affiche des vidéos
  const [layers, setLayers] = useState(() => [cover || cur?.posterUrl || null, null]);
  const [front, setFront] = useState(0);
  useEffect(() => {
    const url = cover || cur?.posterUrl || null;
    setLayers((l) => {
      if (l[front] === url) return l;
      const next = [...l]; next[1 - front] = url; return next;
    });
    setFront((f) => (layers[f] === url ? f : 1 - f));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cur?.posterUrl, cover]);
  const speakers = new Set(talks.map((x) => x.speaker).filter(Boolean)).size;
  const time = totalTime(talks, t);
  const first = talks[0];
  const [shared, setShared] = useState(false);
  const share = async () => {
    const url = typeof window !== 'undefined' ? window.location.href : '';
    try { if (navigator.share) { await navigator.share({ title: c.title, url }); return; } } catch { return; }
    try { await navigator.clipboard.writeText(url); setShared(true); setTimeout(() => setShared(false), 2000); } catch { /* sans presse-papiers : rien */ }
  };
  return (
    <header className="pm-col-hero">
      {[0, 1].map((i) => (
        <span key={i} className={`pm-col-bg${front === i ? ' on' : ''}`} aria-hidden="true"
          style={layers[i] ? { backgroundImage: `url("${String(layers[i]).replace(/"/g, '%22')}")` } : undefined} />
      ))}
      <span className="pm-col-shade" aria-hidden="true" />
      <div className="pm-col-in">
        <Link href="/collections" className="pm-col-back">← {t('colTitle')}</Link>
        <p className="pm-col-kicker"><i aria-hidden="true" />{t(`colKind_${c.kind}`)}</p>
        <h1>{c.title}</h1>
        {c.description && <p className="pm-col-lead">{c.description}</p>}
        <p className="pm-col-meta">
          <span>{talks.length} {t(talks.length > 1 ? 'pmColVideos' : 'pmColVideo')}</span>
          {time && <span>{time}</span>}
          {speakers > 1 && <span>{speakers} {t('pmColSpeakers')}</span>}
        </p>
        <div className="pm-col-cta">
          {first && <Link href={`/talks/${first.id}`} className="pm-col-play"><span aria-hidden="true">▶</span> {t('pmColPlayAll')}</Link>}
          <button type="button" className="pm-col-share" onClick={share}>{shared ? `✓ ${t('pmColCopied')}` : `↗ ${t('pmColShare')}`}</button>
        </div>
        {children}
      </div>
    </header>
  );
}

/** Grille des vidéos : le numéro d'ordre s'affiche pour les cycles et les séries d'un intervenant. */
export function PmColGrid({ c, onHover }) {
  const { t } = useApp();
  const numbered = c.kind === 'cycle' || c.kind === 'speaker';
  return (
    <section className="pm-col-body">
      <h2 className="pm-col-h">{t('pmColIn')} <small>{(c.talks || []).length}</small></h2>
      <ul className="pm-col-grid">
        {(c.talks || []).map((x, i) => (
          <li key={x.id} className="pm-col-item" onMouseEnter={() => onHover?.(x.id)} onFocus={() => onHover?.(x.id)}>
            {numbered && <span className="pm-col-n" aria-hidden="true">{String(i + 1).padStart(2, '0')}</span>}
            <TalkCard talk={x} t={t} />
          </li>
        ))}
      </ul>
    </section>
  );
}

/** Rangée des autres collections publiées (celle-ci exclue). */
export function PmColMore({ currentId }) {
  const { t, call } = useApp();
  const [list, setList] = useState([]);
  useEffect(() => {
    let live = true;
    call('/collections', {}, null).then((r) => { if (live && r.ok && Array.isArray(r.data)) setList(r.data); });
    return () => { live = false; };
  }, [call]);
  const others = useMemo(() => list.filter((x) => String(x.id) !== String(currentId)).slice(0, 6), [list, currentId]);
  if (!others.length) return null;
  return (
    <section className="pm-col-body pm-col-more">
      <h2 className="pm-col-h">{t('pmColMore')}</h2>
      <ul className="pm-col-rail">
        {others.map((x) => (
          <li key={x.id}>
            <Link href={`/collections/${x.id}`} className="pm-col-tile" style={x.posterUrl ? { backgroundImage: `url("${String(x.posterUrl).replace(/"/g, '%22')}")` } : undefined}>
              <span className="pm-col-tile-k">{t(`colKind_${x.kind}`)}</span>
              <b>{x.title}</b>
              <small>{x.talks} {t(x.talks > 1 ? 'pmColVideos' : 'pmColVideo')}</small>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
