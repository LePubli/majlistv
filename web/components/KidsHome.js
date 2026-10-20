'use client';
// Mejliss Kids, côté enfant : les vidéos de son âge, en grand, avec des mots simples et encourageants. Pas de classement, pas de comparaison.
import { useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { useApp } from './Providers';
import { AVATAR_EMOJI, BADGE_CODES, BADGE_ICON, Stars } from '../lib/kids';
import { useKidTime, leftMin } from '../lib/kidTime';
import KidsBanner from './KidsBanner';
import { KidActions } from './KidsActions';
import KidCatalog from './KidCatalog';
import KidShorts from './KidShorts';

const mins = (s) => (s ? `${Math.max(1, Math.round(s / 60))} min` : '');

export function KidCard({ x, t }) {
  return (
    <li>
      <Link href={`/kids/watch/${x.id}`} className="kd-card">
        <span className="kd-thumb" style={x.posterUrl ? { backgroundImage: `url(${x.posterUrl})` } : undefined}>
          {x.completed && <span className="kd-seen">{t('kdSeen')}</span>}
          {x.stars ? <span className="kd-cardstars" aria-label={`${x.stars} / 3`}><Stars n={x.stars} /></span> : null}
          {x.durationSeconds ? <span className="dur">{mins(x.durationSeconds)}</span> : null}
        </span>
        <b className="kd-card-title">{x.title}</b>
      </Link>
    </li>
  );
}

export default function KidsHome() {
  const { t, call, kid } = useApp();
  const tab0 = useSearchParams().get('tab');
  const [d, setD] = useState(null);
  const [sum, setSum] = useState(null);
  const time = useKidTime(call, kid, d?.time);
  useEffect(() => { call('/kids/talks').then((r) => setD(r.ok ? r.data : { talks: [], resume: [] })); call('/kids/summary').then((r) => r.ok && setSum(r.data)); }, [call]);
  if (!kid) return null;
  const left = leftMin(time);
  if (time?.timeUp) return (
    <main className="page kd-page kd-home">
      <h1 className="kd-hello"><span aria-hidden="true">{AVATAR_EMOJI[kid.avatar] || '🦁'}</span> {t('kdHello').replace('{name}', kid.name)}</h1>
      <section className="kd-timeup" role="status"><p className="kd-moon" aria-hidden="true">🌙</p><h2>{t('kdTimeUpTitle')}</h2><p>{t('kdTimeUpText')}</p>
        {sum && <p className="kd-total"><span aria-hidden="true">⭐</span> {t('kdStarsTotal').replace('{n}', sum.stars)}</p>}</section>
    </main>
  );
  const tab = ['watch', 'learn', 'act'].includes(tab0) ? tab0 : 'home';
  const talks = d?.talks || [];
  const seen = talks.filter((x) => x.completed).length;
  const hero = (d?.resume || [])[0] || talks.find((x) => !x.completed) || talks[0] || null;
  const earned = sum?.badges?.length || 0;
  const MENU = [['home', 'kdMHome', '🏠', '/kids'], ['watch', 'kdMWatch', '▶️', '/kids?tab=watch'], ...(sum?.learning !== false ? [['learn', 'kdMLearn', '🧠', '/kids?tab=learn']] : []), ['act', 'kdMAct', '🌱', '/kids?tab=act']];
  const Stars3 = () => sum && <p className="kd-total"><span aria-hidden="true">⭐</span> {t('kdStarsTotal').replace('{n}', sum.stars)}</p>;
  const Badges = ({ detail }) => sum?.learning && (
    <ul className={detail ? 'kd-badges kd-badges-big' : 'kd-badges'} aria-label={t('kdBadges')}>
      {BADGE_CODES.map((c) => { const got = sum.badges.some((b) => b.code === c); return (
        <li key={c} className={got ? 'kd-badge on' : 'kd-badge'} title={t(`kdB_${c}`) + ' — ' + t(`kdBd_${c}`)}><span aria-hidden="true">{BADGE_ICON[c]}</span><span className="kd-badge-name">{t(`kdB_${c}`)}</span>{detail && <small>{t(`kdBd_${c}`)}</small>}</li>
      ); })}
    </ul>
  );
  return (
    <div className="kd-shell">
      <aside className="kd-side">
        <nav aria-label={t('kdMenu')}>
          {MENU.map(([k, label, ico, href]) => (
            <Link key={k} href={href} className={tab === k ? 'on' : ''} aria-current={tab === k ? 'page' : undefined}><span aria-hidden="true">{ico}</span><span>{t(label)}</span></Link>
          ))}
        </nav>
        <p className="kd-side-note">{t('kdMNote')}</p>
      </aside>
      <main className="page kd-page kd-home">
        <KidsBanner variant="compact" />
        <h1 className="kd-hello"><span aria-hidden="true">{AVATAR_EMOJI[kid.avatar] || '🦁'}</span> {t('kdHello').replace('{name}', kid.name)}</h1>
        {left != null && <p className={left <= 5 ? 'kd-timeleft low' : 'kd-timeleft'} role="status"><span aria-hidden="true">⏳</span> {t(left <= 5 ? 'kdTimeLow' : 'kdTimeLeft').replace('{n}', left)}</p>}

        {tab === 'home' && (
          <>
            {hero && (
              <section className="kd-hero" aria-label={t('kdMWatch')}>
                <Link href={`/kids/watch/${hero.id}`} className="kd-hero-main" style={hero.posterUrl ? { backgroundImage: `url(${hero.posterUrl})` } : undefined}>
                  <span className="kd-hero-shade" />
                  <span className="kd-hero-text"><small>{(d?.resume || []).length ? t('kdContinue') : t('kdForYou')}</small><b>{hero.title}</b><span className="kd-hero-btn">▶ {t('kdMPlay')}</span></span>
                </Link>
              </section>
            )}
            {sum && (
              <section className="kd-progress" aria-label={t('kdMProgress')}>
                <div className="kd-pcard"><span className="kd-pico" aria-hidden="true">⭐</span><b>{sum.stars}</b><span>{t('kdMyStars')}</span></div>
                {sum.learning && <div className="kd-pcard"><span className="kd-pico" aria-hidden="true">🏅</span><b>{earned} / {BADGE_CODES.length}</b><span>{t('kdBadges')}</span></div>}
                <div className="kd-pcard"><span className="kd-pico" aria-hidden="true">📺</span><b>{seen} / {talks.length}</b><span>{t('kdMSeen')}</span>
                  <i className="kd-pbar" aria-hidden="true"><u style={{ width: `${talks.length ? Math.round((seen / talks.length) * 100) : 0}%` }} /></i></div>
                <Link href="/kids?tab=act" className="kd-pcard link-card"><span className="kd-pico" aria-hidden="true">🌱</span><b>{sum.actions?.validated ?? 0}</b><span>{t('kaValidatedCount')}</span></Link>
                {sum.learning && <Link href="/kids?tab=learn" className="kd-pcard link-card"><span className="kd-pico" aria-hidden="true">🧠</span><b>{sum.due.length}</b><span>{t('kdDue')}</span></Link>}
              </section>
            )}
            <section className="ka-home"><KidActions limit={3} onlyOpen hideEmpty title={t('kaTitle')} /></section>
            {sum?.learning && earned > 0 && <section aria-labelledby="kd-bd"><h2 id="kd-bd">{t('kdBadges')}</h2><Badges /></section>}
            {sum && sum.due.length > 0 && (
              <section aria-labelledby="kd-due"><h2 id="kd-due">{t('kdDue')}</h2><ul className="kd-grid">{sum.due.slice(0, 4).map((x) => <KidCard key={x.id} x={x} t={t} />)}</ul></section>
            )}
            {d && d.resume.length > 0 && (
              <section aria-labelledby="kd-cont"><h2 id="kd-cont">{t('kdContinue')}</h2><ul className="kd-grid">{d.resume.map((x) => <KidCard key={x.id} x={x} t={t} />)}</ul></section>
            )}
            <KidShorts />
            <section aria-labelledby="kd-all"><h2 id="kd-all">{t('kdForYou')}</h2>
              {d && talks.length === 0 ? <p className="soon">{t('kdEmpty')}</p> : <ul className="kd-grid">{talks.slice(0, 8).map((x) => <KidCard key={x.id} x={x} t={t} />)}</ul>}
              {talks.length > 8 && <p><Link href="/kids?tab=watch" className="btn ghost">{t('kdMAll')}</Link></p>}
            </section>
          </>
        )}

        {tab === 'watch' && <><KidShorts /><KidCatalog /></>}

        {tab === 'act' && (
          <section aria-labelledby="kd-act"><h2 id="kd-act">{t('kaTitle')}</h2><KidActions /></section>
        )}

        {tab === 'learn' && sum && (
          <>
            <section className="kd-summary" aria-label={t('kdMyStars')}><Stars3 /></section>
            <section aria-labelledby="kd-bd"><h2 id="kd-bd">{t('kdBadges')}</h2><Badges detail /></section>
            <section aria-labelledby="kd-due"><h2 id="kd-due">{t('kdDue')}</h2>
              {sum.due.length === 0 ? <p className="soon">{t('kdMDueNone')}</p> : <ul className="kd-grid">{sum.due.map((x) => <KidCard key={x.id} x={x} t={t} />)}</ul>}
            </section>
          </>
        )}
      </main>
    </div>
  );
}
