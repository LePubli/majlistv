'use client';
// Identité visuelle Mejliss TV Kids : nuit étoilée, lettres colorées, étapes numérotées (je regarde → je fais le quiz → je progresse → je retiens).
// Illustration facultative : déposez votre image (PNG transparent) dans web/public/kids/hero.png, elle s'affiche à droite du bandeau.
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useApp } from './Providers';
import { agesLabel } from '../lib/kids';

// « Kids » en lettres de couleur, façon autocollant.
export function KidsWord({ className = '' }) {
  return <span className={`kd-word ${className}`} role="img" aria-label="Kids">{['K', 'i', 'd', 's'].map((c, i) => <span key={i} className={`kd-l kd-l${i}`} aria-hidden="true">{c}</span>)}</span>;
}

const STEPS = [['1'], ['2'], ['3'], ['4']];
const PERKS = ['🧒', '📖', '📊', '🛡️'];

// variant « full » : bandeau fin (marque + 4 étapes en pastilles + engagements), masquable (page des parents).
// « compact » : bandeau seul (accueil de l'enfant).
export default function KidsBanner({ variant = 'full' }) {
  const { t, appName } = useApp();
  const [hidden, setHidden] = useState(false);
  useEffect(() => { try { setHidden(localStorage.getItem('kd-banner-hidden') === '1'); } catch { /* stockage indisponible */ } }, []);
  const toggle = (v) => { setHidden(v); try { localStorage.setItem('kd-banner-hidden', v ? '1' : '0'); } catch { /* stockage indisponible */ } };
  if (variant === 'full' && hidden) {
    return <p className="kd-howto"><button type="button" className="link u small" onClick={() => toggle(false)}>{t('kdHow')}</button></p>;
  }
  return (
    <section className={`kd-banner ${variant}`} aria-label={t('kdTitle')}>
      <div className="kd-banner-top">
        <div className="kd-banner-brand">
          <img className="kd-banner-emblem" src="/brand/emblem.png" alt="" width="40" height="43" />
          <div className="kd-banner-id">
            <p className="kd-banner-name">{appName}</p>
            <KidsWord className="big" />
          </div>
        </div>
        <p className="kd-tagline">{t('kdTagline')}</p>
        {variant === 'full' && <button type="button" className="link u small kd-hide" onClick={() => toggle(true)}>{t('kdHide')}</button>}
      </div>
      {variant === 'full' && (
        <>
          <ol className="kd-steps">
            {STEPS.map(([n]) => (
              <li key={n} className={`kd-step s${n}`} title={t(`kdS${n}D`)}>
                <span className="kd-num" aria-hidden="true">{n}</span>
                <b className="kd-step-title">{t(`kdS${n}T`)}</b>
              </li>
            ))}
          </ol>
          <ul className="kd-perks">
            {PERKS.map((e, i) => <li key={i}><span aria-hidden="true">{e}</span> {t(`kdP${i + 1}`)}</li>)}
          </ul>
        </>
      )}
    </section>
  );
}

// Bande « Espace Kids » de l'accueil : un bandeau coloré et les dernières vidéos Kids (aperçu, un clic mène à l'espace Kids).
export function KidsBand({ data }) {
  const { t, appName } = useApp();
  if (!data?.enabled || !data.talks?.length) return null;
  const age = (b) => agesLabel(b, t);
  const mins = (s) => (s ? `${Math.max(1, Math.round(s / 60))} min` : '');
  return (
    <section className="kd-band" aria-labelledby="kd-band-h">
      <div className="kd-band-head">
        <div className="kd-banner-brand">
          <img className="kd-banner-emblem" src="/brand/emblem.png" alt="" width="44" height="47" />
          <div>
            <h2 id="kd-band-h" className="kd-band-title"><span className="kd-band-name">{appName}</span> <KidsWord /></h2>
            <p className="kd-tagline small">{t('kdBandSub')}</p>
          </div>
        </div>
        <Link className="btn kd-band-cta" href="/kids">{t('kdBandCta')}</Link>
      </div>
      <ul className="kd-band-list">
        {data.talks.map((x) => (
          <li key={x.id}>
            <Link href="/kids" className="kd-card" aria-label={`${x.title} — ${age(x.kidsBands)}`}>
              <span className="kd-thumb" style={x.posterUrl ? { backgroundImage: `url(${x.posterUrl})` } : undefined}>
                <span className="kd-age">{age(x.kidsBands)}</span>
                {x.durationSeconds ? <span className="dur">{mins(x.durationSeconds)}</span> : null}
              </span>
              <b className="kd-card-title">{x.title}</b>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
