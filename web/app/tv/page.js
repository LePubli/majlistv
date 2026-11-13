'use client';
// Connexion d'une télé (application TV) : la télé affiche un code et un QR code qui mène ici (/tv?code=…).
// La personne, connectée sur ce téléphone ou cet ordinateur, vérifie le code et valide : la télé se connecte à son compte.
import { Suspense, useEffect, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { useApp } from '../../components/Providers';

export default function TvPage() {
  return <Suspense fallback={<main className="page" aria-busy="true" />}><TvLink /></Suspense>;
}

const fmt = (c) => (c.length > 4 ? `${c.slice(0, 4)} ${c.slice(4)}` : c);
const clean = (v) => String(v || '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 8);

function TvLink() {
  const { t, call, user, ready } = useApp();
  const sp = useSearchParams();
  const [code, setCode] = useState(clean(sp.get('code')));
  const [info, setInfo] = useState(null); // { device, expiresIn }
  const [err, setErr] = useState('');
  const [done, setDone] = useState(null); // 'allowed' | 'denied'
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    setInfo(null); setErr('');
    if (!user || code.length !== 8) return;
    call(`/auth/tv/code/${code}`).then((r) => { if (r.ok) setInfo(r.data); else setErr(r.data?.error || t('errGeneric')); });
  }, [code, user, call, t]);

  const decide = async (allow) => {
    setBusy(true);
    const r = await call('/auth/tv/approve', { method: 'POST', body: JSON.stringify({ code, allow }) });
    setBusy(false);
    if (!r.ok) { setErr(r.data?.error || t('errGeneric')); return; }
    setDone(allow ? 'allowed' : 'denied');
  };

  if (!ready) return <main className="page" aria-busy="true" />;
  return (
    <main className="page tv-link">
      <h1>{t('tvTitle')}</h1>
      {!user ? (
        <section className="panel">
          <p>{t('tvNeedLogin')}</p>
          <Link className="btn" href={`/login?next=${encodeURIComponent(`/tv${code ? `?code=${code}` : ''}`)}`}>{t('login')}</Link>
        </section>
      ) : done ? (
        <section className="panel" role="status">
          <p className="tv-done">{done === 'allowed' ? `✓ ${t('tvAllowed')}` : t('tvDenied')}</p>
        </section>
      ) : (
        <section className="panel">
          <p className="meta">{t('tvHelp')}</p>
          <label className="fld">
            <span>{t('tvCode')}</span>
            <input className="tv-code" value={fmt(code)} onChange={(e) => setCode(clean(e.target.value))} inputMode="text" autoCapitalize="characters" autoComplete="one-time-code"
              placeholder="ABCD 2345" maxLength={9} dir="ltr" aria-describedby="tv-who" />
          </label>
          <p id="tv-who" className="meta">{t('tvAs').replace('{name}', user.name || user.email)}</p>
          {err && <p className="error" role="alert">{err}</p>}
          {info && (
            <div className="tv-confirm">
              <p>{info.device ? t('tvConfirmDevice').replace('{device}', info.device) : t('tvConfirm')}</p>
              <div className="tv-btns">
                <button type="button" className="btn btn-lg" disabled={busy} onClick={() => decide(true)}>{t('tvAllow')}</button>
                <button type="button" className="btn ghost" disabled={busy} onClick={() => decide(false)}>{t('tvDeny')}</button>
              </div>
            </div>
          )}
        </section>
      )}
    </main>
  );
}
