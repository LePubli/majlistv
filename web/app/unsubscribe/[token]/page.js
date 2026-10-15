'use client';
// Étape 21 — Désinscription en un clic depuis un e-mail (sans connexion). Ouvrir la page ne change rien : il faut cliquer sur le bouton.
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useApp } from '../../../components/Providers';

export default function Unsubscribe() {
  const { token } = useParams();
  const { t, call } = useApp();
  const [info, setInfo] = useState(null);
  const [bad, setBad] = useState(false);
  const [done, setDone] = useState(false);
  const [busy, setBusy] = useState(false);
  useEffect(() => { call(`/unsubscribe/${token}`, {}, null).then((r) => (r.ok ? setInfo(r.data) : setBad(true))); }, [call, token]);
  const what = info ? t(info.category === 'weekly' ? 'unWeekly' : 'unSpeakers') : '';
  const go = async () => {
    setBusy(true);
    const r = await call(`/unsubscribe/${token}`, { method: 'POST', body: '{}' }, null);
    if (r.ok) setDone(true); else setBad(true);
    setBusy(false);
  };
  return (
    <main className="page gf-page">
      <meta name="robots" content="noindex" />
      <h1>{t('unTitle')}</h1>
      {bad && <p className="error" role="alert">{t('unBad')}</p>}
      {!bad && !info && <p className="meta">…</p>}
      {info && !done && info.subscribed && (
        <>
          <p className="th-lead">{t('unAsk').replace('{what}', what)}</p>
          <button type="button" className="btn btn-lg" disabled={busy} onClick={go}>{t('unBtn')}</button>
        </>
      )}
      {info && !done && !info.subscribed && <p className="soon" role="status">{t('unAlready').replace('{what}', what)}</p>}
      {done && <p className="soon" role="status">{t('unDone')}</p>}
      <p className="meta small"><Link className="link u" href="/account#emails">{t('unManage')}</Link> · <Link className="link u" href="/">{t('unHome')}</Link></p>
    </main>
  );
}
