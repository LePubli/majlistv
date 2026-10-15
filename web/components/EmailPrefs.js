'use client';
// Étape 21 — « Mes e-mails » (Mon compte) : alertes des intervenants suivis, sélection de la semaine, liste des intervenants suivis.
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useApp } from './Providers';

export default function EmailPrefs() {
  const { t, call } = useApp();
  const [d, setD] = useState(null);
  const [saved, setSaved] = useState(false);
  useEffect(() => { call('/me/notifications').then((r) => r.ok && setD(r.data)); }, [call]);
  if (!d) return null;
  const flash = () => { setSaved(true); setTimeout(() => setSaved(false), 2500); };
  const set = async (key, value) => {
    const r = await call('/me/notifications', { method: 'PUT', body: JSON.stringify({ [key]: value }) });
    if (r.ok) { setD({ ...d, prefs: r.data }); flash(); }
  };
  const unfollow = async (slug) => {
    const r = await call(`/speakers/${slug}/follow`, { method: 'DELETE' });
    if (r.ok) setD({ ...d, follows: d.follows.filter((f) => f.slug !== slug) });
  };
  return (
    <section className="billing" id="emails" aria-labelledby="emails-h">
      <h2 id="emails-h">{t('nfTitle')}</h2>
      <label className="rv-email">
        <input type="checkbox" checked={d.prefs.speakers} disabled={!d.available.speakers} onChange={(e) => set('speakers', e.target.checked)} />
        <span>{t('nfSpeakers')}{!d.available.speakers && <small className="meta"> — {t('nfPaused')}</small>}</span>
      </label>
      <label className="rv-email">
        <input type="checkbox" checked={d.prefs.weekly} disabled={!d.available.weekly} onChange={(e) => set('weekly', e.target.checked)} />
        <span>{t('nfWeekly')}{!d.available.weekly && <small className="meta"> — {t('nfPaused')}</small>}</span>
      </label>
      <p className="meta small" role="status" aria-live="polite">{saved ? `✓ ${t('nfSaved')}` : ' '}</p>
      <h3>{t('nfFollows')}</h3>
      {d.follows.length === 0 ? (
        <p className="meta">{t('nfNoFollow')} <Link className="link u" href="/intervenants">{t('nfBrowse')}</Link></p>
      ) : (
        <ul className="nf-list">
          {d.follows.map((f) => (
            <li key={f.slug}>
              <Link href={`/intervenants/${f.slug}`}>{f.name}</Link>
              <button type="button" className="btn ghost small" onClick={() => unfollow(f.slug)} aria-label={`${t('nfUnfollow')} : ${f.name}`}>{t('nfUnfollow')}</button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
