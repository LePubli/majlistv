'use client';
// Hub « Shorts & découvertes » du thème Premium (maquette V22) : vignettes verticales (durée, titre, chaîne) des vrais shorts publiés
// par le module « Shorts publics ». Un clic ouvre le short dans une carte (lecteur en carte, PmShortCard) sans quitter la page ; un clic du milieu
// ou Ctrl + clic ouvre le fil vertical (/shorts/<id>). Pastilles de thèmes (catégories principales de la vidéo du short). Aucun short inventé.
import { useEffect, useRef, useState } from 'react';
import { useApp } from '../Providers';
import PmShortCard from './PmShortCard';
import PmShortTile from './PmShortTile';

const PAGE = 24;

export default function PmShorts() {
  const { t, call, ready } = useApp();
  const [list, setList] = useState(null);
  const [done, setDone] = useState(false);
  const [more, setMore] = useState(false);
  const [themes, setThemes] = useState([]);
  const [theme, setTheme] = useState(null); // slug du thème choisi, null = tous
  const [open, setOpen] = useState(null); // position du short ouvert dans la carte
  const opener = useRef(null);
  const qs = (extra = '') => `limit=${PAGE}${extra}${theme ? `&theme=${encodeURIComponent(theme)}` : ''}`;
  useEffect(() => {
    if (!ready) return;
    call('/shorts/themes', {}, null).then((r) => setThemes(r.ok && Array.isArray(r.data) ? r.data : []));
  }, [ready, call]);
  useEffect(() => {
    if (!ready) return undefined;
    let dead = false;
    setList(null); setOpen(null);
    call(`/shorts?${qs()}`, {}, null).then((r) => { if (dead) return; const a = r.ok && Array.isArray(r.data) ? r.data : []; setList(a); setDone(a.length < PAGE); });
    return () => { dead = true; };
  }, [ready, call, theme]); // eslint-disable-line react-hooks/exhaustive-deps
  const loadMore = async () => {
    if (more || done || !list) return;
    setMore(true);
    const r = await call(`/shorts?${qs(`&offset=${list.length}`)}`, {}, null);
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
      {themes.length > 0 && (
        <nav className="pm-sh-themes" aria-label={t('pmShThemes')}>
          <button type="button" className={theme === null ? 'on' : ''} aria-pressed={theme === null} onClick={() => setTheme(null)}>{t('pmShAll')}</button>
          {themes.map((x) => <button key={x.slug} type="button" className={theme === x.slug ? 'on' : ''} aria-pressed={theme === x.slug} onClick={() => setTheme(x.slug)}>{x.name} <small>{x.count}</small></button>)}
        </nav>
      )}
      {list && list.length === 0 && <p className="pm-sh-empty">{t('shrNone')}</p>}
      <ul className="pm-sh-grid" aria-busy={list === null}>
        {(list || []).map((s, i) => (
          <li key={s.id}>
            <PmShortTile s={s} onOpen={(el) => { opener.current = el; setOpen(i); }} />
          </li>
        ))}
      </ul>
      {open != null && list && list[open] && (
        <PmShortCard items={list} index={open} onIndex={setOpen} onNearEnd={() => { if (!done) loadMore(); }}
          onClose={() => { setOpen(null); setTimeout(() => opener.current?.focus(), 0); }} />
      )}
      {list && !done && <div className="v20-cv11-more"><button type="button" onClick={loadMore} disabled={more}>{t('pmShowMore')} ↓</button></div>}
    </div>
  );
}
