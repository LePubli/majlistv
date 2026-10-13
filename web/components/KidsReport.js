'use client';
// Rapport de progression pour le parent : un bloc par enfant, sans classement ni comparaison.
import { useCallback, useEffect, useState } from 'react';
import { useApp } from './Providers';
import { AVATAR_EMOJI, BADGE_ICON } from '../lib/kids';

const dayLetter = (iso, locale) => new Intl.DateTimeFormat(locale === 'ar' ? 'ar' : locale === 'en' ? 'en-GB' : 'fr-FR', { weekday: 'narrow', timeZone: 'UTC' }).format(new Date(iso + 'T12:00:00Z'));
const fmtMin = (m, t) => (m >= 60 ? `${Math.floor(m / 60)} h ${String(m % 60).padStart(2, '0')}` : t('kcMin').replace('{n}', m));

function Tile({ label, value }) { return <div className="kd-tile"><b>{value}</b><span className="meta small">{label}</span></div>; }

export default function KidsReport({ hasProfiles }) {
  const { t, call, locale } = useApp();
  const [days, setDays] = useState(7);
  const [r, setR] = useState(null);
  const [msg, setMsg] = useState('');
  const load = useCallback(async () => { const x = await call(`/me/kids/report?days=${days}`); if (x.ok) setR(x.data); }, [call, days]);
  useEffect(() => { if (hasProfiles) load(); }, [hasProfiles, load]);
  if (!hasProfiles) return null;
  if (!r) return <section className="kd-report" />;
  const toggleEmail = async (on) => { setR({ ...r, email: on }); const x = await call('/me/kids/report-prefs', { method: 'PUT', body: JSON.stringify({ email: on }) }); if (!x.ok) setR({ ...r, email: !on }); };
  const sendNow = async () => { const x = await call('/me/kids/report/send', { method: 'POST' }); setMsg(x.ok ? t('krSent') : (x.data?.error || t('errGeneric'))); setTimeout(() => setMsg(''), 4000); };

  return (
    <section className="kd-report" aria-labelledby="kd-rep-h">
      <h2 id="kd-rep-h">{t('krTitle')}</h2>
      <p className="kd-row">
        {[7, 30].map((d) => <button key={d} type="button" className={days === d ? 'pill on' : 'pill'} aria-pressed={days === d} onClick={() => setDays(d)}>{t(d === 7 ? 'krDays7' : 'krDays30')}</button>)}
      </p>
      <p className="meta small">{t('krNoRank')}</p>
      <div className="kd-reports">
        {r.profiles.map((p) => {
          const peak = Math.max(1, ...p.usage.map((u) => u.seconds));
          return (
            <article key={p.id} className="panel kd-rep-card">
              <h3 className="panel-title"><span aria-hidden="true">{AVATAR_EMOJI[p.avatar] || '🦁'}</span> {p.name}</h3>
              {!p.active ? <p className="meta">{t('krNoActivity')}</p> : (
                <>
                  <div className="kd-tiles">
                    <Tile label={t('krTime')} value={fmtMin(p.minutes, t)} />
                    <Tile label={t('krVideos')} value={p.watched} />
                    <Tile label={t('krQuizzes')} value={p.quizzes} />
                    {p.quizzes > 0 && <Tile label={t('krAvg')} value={`${p.avgPercent} %`} />}
                    <Tile label={t('krStars')} value={`+${p.starsGained}`} />
                  </div>
                  {p.usage.length <= 31 && (
                    <div className="kd-bars" role="img" aria-label={t('krPerDay') + ' : ' + p.usage.map((u) => `${u.day} ${Math.round(u.seconds / 60)} min`).join(', ')}>
                      {p.usage.map((u) => <span key={u.day} className="kd-bar" title={`${u.day} · ${Math.round(u.seconds / 60)} min`}><i style={{ height: `${Math.round((100 * u.seconds) / peak)}%` }} />{p.usage.length <= 7 && <em>{dayLetter(u.day, locale)}</em>}</span>)}
                    </div>
                  )}
                  {p.badges.length > 0 && <p>{t('krBadges')} : {p.badges.map((c) => <span key={c} title={t(`kdB_${c}`)}>{BADGE_ICON[c]} </span>)}</p>}
                  {p.retry.length > 0 && <p className="meta">{t('krRetry')} : {p.retry.map((x) => `« ${x} »`).join(', ')}</p>}
                </>
              )}
              <p className="meta small">{p.dailyLimitMin ? t('krLimit').replace('{n}', p.dailyLimitMin) : t('krNoLimit')}</p>
            </article>
          );
        })}
      </div>
      <label className="kd-check"><input type="checkbox" checked={r.email} onChange={(e) => toggleEmail(e.target.checked)} /> <span>{t('krEmailOn')}</span></label>
      <p><button type="button" className="btn ghost" onClick={sendNow}>{t('krSendNow')}</button> <span className="meta small" role="status">{msg}</span></p>
    </section>
  );
}
