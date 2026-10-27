'use client';
// Mon compte → Sécurité : double authentification (étape 31). Activation par application d'authentification (QR code ou clé),
// 10 codes de secours montrés une seule fois, désactivation et nouveaux codes (mot de passe + code demandés).
import { useCallback, useEffect, useState } from 'react';
import { useApp } from './Providers';
import QrCode from './QrCode';

const date = (d, locale) => new Date(d).toLocaleDateString(locale, { day: 'numeric', month: 'long', year: 'numeric' });

function Codes({ codes, onDone }) {
  const { t } = useApp();
  const [copied, setCopied] = useState(false);
  const text = codes.join('\n');
  const copy = async () => { try { await navigator.clipboard.writeText(text); setCopied(true); } catch { /* le navigateur refuse : le téléchargement reste possible */ } };
  const download = () => {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([text + '\n'], { type: 'text/plain' }));
    a.download = 'codes-de-secours.txt';
    a.click();
    URL.revokeObjectURL(a.href);
  };
  return (
    <div className="tf-codes">
      <h3>{t('tfSaveCodes')}</h3>
      <p className="meta">{t('tfSaveCodesHelp')}</p>
      <ul className="tf-codelist" dir="ltr">{codes.map((c) => <li key={c}><code>{c}</code></li>)}</ul>
      <div className="tf-actions">
        <button type="button" className="btn ghost" onClick={copy}>{copied ? t('tfCopied') : t('tfCopy')}</button>
        <button type="button" className="btn ghost" onClick={download}>{t('tfDownload')}</button>
        <button type="button" className="btn" onClick={onDone}>{t('tfDone')}</button>
      </div>
    </div>
  );
}

export default function TwoFactor() {
  const { t, locale, call } = useApp();
  const [st, setSt] = useState(null);
  const [mode, setMode] = useState(null); // null | 'password' | 'scan' | 'codes' | 'disable' | 'recovery'
  const [password, setPassword] = useState('');
  const [code, setCode] = useState('');
  const [setup, setSetup] = useState(null);
  const [codes, setCodes] = useState(null);
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);

  const load = useCallback(() => call('/me/2fa').then((r) => { if (r.ok) setSt(r.data); }), [call]);
  useEffect(() => { load(); }, [load]);

  const reset = () => { setMode(null); setPassword(''); setCode(''); setSetup(null); setErr(''); };
  const fail = (r) => {
    const c = r.data?.code;
    setErr(c === 'bad_code' ? t('tfBadCode') : c === 'locked' ? t('tfLocked') : r.status === 403 ? t('tfBadPwd') : r.data?.error || t('errGeneric'));
  };
  const post = async (path, body) => { setBusy(true); setErr(''); const r = await call(path, { method: 'POST', body: JSON.stringify(body) }); setBusy(false); return r; };

  const start = async (e) => {
    e.preventDefault();
    const r = await post('/me/2fa/setup', { password });
    if (!r.ok) return fail(r);
    setSetup(r.data); setPassword(''); setMode('scan');
  };
  const confirm = async (e) => {
    e.preventDefault();
    const r = await post('/me/2fa/enable', { code });
    if (!r.ok) return fail(r);
    setCodes(r.data.recoveryCodes); setMode('codes'); setCode(''); setSetup(null); load();
  };
  const sensitive = (path, after) => async (e) => {
    e.preventDefault();
    const r = await post(path, { password, code });
    if (!r.ok) return fail(r);
    after(r.data);
  };
  const disable = sensitive('/me/2fa/disable', () => { reset(); load(); });
  const newCodes = sensitive('/me/2fa/recovery', (d) => { setCodes(d.recoveryCodes); setMode('codes'); setPassword(''); setCode(''); load(); });

  if (!st) return null;
  const sensitiveForm = (onSubmit, label, danger) => (
    <form className="tf-form" onSubmit={onSubmit}>
      {danger && <p className="meta">{t('tfWarnDisable')}</p>}
      <label>{t('tfPassword')}<input type="password" autoComplete="current-password" required value={password} onChange={(e) => setPassword(e.target.value)} /></label>
      <label>{t('tfNeedCode')}<input inputMode="text" autoComplete="one-time-code" required value={code} onChange={(e) => setCode(e.target.value)} dir="ltr" /></label>
      {err && <p className="error" role="alert">{err}</p>}
      <div className="tf-actions"><button className="btn" disabled={busy}>{label}</button><button type="button" className="btn ghost" onClick={reset}>{t('tfCancel')}</button></div>
    </form>
  );

  return (
    <section className="card-lite tf">
      <h2>{t('tfTitle')}</h2>
      <p className="meta">{t('tfIntro')}</p>
      <p><span className={`tf-badge ${st.enabled ? 'on' : 'off'}`}>{st.enabled ? t('tfOn') : t('tfOff')}</span>
        {st.enabled && st.enabledAt && <span className="meta"> · {t('tfOnSince').replace('{date}', date(st.enabledAt, locale))} · {t('tfLeft').replace('{n}', st.recoveryLeft)}</span>}</p>
      {!st.available && <p className="error">{t('tfUnavailable')}</p>}

      {mode === 'codes' && codes && <Codes codes={codes} onDone={() => { setCodes(null); reset(); }} />}

      {!mode && st.available && !st.enabled && <button className="btn" onClick={() => setMode('password')}>{t('tfEnable')}</button>}
      {mode === 'password' && (
        <form className="tf-form" onSubmit={start}>
          <label>{t('tfPassword')}<input type="password" autoComplete="current-password" required value={password} onChange={(e) => setPassword(e.target.value)} /></label>
          {err && <p className="error" role="alert">{err}</p>}
          <div className="tf-actions"><button className="btn" disabled={busy}>{t('tfContinue')}</button><button type="button" className="btn ghost" onClick={reset}>{t('tfCancel')}</button></div>
        </form>
      )}
      {mode === 'scan' && setup && (
        <form className="tf-form" onSubmit={confirm}>
          <p>{t('tfScan')}</p>
          <QrCode text={setup.uri} label={t('tfScan')} />
          <p className="meta small">{t('tfManual')} <code className="tf-key" dir="ltr">{setup.secret.replace(/(.{4})/g, '$1 ').trim()}</code></p>
          <p>{t('tfEnterCode')}</p>
          <label>{t('tfCode')}<input inputMode="numeric" autoComplete="one-time-code" pattern="[0-9 ]{6,7}" maxLength={7} required value={code} onChange={(e) => setCode(e.target.value)} dir="ltr" /></label>
          {err && <p className="error" role="alert">{err}</p>}
          <div className="tf-actions"><button className="btn" disabled={busy}>{t('tfConfirm')}</button><button type="button" className="btn ghost" onClick={reset}>{t('tfCancel')}</button></div>
        </form>
      )}

      {!mode && st.enabled && (
        <div className="tf-actions">
          <button className="btn ghost" onClick={() => setMode('recovery')}>{t('tfNewCodes')}</button>
          <button className="btn ghost" onClick={() => setMode('disable')}>{t('tfDisable')}</button>
        </div>
      )}
      {mode === 'recovery' && sensitiveForm(newCodes, t('tfConfirmBtn'), false)}
      {mode === 'disable' && sensitiveForm(disable, t('tfDisable'), true)}
    </section>
  );
}
