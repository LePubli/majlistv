'use client';
// Bannière du haut de l'accueil : conférences mises en avant (défilement), bannière personnalisée, ou simple titre.
import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';

// Respecte « réduire les animations » : pas de défilement automatique ni de vidéo d'ambiance.
function useReducedMotion() {
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

function FeaturedHero({ items, t }) {
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
  return (
    <section className="hero banner has-image featured" aria-roledescription="carousel" aria-label={t('heroEyebrow')}
      onMouseEnter={() => setPaused(true)} onMouseLeave={() => setPaused(false)} onFocus={() => setPaused(true)} onBlur={() => setPaused(false)}>
      {items.map((it, k) => {
        const u = it.posterUrl || (it.source === 'youtube' ? `https://i.ytimg.com/vi/${it.video_ref}/hqdefault.jpg` : null);
        return <div key={it.id} className={`banner-bg${k === i ? ' on' : ''}`} style={u ? { backgroundImage: `url(${u})` } : undefined} aria-hidden="true" />;
      })}
      <div className="banner-shade" aria-hidden="true" />
      <div className="banner-body" aria-live={paused ? 'polite' : 'off'}>
        <p className="eyebrow">
          <span className={`badge-inline ${x.access}`}>{t(x.access)}</span>
          {x.category ? ` ${x.category}` : ''}
        </p>
        <h1>{x.title}</h1>
        <p className="banner-meta">{[x.speaker, mins].filter(Boolean).join(' · ')}</p>
        {x.summary && <p className="banner-summary">{x.summary}</p>}
        <div className="hero-cta">
          <Link href={`/talks/${x.id}`} className="btn btn-lg">▶ {t('watchNow')}</Link>
          <Link href={`/talks/${x.id}`} className="btn ghost btn-lg">{t('moreInfo')}</Link>
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
