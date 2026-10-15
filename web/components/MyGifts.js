'use client';
// Étape 21 — Mes cartes cadeaux achetées : code (à partir du paiement confirmé), état, lien d'activation à partager.
import { useEffect, useState } from 'react';
import { useApp } from './Providers';

const MONTHS = { 1: 'gfM1', 3: 'gfM3', 12: 'gfM12' };

export default function MyGifts({ poll = false }) {
  const { t, locale, call } = useApp();
  const [list, setList] = useState(null);
  const [copied, setCopied] = useState('');
  useEffect(() => {
    let off = false; let n = 0; let timer;
    const load = () => call('/me/gifts').then((r) => {
      if (off || !r.ok) return;
      setList(r.data);
      // Juste après un paiement, la confirmation arrive par webhook : on relit quelques secondes.
      if (poll && n++ < 8) timer = setTimeout(load, 2500);
    });
    load();
    return () => { off = true; clearTimeout(timer); };
  }, [call, poll]);
  const copy = async (text, key) => {
    try { await navigator.clipboard.writeText(text); setCopied(key); setTimeout(() => setCopied(''), 2000); } catch { /* copie impossible : le code reste affiché */ }
  };
  if (!list) return null;
  const date = (d) => new Date(d).toLocaleDateString(locale, { day: 'numeric', month: 'long', year: 'numeric' });
  return (
    <section className="billing" id="gifts" aria-labelledby="gifts-h">
      <h2 id="gifts-h">{t('gfMine')}</h2>
      {list.length === 0 && <p className="meta">{t('gfNone')}</p>}
      <ul className="gf-list">
        {list.map((g) => (
          <li key={g.id} className={`gf-card gf-${g.status}`}>
            <p><strong>{t(MONTHS[g.months])}</strong> · <span className="gf-state">{t({ paid: 'gfPaid', redeemed: 'gfRedeemed', void: 'gfVoid' }[g.status])}</span> <small className="meta">· {date(g.paidAt || g.createdAt)}</small></p>
            {g.recipientEmail && <p className="meta small">{t('gfSentTo').replace('{to}', g.recipientEmail)}</p>}
            {g.code && g.status === 'paid' && (
              <>
                <p><span className="meta small">{t('gfCode')} :</span> <code className="gf-code" dir="ltr">{g.code}</code>{' '}
                  <button type="button" className="btn ghost small" onClick={() => copy(g.code, g.id)}>{copied === g.id ? `✓ ${t('gfCopied')}` : t('gfCopy')}</button></p>
                <p className="meta small">{t('gfGiveLink')} :{' '}
                  <button type="button" className="btn ghost small" onClick={() => copy(`${window.location.origin}/redeem?code=${g.code}`, `${g.id}-l`)}>{copied === `${g.id}-l` ? `✓ ${t('gfCopied')}` : t('gfCopy')}</button></p>
              </>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}
