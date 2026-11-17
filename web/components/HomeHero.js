'use client';
// Bannière du haut de l'accueil : vidéos mises en avant (défilement), bannière personnalisée, ou simple titre.
import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useApp } from './Providers';

// Respecte « réduire les animations » : pas de défilement automatique ni de vidéo d'ambiance.
export function useReducedMotion() {
  const [reduced, setReduced] = useState(true);
  useEffect(() => {
    const q = window.matchMedia('(prefers-reduced-motion: reduce)');
    setReduced(q.matches);
    const on = () => setReduced(q.matches);
    q.addEventListener?.('change', on);
    return () => q.removeEventListener?.('change', on);
  }, []);
  return reduced;
}

function TextHero({ t, user, trialDays }) {
  return (
    <section className="hero">
      <p className="eyebrow">{t('heroEyebrow')}</p>
      <h1>{t('heroTitle')}</h1>
      <p>{t('heroText')}</p>
      <div className="hero-cta">
        {!user && <Link href="/register" className="btn btn-lg">{trialDays > 0 ? t('heroCta') : t('register')}</Link>}
        <Link href="/pricing" className="btn ghost btn-lg">{t('pricing')}</Link>
      </div>
      {!user && trialDays > 0 && <p className="hero-note">{t('heroNote').replace('{n}', trialDays)}</p>}
    </section>
  );
}

function CustomHero({ hero, t, user, trialDays }) {
  const reduced = useReducedMotion();
  const external = /^https:/.test(hero.ctaUrl || '');
  return (
    <section className={`hero banner${hero.imageUrl ? ' has-image' : ''}`} style={hero.imageUrl ? { backgroundImage: `url(${hero.imageUrl})` } : undefined}>
      {hero.videoUrl && !reduced && <video className="banner-video" src={hero.videoUrl} poster={hero.imageUrl || undefined} autoPlay muted loop playsInline aria-hidden="true" />}
      <div className="banner-shade" aria-hidden="true" />
      <div className="banner-body">
        <p className="eyebrow">{t('heroEyebrow')}</p>
        <h1>{hero.title || t('heroTitle')}</h1>
        <p>{hero.subtitle || t('heroText')}</p>
        <div className="hero-cta">
          {hero.ctaLabel && hero.ctaUrl && (external
            ? <a href={hero.ctaUrl} className="btn btn-lg" rel="noopener">{hero.ctaLabel}</a>
            : <Link href={hero.ctaUrl} className="btn btn-lg">{hero.ctaLabel}</Link>)}
          {!user && !hero.ctaLabel && <Link href="/register" className="btn btn-lg">{trialDays > 0 ? t('heroCta') : t('register')}</Link>}
        </div>
        {!user && trialDays > 0 && <p className="hero-note">{t('heroNote').replace('{n}', trialDays)}</p>}
      </div>
    </section>
  );
}

// Étape D3 (17/11) : image de la une en grande taille. Pour YouTube, on essaie la miniature haute définition
// (maxresdefault) et on ne la garde que si elle existe vraiment (sinon YouTube renvoie une image grise de 120 px).
const ytThumb = (ref, q) => `https://i.ytimg.com/vi/${ref}/${q}.jpg`;
export const heroThumb = (it) => it.posterUrl || (it.source === 'youtube' ? ytThumb(it.video_ref, 'hqdefault') : null);
function HeroBg({ it, on }) {
  const base = heroThumb(it);
  const [src, setSrc] = useState(base);
  useEffect(() => {
    setSrc(base);
    if (it.posterUrl || it.source !== 'youtube') return undefined;
    let dead = false;
    const img = new window.Image();
    img.onload = () => { if (!dead && img.naturalWidth > 320) setSrc(img.src); };
    img.src = ytThumb(it.video_ref, 'maxresdefault');
    return () => { dead = true; };
  }, [base, it.posterUrl, it.source, it.video_ref]);
  return <div className={`banner-bg${on ? ' on' : ''}`} style={src ? { backgroundImage: `url(${src})` } : undefined} aria-hidden="true" />;
}

function FeaturedHero({ items, t }) {
  const { user, feat, inMyList, toggleMyList } = useApp();
  const router = useRouter();
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
  const mins = x.durationSeconds > 0 ? `${Math.max(1, Math.round(x.durationSeconds / 60))} ${t('minutes')}` : '';
  // « Ma liste » : même bouton que sur les vignettes (favoris + plus tard). Visiteur : page de connexion.
  const listOn = feat('favorites') || feat('watchlater');
  const mine = listOn && inMyList(x.id);
  const onMine = () => { if (!user) { router.push('/login'); return; } toggleMyList(x.id); };
  return (
    <section className="hero banner has-image featured" aria-roledescription="carousel" aria-label={t('heroEyebrow')}
      onMouseEnter={() => setPaused(true)} onMouseLeave={() => setPaused(false)} onFocus={() => setPaused(true)} onBlur={() => setPaused(false)}>
      {items.map((it, k) => <HeroBg key={it.id} it={it} on={k === i} />)}
      <div className="banner-shade" aria-hidden="true" />
      <div className="banner-body" key={x.id} aria-live={paused ? 'polite' : 'off'}>
        <p className="eyebrow">
          <span className={`badge-inline ${x.access}`}>{t(x.access)}</span>
          {x.category ? <span className="banner-cat"> {x.category}</span> : ''}
        </p>
        <h1>{x.title}</h1>
        <p className="banner-meta">{[x.speaker, mins].filter(Boolean).map((m, k) => <span key={k}>{m}</span>)}</p>
        {x.summary && <p className="banner-summary">{x.summary}</p>}
        <div className="hero-cta">
          <Link href={`/talks/${x.id}`} className="btn btn-lg hero-play"><svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M7 4.5v15l13-7.5z" /></svg>{t('watchNow')}</Link>
          {listOn
            ? <button type="button" className={`btn ghost btn-lg hero-list${mine ? ' on' : ''}`} onClick={onMine} aria-pressed={mine} title={mine ? t('mlRemove') : t('mlAdd')}><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" aria-hidden="true">{mine ? <path d="M5 12.5l4.5 4.5L19 7.5" /> : <path d="M12 5v14M5 12h14" />}</svg>{t('lbMyList')}</button>
            : <Link href={`/talks/${x.id}`} className="btn ghost btn-lg">{t('moreInfo')}</Link>}
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

export default function HomeHero({ hero, t, user, trialDays }) {
  if (hero?.mode === 'featured' && hero.items?.length) return <FeaturedHero items={hero.items} t={t} />;
  if (hero?.mode === 'custom') return <CustomHero hero={hero} t={t} user={user} trialDays={trialDays} />;
  return <TextHero t={t} user={user} trialDays={trialDays} />;
}
