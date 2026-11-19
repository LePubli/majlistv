'use client';
// Thème Premium — Mejliss Kids, côté enfant : reproduction de l'écran Kids de la maquette V20 (classes « v20-kids-… » de
// /premium/v20.css) avec de vraies données : vidéos de l'âge de l'enfant (GET /kids/talks), rubriques et rangées (GET /kids/catalog).
// Rien d'inventé : la maquette montrait une série de démonstration, de fausses catégories et de fausses affiches ; ici le bandeau porte le titre de la vraie vidéo à reprendre (l'illustration du bandeau n'est qu'un décor),
// les pastilles sont les vraies rubriques Kids et les rangées sont de vraies vidéos. Le reste de l'accueil (étoiles, badges,
// petites actions, Ramadan, histoires du soir…) garde ses fonctions et se range sous ces rangées.
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { useRouter } from 'next/navigation';
import { useApp } from '../Providers';
import { posterArt } from '../../lib/thumb';
import { AVATAR_EMOJI, agesLabel } from '../../lib/kids';
import PrayerPill from '../PrayerPill';
import Glyph from './Glyph';
import { BrandWord } from './PmBrand';

const name = (r, locale) => r.names?.[locale] || r.names?.fr || r.slug;
const mins = (s, t) => (s ? t('mtrMin').replace('{n}', Math.max(1, Math.round(s / 60))) : '');
const bg = (x) => (x.posterUrl ? `url("${x.posterUrl}")` : posterArt(x.id));

/** En-tête de l'enfant : logo + « Kids », menu (Accueil, Regarder, Apprendre, Agir), prénom et sortie par code parental. */
export function PmKidHeader() {
  const { appName, t, kid, call, login } = useApp();
  const router = useRouter();
  const [learning, setLearning] = useState(false);
  const [open, setOpen] = useState(false);
  const [code, setCode] = useState('');
  const [err, setErr] = useState('');
  useEffect(() => { call('/kids/summary').then((r) => r.ok && setLearning(r.data?.learning !== false)); }, [call]);
  const leave = async (e) => {
    e.preventDefault(); setErr('');
    const r = await call('/kids/exit', { method: 'POST', body: JSON.stringify({ code }) });
    if (!r.ok) {
      setCode('');
      setErr(r.data?.code === 'locked' ? t('kdExitLocked').replace('{n}', (r.data.error.match(/\d+/) || ['10'])[0]) : r.data?.code === 'bad_pin' ? t('kdExitBad').replace('{n}', r.data.left ?? '') : (r.data?.error || t('errGeneric')));
      return;
    }
    login(r.data.token, r.data.user);
    router.push('/kids');
  };
  const nav = [
    ['/kids', t('kdMHome'), 'home', ''],
    ['/kids?tab=watch', t('kdMWatch'), 'clapper', 'watch'],
    ...(learning ? [['/kids?tab=learn', t('kdMLearn'), 'book', 'learn']] : []),
    ['/kids?tab=act', t('kdMAct'), 'star', 'act'],
  ];
  const cur = typeof window === 'undefined' ? '' : (new URLSearchParams(window.location.search).get('tab') || '');
  return (
    <div className="v20-app v20-part">
      <header className="v20-kids-topbar">
        <div className="v20-kids-head-inner">
          <Link className="v20-kids-logo" href="/kids" aria-label={appName}>
            <img src="/brand/emblem-bleu-s.png" alt="" width="37" height="40" />
            <strong><BrandWord name={appName} /></strong>
          </Link>
          <span className="v20-kids-badge">Kids</span>
          <nav className="v20-kids-head-nav" aria-label={t('mainNav')}>
            {nav.map(([href, label, g, k]) => (
              <Link key={href} href={href} className={cur === k ? 'v20-active' : undefined}><Glyph name={g} /><span>{label}</span></Link>
            ))}
          </nav>
          <div className="v20-kids-head-tools">
            <PrayerPill />
            <span className="v20-kids-profile-pill pm-kd-me"><span className="v20-kids-profile-face" aria-hidden="true">{AVATAR_EMOJI[kid?.avatar] || '🦁'}</span><span>{kid?.name}</span></span>
            <button type="button" className="v20-kids-search pm-kd-leave" onClick={() => { setOpen(true); setErr(''); setCode(''); }}>{t('kdLeave')}</button>
          </div>
        </div>
      </header>
      {open && createPortal(
        <div className="kd-modal" role="dialog" aria-modal="true" aria-labelledby="kd-exit-title">
          <form className="kd-modal-box" onSubmit={leave}>
            <h2 id="kd-exit-title">{t('kdExitTitle')}</h2>
            <p className="meta">{t('kdExitHelp')}</p>
            <input type="password" inputMode="numeric" autoComplete="off" pattern="\d{4,6}" maxLength={6} required autoFocus value={code} onChange={(e) => setCode(e.target.value)} aria-label={t('kdExitTitle')} />
            {err && <p className="error" role="alert">{err}</p>}
            <div className="panel-actions"><button className="btn">{t('kdOk')}</button><button type="button" className="btn ghost" onClick={() => setOpen(false)}>{t('kdCancel')}</button></div>
          </form>
        </div>,
        document.body
      )}
    </div>
  );
}

function Card({ x, rubrics, locale, t }) {
  const r = rubrics.find((q) => (x.rubricIds || []).includes(q.id));
  return (
    <Link className="v20-kids-v8-feature-card" href={`/kids/watch/${x.id}`} aria-label={x.title}>
      <span className="pm-kd-art" style={{ backgroundImage: bg(x) }}>
        <span className="pm-kd-play" aria-hidden="true">▶</span>
        {x.durationSeconds ? <span className="pm-kd-dur">{mins(x.durationSeconds, t)}</span> : null}
        {x.completed && <span className="pm-kd-seen">{t('kdSeen')}</span>}
      </span>
      <b>{x.title}</b>
      {r && <small>{r.emoji} {name(r, locale)}</small>}
    </Link>
  );
}

/** Haut de l'accueil de l'enfant : bandeau, pastilles des rubriques, « À regarder maintenant », rangée suggérée. */
export function PmKidsTop({ d, hero }) {
  const { t, call, locale } = useApp();
  const [cat, setCat] = useState(null);
  useEffect(() => { call('/kids/catalog').then((r) => setCat(r.ok ? r.data : { rubrics: [], shelves: [], talks: [] })); }, [call]);
  const rubrics = cat?.rubrics || [];
  const talks = d?.talks || [];
  const resume = d?.resume || [];
  const now = [...resume, ...talks.filter((x) => !x.completed && !resume.some((r) => r.id === x.id))].slice(0, 5);
  const shelf = cat && (cat.shelves.find((s) => s.kind === 'popular') || cat.shelves.find((s) => s.kind === 'new'));
  const byId = new Map((cat?.talks || []).map((x) => [x.id, x]));
  const second = shelf ? shelf.ids.map((i) => byId.get(i)).filter((x) => x && !now.some((n) => n.id === x.id)).slice(0, 5) : [];
  const ages = hero?.kidsBands?.length ? agesLabel(hero.kidsBands, t) : '';
  return (
    <>
      <section className="v20-kids-hero" aria-label={t('kdMWatch')}>
        <div className="v20-kids-hero-visual" aria-hidden="true" />
        {hero ? (
          <div className="v20-kids-v8-hero-copy">
            <span className="v20-kids-v8-eyebrow">{(resume.length ? t('kdContinue') : t('kdForYou')).toUpperCase()}</span>
            <h1 className={hero.title.length > 34 ? 'pm-long' : undefined}>{hero.title}</h1>
            <p className="v20-kids-v8-description">{t('kdTagline')}</p>
            <div className="v20-kids-v8-meta">
              {hero.durationSeconds ? <span><Glyph name="clapper" /> {mins(hero.durationSeconds, t)}</span> : null}
              {ages ? <span><Glyph name="profile" /> {ages}</span> : null}
            </div>
            <div className="v20-kids-v8-actions">
              <Link href={`/kids/watch/${hero.id}`} className="v20-kids-v8-primary"><span className="v20-kids-v8-play">▶</span> {t('kdMPlay')}</Link>
            </div>
          </div>
        ) : (
          <div className="v20-kids-v8-hero-copy">
            <h1>{t('kdTitle')}</h1>
            <p className="v20-kids-v8-description">{t('kdTagline')}</p>
          </div>
        )}
      </section>
      <div className="v20-kids-v8-content">
        {rubrics.length > 0 && (
          <nav className="v20-kids-categories" aria-label={t('kcRubrics')}>
            {rubrics.slice(0, 6).map((r, i) => (
              <Link key={r.id} href={`/kids?tab=watch&r=${r.slug}`} className={`v20-kids-category v20-kcat-${i % 6}`}>
                <strong aria-hidden="true">{r.emoji}</strong><span>{name(r, locale)}</span>
              </Link>
            ))}
          </nav>
        )}
        {now.length > 0 && (
          <section className="v20-kids-v8-section" id="kids-watch">
            <div className="v20-kids-v8-title"><h2>{resume.length ? t('kdContinue') : t('kdForYou')}</h2><Link href="/kids?tab=watch">{t('rowSeeAll')} ❯</Link></div>
            <div className="v20-kids-v8-featured-grid">{now.map((x) => <Card key={x.id} x={x} rubrics={rubrics} locale={locale} t={t} />)}</div>
          </section>
        )}
        {second.length > 0 && (
          <section className="v20-kids-v8-section v20-kids-v8-series-section" id="kids-more">
            <div className="v20-kids-v8-title"><h2>{shelf.kind === 'popular' ? t('kcPopular') : t('kcNew')}</h2><Link href="/kids?tab=watch">{t('rowSeeAll')} ❯</Link></div>
            <div className="v20-kids-v8-featured-grid">{second.map((x) => <Card key={x.id} x={x} rubrics={rubrics} locale={locale} t={t} />)}</div>
          </section>
        )}
      </div>
    </>
  );
}
