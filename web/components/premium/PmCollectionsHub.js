'use client';
// Liste des collections, thème Premium : en-tête immersif sur la collection à la une (épinglée en priorité),
// pastilles pour changer de une, filtres par type, puis une rangée de grandes cartes par type (cycles, séries, thèmes).
import { useMemo, useState } from 'react';
import Link from 'next/link';
import { useApp } from '../Providers';

const KINDS = ['cycle', 'speaker', 'theme'];
const bgUrl = (u) => `url("${String(u).replace(/"/g, '%22')}")`;

export default function PmCollectionsHub({ list }) {
  const { t } = useApp();
  const [kind, setKind] = useState('all');
  const [pick, setPick] = useState(null);
  const featured = useMemo(() => {
    const byId = list.find((c) => c.id === pick);
    return byId || list.find((c) => c.pinned && c.posterUrl) || list.find((c) => c.posterUrl) || list[0];
  }, [list, pick]);
  const strip = useMemo(() => [...list].sort((a, b) => Number(b.pinned) - Number(a.pinned)).slice(0, 6), [list]);
  const kinds = KINDS.filter((k) => list.some((c) => c.kind === k));
  if (!featured) return null;
  const shown = kind === 'all' ? kinds : [kind];
  return (
    <>
      <header className="pm-cl-hero">
        <span className="pm-cl-bg" key={featured.id} aria-hidden="true" style={featured.posterUrl ? { backgroundImage: bgUrl(featured.posterUrl) } : undefined} />
        <span className="pm-col-shade" aria-hidden="true" />
        <div className="pm-col-in">
          <p className="pm-col-kicker"><i aria-hidden="true" />{featured.pinned ? t('colPinned') : t(`colKind_${featured.kind}`)}</p>
          <h1 key={`t${featured.id}`}>{featured.title}</h1>
          {featured.description && <p className="pm-col-lead">{featured.description}</p>}
          <p className="pm-col-meta"><span>{t(`colKind_${featured.kind}`)}</span><span>{featured.talks} {t(featured.talks > 1 ? 'pmColVideos' : 'pmColVideo')}</span></p>
          <div className="pm-col-cta">
            <Link href={`/collections/${featured.id}`} className="pm-col-play"><span aria-hidden="true">▶</span> {t('pmColsOpen')}</Link>
          </div>
          {strip.length > 1 && (
            <ul className="pm-cl-strip" aria-label={t('colTitle')}>
              {strip.map((c) => (
                <li key={c.id}>
                  <button type="button" aria-pressed={c.id === featured.id} aria-label={c.title} onClick={() => setPick(c.id)}
                    className={c.id === featured.id ? 'on' : ''} style={c.posterUrl ? { backgroundImage: bgUrl(c.posterUrl) } : undefined}>
                    <span>{c.title}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </header>
      <div className="pm-col-body pm-cl-body">
        {kinds.length > 1 && (
          <div className="pm-cl-chips" role="group" aria-label={t('colTitle')}>
            {['all', ...kinds].map((k) => (
              <button key={k} type="button" aria-pressed={kind === k} className={kind === k ? 'on' : ''} onClick={() => setKind(k)}>
                {k === 'all' ? t('pmColsAll') : t(`pmColsPl_${k}`)}
              </button>
            ))}
          </div>
        )}
        {shown.map((k) => (
          <section key={k} className="pm-cl-sec">
            <h2 className="pm-col-h">{t(`pmColsPl_${k}`)} <small>{list.filter((c) => c.kind === k).length}</small></h2>
            <ul className="pm-cl-rail">
              {list.filter((c) => c.kind === k).map((c) => (
                <li key={c.id}>
                  <Link href={`/collections/${c.id}`} className="pm-cl-card" style={c.posterUrl ? { backgroundImage: bgUrl(c.posterUrl) } : undefined}>
                    {c.pinned && <span className="pm-cl-pin">{t('colPinned')}</span>}
                    <span className="pm-cl-copy"><b>{c.title}</b>{c.description && <em>{c.description}</em>}<small>{c.talks} {t(c.talks > 1 ? 'pmColVideos' : 'pmColVideo')}</small></span>
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        ))}
      </div>
    </>
  );
}
