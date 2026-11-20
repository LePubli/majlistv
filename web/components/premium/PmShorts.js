'use client';
// Hub « Shorts & découvertes » du thème Premium (maquette V22) : vignettes verticales (durée, titre, chaîne) des vrais shorts publiés
// par le module « Shorts publics ». Un clic ouvre le fil vertical (/shorts/<id>), qui garde le vrai lecteur. Aucun short inventé.
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { useApp } from '../Providers';
import { mmss } from '../ShortsRail';

const PAGE = 24;

export default function PmShorts() {
  const { t, call, ready } = useApp();
  const [list, setList] = useState(null);
  const [done, setDone] = useState(false);
  const [more, setMore] = useState(false);
  useEffect(() => {
    if (!ready) return undefined;
    let dead = false;
    call(`/shorts?limit=${PAGE}`, {}, null).then((r) => { if (dead) return; const a = r.ok && Array.isArray(r.data) ? r.data : []; setList(a); setDone(a.length < PAGE); });
    return () => { dead = true; };
  }, [ready, call]);
  const loadMore = async () => {
    setMore(true);
    const r = await call(`/shorts?limit=${PAGE}&offset=${list.length}`, {}, null);
    const a = r.ok && Array.isArray(r.data) ? r.data : [];
    setList((cur) => { const seen = new Set(cur.map((x) => x.id)); return [...cur, ...a.filter((x) => !seen.has(x.id))]; });
    if (a.length < PAGE) setDone(true);
    setMore(false);
  };
  return (
    <div className="v20-app pm-ott pm-shorts-hub">
      <span className="pm-sh-eyebrow">{t('pmShortsEyebrow')}</span>
      <h1>{t('pmShortsTitleA')} <em>{t('pmShortsTitleB')}</em></h1>
      <p className="pm-sh-intro">{t('pmShortsIntro')}</p>
      {list && list.length === 0 && <p className="pm-sh-empty">{t('shrNone')}</p>}
      <ul className="pm-sh-grid" aria-busy={list === null}>
        {(list || []).map((s) => (
          <li key={s.id}>
            <Link href={`/shorts/${s.id}`} className="pm-sh-card" style={s.posterUrl ? { '--poster': `url("${String(s.posterUrl).replace(/"/g, '%22')}")` } : undefined} aria-label={s.title}>
              <span className="pm-sh-tag">{t('pmShortTag')}</span>
              {s.duration != null && <span className="pm-sh-dur">{mmss(s.duration)}</span>}
              <span className="pm-sh-play" aria-hidden="true">▶</span>
              <span className="pm-sh-copy"><b>{s.title}</b>{s.channel?.name && <small>{s.channel.name}</small>}</span>
            </Link>
          </li>
        ))}
      </ul>
      {list && !done && <div className="v20-cv11-more"><button type="button" onClick={loadMore} disabled={more}>{t('pmShowMore')} ↓</button></div>}
    </div>
  );
}
