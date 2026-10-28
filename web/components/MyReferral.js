'use client';
// Étape 43 — Mon compte → Parrainage : lien personnel à partager, compteurs, règle de la récompense.
import { useEffect, useState } from 'react';
import { useApp } from './Providers';

export default function MyReferral() {
  const { t, call, appName } = useApp();
  const [d, setD] = useState(null);
  const [copied, setCopied] = useState(false);
  const [err, setErr] = useState(false);
  useEffect(() => { call('/me/referral').then((r) => (r.ok ? setD(r.data) : setErr(true))); }, [call]);
  if (err) return <section className="billing"><p className="meta">{t('errGeneric')}</p></section>;
  if (!d) return null;
  const n = (x) => `${x} ${x === 1 ? t('refMonth') : t('refMonths')}`;
  const link = `${typeof window !== 'undefined' ? window.location.origin : ''}/register?ref=${d.code}`;
  const copy = async () => { try { await navigator.clipboard.writeText(link); setCopied(true); setTimeout(() => setCopied(false), 2000); } catch { /* copie impossible : le lien reste affiché */ } };
  const wa = `https://wa.me/?text=${encodeURIComponent(`${t('refShareText')} ${link}`)}`;
  return (
    <section className="billing ref-box" aria-labelledby="ref-h">
      <h2 id="ref-h">{t('refTitle')}</h2>
      <p>{t('refIntro').replace('{n}', n(d.months))}</p>
      <p className="meta small">{t('refLink')}</p>
      <p><code className="gf-code ref-link" dir="ltr">{link}</code></p>
      <p className="ref-actions">
        <button type="button" className="btn" onClick={copy}>{copied ? `✓ ${t('refCopied')}` : t('refCopy')}</button>{' '}
        <a className="btn ghost" href={wa} target="_blank" rel="noopener noreferrer">{t('refWhatsapp')}</a>
      </p>
      <p className="meta small">{t('refCode')} : <code dir="ltr">{d.code}</code></p>
      <ul className="ref-stats">
        <li><b>{d.stats.invited}</b><span>{t('refInvited2')}</span></li>
        <li><b>{d.stats.rewarded}</b><span>{t('refRewarded')}</span></li>
        <li><b>{d.stats.pending}</b><span>{t('refPending')}</span></li>
        <li><b>{d.stats.monthsEarned}</b><span>{t('refEarned')}</span></li>
      </ul>
      {d.stats.capReached && <p className="meta small">{t('refCap').replace('{n}', d.maxPerYear)}</p>}
      {d.referredBy && <p className="meta small">{t('refYou').replace('{app}', appName || 'Mejliss TV')}</p>}
      <p className="meta small">{t('refRules')}</p>
    </section>
  );
}
