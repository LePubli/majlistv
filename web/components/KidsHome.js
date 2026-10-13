'use client';
// Mejliss Kids, côté enfant : les vidéos de son âge, en grand, avec des mots simples et encourageants. Pas de classement, pas de comparaison.
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useApp } from './Providers';
import { AVATAR_EMOJI, BADGE_CODES, BADGE_ICON, Stars } from '../lib/kids';
import { useKidTime, leftMin } from '../lib/kidTime';

const mins = (s) => (s ? `${Math.max(1, Math.round(s / 60))} min` : '');

function KidCard({ x, t }) {
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
  return (
    <main className="page kd-page kd-home">
      <h1 className="kd-hello"><span aria-hidden="true">{AVATAR_EMOJI[kid.avatar] || '🦁'}</span> {t('kdHello').replace('{name}', kid.name)}</h1>
      {left != null && <p className={left <= 5 ? 'kd-timeleft low' : 'kd-timeleft'} role="status"><span aria-hidden="true">⏳</span> {t(left <= 5 ? 'kdTimeLow' : 'kdTimeLeft').replace('{n}', left)}</p>}
      {sum && (
        <section className="kd-summary" aria-label={t('kdMyStars')}>
          <p className="kd-total"><span aria-hidden="true">⭐</span> {t('kdStarsTotal').replace('{n}', sum.stars)}</p>
          {sum.learning && (
            <ul className="kd-badges" aria-label={t('kdBadges')}>
              {BADGE_CODES.map((c) => { const got = sum.badges.some((b) => b.code === c); return (
                <li key={c} className={got ? 'kd-badge on' : 'kd-badge'} title={t(`kdB_${c}`) + ' — ' + t(`kdBd_${c}`)}><span aria-hidden="true">{BADGE_ICON[c]}</span><span className="kd-badge-name">{t(`kdB_${c}`)}</span></li>
              ); })}
            </ul>
          )}
        </section>
      )}
      {sum && sum.due.length > 0 && (
        <section aria-labelledby="kd-due"><h2 id="kd-due">{t('kdDue')}</h2><ul className="kd-grid">{sum.due.map((x) => <KidCard key={x.id} x={x} t={t} />)}</ul></section>
      )}
      {d && d.resume.length > 0 && (
        <section aria-labelledby="kd-cont"><h2 id="kd-cont">{t('kdContinue')}</h2><ul className="kd-grid">{d.resume.map((x) => <KidCard key={x.id} x={x} t={t} />)}</ul></section>
      )}
      <section aria-labelledby="kd-all"><h2 id="kd-all">{t('kdForYou')}</h2>
        {d && d.talks.length === 0 ? <p className="soon">{t('kdEmpty')}</p> : <ul className="kd-grid">{(d?.talks || []).map((x) => <KidCard key={x.id} x={x} t={t} />)}</ul>}
      </section>
    </main>
  );
}
