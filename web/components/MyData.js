'use client';
// Mon compte → Mes données (étape 36, RGPD) : exporter toutes ses données (fichier JSON) et supprimer définitivement son compte
// (mot de passe + code de double authentification si activée ; les abonnements en cours sont arrêtés).
import { useEffect, useState } from 'react';
import { useApp } from './Providers';

export default function MyData() {
  const { t, call } = useApp();
  const [info, setInfo] = useState(null);
  const [msg, setMsg] = useState('');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState('');
  const [open, setOpen] = useState(false);
  const [password, setPassword] = useState('');
  const [code, setCode] = useState('');
  const [sure, setSure] = useState(false);

  useEffect(() => { call('/me/data/check').then((r) => r.ok && setInfo(r.data)); }, [call]);

  const exportData = async () => {
    setBusy('export'); setMsg(''); setErr('');
    const r = await call('/me/export');
    setBusy('');
    if (!r.ok) { setErr(r.status === 429 ? t('dtTooMany') : r.data?.error || t('errGeneric')); return; }
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([JSON.stringify(r.data, null, 2)], { type: 'application/json' }));
    a.download = `mejliss-mes-donnees-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(a.href);
    setMsg(t('dtExported'));
  };

  const remove = async (e) => {
    e.preventDefault();
    setBusy('delete'); setErr('');
    const r = await call('/me/delete', { method: 'POST', body: JSON.stringify({ password, ...(code.trim() ? { code: code.trim() } : {}) }) });
    setBusy('');
    // Chargement complet de l'accueil : la page Mon compte ne doit pas renvoyer vers la connexion pendant la déconnexion.
    if (r.ok) { try { localStorage.removeItem('token'); } catch { /* sans importance : la session n'existe plus côté serveur */ } window.location.assign('/'); return; }
    const c = r.data?.code;
    setErr(c === 'bad_password' ? t('dtBadPwd') : c === 'code_required' ? t('dtNeedCode') : c === 'bad_code' ? t('tfBadCode') : r.status === 429 ? t('dtTooMany') : r.data?.error || t('errGeneric'));
  };

  const blocked = info?.blockers?.length > 0;
  return (
    <section className="tf" aria-labelledby="dt-h">
      <h2 id="dt-h">{t('dtTitle')}</h2>
      <h3>{t('dtExportH')}</h3>
      <p className="meta">{t('dtExportTxt')}</p>
      <div className="tf-actions"><button type="button" className="btn" disabled={busy === 'export'} onClick={exportData}>{busy === 'export' ? '…' : t('dtExportBtn')}</button></div>
      <p className="meta small" role="status" aria-live="polite">{msg}</p>

      <h3>{t('dtDelH')}</h3>
      <p className="meta">{t('dtDelTxt')}</p>
      <p className="meta">{t('dtKeep')}</p>
      {info?.hasSubscription && <p className="soon" role="status">{t('dtSub')}</p>}
      {blocked && info.blockers.map((b) => <p key={b.code} className="error" role="alert">{b.message}</p>)}
      {!open ? (
        <div className="tf-actions"><button type="button" className="btn danger" disabled={blocked || !info} onClick={() => setOpen(true)}>{t('dtDelBtn')}</button></div>
      ) : (
        <form className="tf-form" onSubmit={remove}>
          <label>{t('dtPw')}<input type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} required /></label>
          {info?.twoFactor && <label>{t('dtCode')}<input inputMode="text" autoComplete="one-time-code" value={code} onChange={(e) => setCode(e.target.value)} required /></label>}
          <label className="rv-email"><input type="checkbox" checked={sure} onChange={(e) => setSure(e.target.checked)} /><span>{t('dtSure')}</span></label>
          <div className="tf-actions">
            <button type="submit" className="btn danger" disabled={!sure || !password || busy === 'delete'}>{busy === 'delete' ? '…' : t('dtConfirm')}</button>
            <button type="button" className="btn ghost" onClick={() => { setOpen(false); setPassword(''); setCode(''); setSure(false); setErr(''); }}>{t('dtCancel')}</button>
          </div>
        </form>
      )}
      {err && <p className="error" role="alert">{err}</p>}
    </section>
  );
}
