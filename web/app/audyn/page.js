'use client';
// Audyn : livres audio et podcasts, présentés comme le catalogue vidéo (même style « Netflix ») :
//  - bannière défilante des derniers contenus (couverture nette + fond flouté, « ▶ Écouter » reprend là où l'on s'était arrêté) ;
//  - rangées horizontales : « Continuer l'écoute » (livres commencés sur cet appareil), « Nouveautés », une rangée par catégorie,
//    « Autres » (sans catégorie) ; « Tout voir » ouvre la grille (/audyn?cat=…, /audyn?all=1) ;
//  - recherche : résultats en grille.
// Vignettes au format des vidéos (16:9) : la couverture carrée d'une vidéo importée garde l'image de la vidéo au centre.
import { Suspense, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useApp } from '../../components/Providers';
import { useAudyn } from '../../components/AudynPlayer';
import Row from '../../components/Row';
import { useReducedMotion } from '../../components/HomeHero';
import { continueCandidates, fmtLong, listenState } from '../../lib/audyn';

const HERO_MAX = 5;
const ROW_MAX = 20;
const OTHER = '__other__';

export default function AudynPage() {
  return <Suspense fallback={<main aria-busy="true" className="catalogue" />}><AudynHome /></Suspense>;
}

const chaptersText = (b, t) => (b.chapters === 1 ? t('awChapter1') : t('awChapters').replace('{n}', b.chapters));

// Vignette d'un contenu Audyn, mêmes classes que la vignette vidéo (TalkCard).
function AudynCard({ b, t, progress = 0, sub }) {
  return (
    <div className="talk-wrap">
      <Link href={`/audyn/${b.id}`} className="talk aw-talk">
        <div className="thumb aw-thumb" style={b.coverUrl ? { backgroundImage: `url(${b.coverUrl})` } : undefined}>
          {!b.coverUrl && <span className="aw-thumb-ph" aria-hidden="true">🎧</span>}
          {b.onSale && !b.full ? <span className="badge sale">{t('slBadge')}</span> : !b.full && <span className="badge">{t('awFree')}</span>}
          {b.durationSeconds > 0 && <span className="dur"><bdi>{fmtLong(b.durationSeconds)}</bdi></span>}
          {progress > 0 && <span className="progress"><span style={{ width: `${Math.min(100, Math.round(progress * 100))}%` }} /></span>}
        </div>
        <h3 dir="auto">{b.title}</h3>
        <p>{sub ?? [b.author || b.narrator, chaptersText(b, t)].filter(Boolean).join(' · ')}</p>
      </Link>
    </div>
  );
}

// Bannière : derniers contenus, un toutes les 8 secondes (arrêt au survol, sans animation si « réduire les animations »).
function AudynHero({ items, t, onListen }) {
  const reduced = useReducedMotion();
  const [i, setI] = useState(0);
  const [paused, setPaused] = useState(false);
  const timer = useRef(null);
  const n = items.length;
  useEffect(() => {
    if (reduced || paused || n < 2) return undefined;
    timer.current = setInterval(() => setI((v) => (v + 1) % n), 8000);
    return () => clearInterval(timer.current);
  }, [reduced, paused, n, i]);
  const x = items[Math.min(i, n - 1)];
  return (
    <section className="hero banner has-image featured aw-hero" aria-roledescription="carousel" aria-label={t('awNav')}
      onMouseEnter={() => setPaused(true)} onMouseLeave={() => setPaused(false)} onFocus={() => setPaused(true)} onBlur={() => setPaused(false)}>
      {items.map((it, k) => (
        <div key={it.id} className={`banner-bg aw-hero-bg${k === i ? ' on' : ''}`} style={it.coverUrl ? { backgroundImage: `url(${it.coverUrl})` } : undefined} aria-hidden="true" />
      ))}
      <div className="banner-shade" aria-hidden="true" />
      {x.coverUrl && <img className="aw-hero-art" src={x.coverUrl} alt="" width="320" height="320" />}
      <div className="banner-body" aria-live={paused ? 'polite' : 'off'}>
        <p className="eyebrow">
          <span className={`badge-inline${x.full ? '' : ' premium'}`}>{x.full ? 'Audyn' : t('awFree')}</span>
          {x.category ? ` ${x.category}` : ''}
        </p>
        <h1 dir="auto">{x.title}</h1>
        <p className="banner-meta">{[x.author || x.narrator, chaptersText(x, t), x.durationSeconds > 0 ? fmtLong(x.durationSeconds) : ''].filter(Boolean).join(' · ')}</p>
        {x.summary && <p className="banner-summary" dir="auto">{x.summary}</p>}
        <div className="hero-cta">
          <button type="button" className="btn btn-lg" onClick={() => onListen(x)}>▶ {t('awListen')}</button>
          <Link href={`/audyn/${x.id}`} className="btn ghost btn-lg">{t('moreInfo')}</Link>
        </div>
      </div>
      {n > 1 && (
        <div className="banner-dots" role="group">
          {items.map((it, k) => (
            <button key={it.id} type="button" className={k === i ? 'dot on' : 'dot'} aria-label={t('heroGoTo').replace('{n}', k + 1)} aria-current={k === i} onClick={() => setI(k)} />
          ))}
        </div>
      )}
    </section>
  );
}

function AudynHome() {
  const { t, call, feat } = useApp();
  const sp = useSearchParams();
  const router = useRouter();
  const au = useAudyn();
  const cat = sp.get('cat') || '';
  const all = sp.get('all') === '1';
  const [d, setD] = useState(null);       // { items, categories }
  const [q, setQ] = useState('');
  const [found, setFound] = useState(null); // résultats de la recherche
  const [cont, setCont] = useState([]);   // [{ book, st }]

  useEffect(() => { call('/audyn').then((r) => setD(r.ok ? r.data : { items: [], categories: [], off: true })); }, [call]);
  useEffect(() => {
    const s = q.trim();
    if (!s) { setFound(null); return undefined; }
    const h = setTimeout(() => call(`/audyn?q=${encodeURIComponent(s)}`).then((r) => setFound(r.ok ? r.data.items : [])), 300);
    return () => clearTimeout(h);
  }, [q, call]);
  // « Continuer l'écoute » : livres commencés sur cet appareil.
  useEffect(() => {
    if (!d || d.off) return undefined;
    let alive = true;
    Promise.all(continueCandidates(d.items, au.savedFor).map(async ({ item, saved }) => {
      const r = await call(`/audyn/${item.id}`);
      const st = r.ok ? listenState(r.data.chapters, saved) : null;
      return st ? { book: { ...item, ...r.data, chapters: item.chapters }, st } : null;
    })).then((rows) => { if (alive) setCont(rows.filter(Boolean)); });
    return () => { alive = false; };
  }, [d, call]); // eslint-disable-line react-hooks/exhaustive-deps

  const rows = useMemo(() => {
    if (!d) return [];
    const out = [];
    if (d.items.length) out.push({ key: 'new', title: t('awNew'), items: d.items.slice(0, ROW_MAX), more: d.items.length > ROW_MAX ? '/audyn?all=1' : null });
    for (const c of d.categories) {
      const items = d.items.filter((b) => b.category === c);
      if (items.length) out.push({ key: `c-${c}`, title: c, items: items.slice(0, ROW_MAX), more: `/audyn?cat=${encodeURIComponent(c)}` });
    }
    const other = d.items.filter((b) => !b.category);
    if (d.categories.length && other.length) out.push({ key: 'other', title: t('awOther'), items: other.slice(0, ROW_MAX), more: `/audyn?cat=${OTHER}` });
    return out;
  }, [d, t]);

  // « ▶ Écouter » de la bannière : reprend là où l'on s'était arrêté et ouvre la page du contenu.
  const listen = async (b) => {
    const r = await call(`/audyn/${b.id}`);
    if (!r.ok) { router.push(`/audyn/${b.id}`); return; }
    await au.openResume(r.data);
    router.push(`/audyn/${b.id}`);
  };
  const go = (href) => { router.push(href); window.scrollTo({ top: 0 }); };

  if (!feat('audyn')) return <main className="catalogue"><p className="soon">{t('awOff')}</p></main>;
  if (!d) return <main aria-busy="true" className="catalogue" />;

  const search = (
    <div className="aw-tools">
      <input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder={t('awSearch')} aria-label={t('awSearch')} maxLength={80} className="aw-search" />
    </div>
  );

  // Grille : recherche, une catégorie, ou tout.
  const gridItems = found ?? (all ? d.items : cat ? d.items.filter((b) => (cat === OTHER ? !b.category : b.category === cat)) : null);
  if (gridItems) {
    const title = found ? t('awSearch') : all ? t('awNew') : cat === OTHER ? t('awOther') : cat;
    return (
      <main className="catalogue aw-page">
        <div className="cat-bar">
          {!found && <Link href="/audyn" className="btn ghost">{t('cgBack')}</Link>}
          {!found && <h1 dir="auto">{title}</h1>}
          {search}
        </div>
        {gridItems.length === 0 && <p className="soon">{t('awEmpty')}</p>}
        <div className="grid">{gridItems.map((b) => <AudynCard key={b.id} b={b} t={t} />)}</div>
      </main>
    );
  }

  return (
    <main className="catalogue aw-page">
      {d.items.length > 0 ? <AudynHero items={d.items.slice(0, HERO_MAX)} t={t} onListen={listen} /> : <h1 className="aw-h1">{t('awTitle')}</h1>}
      <div className="cat-bar aw-bar-tools">{search}</div>
      {d.items.length === 0 && <p className="soon">{t('awEmpty')}</p>}
      {cont.length > 0 && (
        <Row id="row-aw-continue" title={t('awContinue')} talks={cont.map((c) => ({ ...c.book, id: c.book.id, st: c.st }))} t={t}
          renderItem={(b) => (
            <AudynCard b={b} t={t} progress={b.st.pct}
              sub={`${t('awChapterOf').replace('{i}', b.st.index + 1).replace('{n}', b.st.count)} · ${t('awLeft').replace('{t}', fmtLong(b.st.left))}`} />
          )} />
      )}
      {rows.map((r) => (
        <Row key={r.key} id={`row-aw-${r.key}`} title={r.title} talks={r.items} t={t}
          renderItem={(b) => <AudynCard b={b} t={t} />}
          onSeeAll={r.more ? () => go(r.more) : undefined} />
      ))}
    </main>
  );
}
