'use client';
// Étape 40 — « Notifications dans le navigateur » (Mon compte → Mes e-mails). Active/désactive les notifications sur CET appareil.
import { useCallback, useEffect, useState } from 'react';
import { useApp } from './Providers';
import { browserEnv, currentSubscription, disablePush, enablePush, pushSupport } from '../lib/webPush';

export default function WebPushToggle() {
  const { t, call, feat, locale } = useApp();
  const [state, setState] = useState(null); // support
  const [on, setOn] = useState(false);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');

  const refresh = useCallback(async () => {
    const s = pushSupport(browserEnv());
    setState(s);
    setOn(s === 'granted' ? Boolean(await currentSubscription()) : false);
  }, []);
  useEffect(() => { refresh(); }, [refresh]);

  if (!feat('webpush') || !state) return null;
  const toggle = async () => {
    setBusy(true); setMsg('');
    try {
      if (on) { await disablePush(call); setMsg(t('wpOffDone')); } else {
        const r = await enablePush(call, locale);
        setMsg(r.ok ? t('wpOnDone') : r.reason === 'denied' ? t('wpDenied') : r.reason === 'dismissed' ? '' : t('wpError'));
      }
    } catch { setMsg(t('wpError')); }
    await refresh(); setBusy(false);
  };
  const test = async () => {
    setBusy(true);
    const r = await call('/me/web-push/test', { method: 'POST' });
    setMsg(r.ok ? t('wpTestSent') : t('wpTestFail'));
    setBusy(false);
  };
  const blocked = state === 'unsupported' || state === 'ios_install' || state === 'denied';
  return (
    <div className="wp-box" id="web-push">
      <h3>{t('wpTitle')}</h3>
      <p className="meta small">{t('wpIntro')}</p>
      {state === 'unsupported' && <p className="meta small" role="status">{t('wpUnsupported')}</p>}
      {state === 'ios_install' && <p className="meta small" role="status">{t('wpIos')}</p>}
      {state === 'denied' && <p className="meta small" role="status">{t('wpDenied')}</p>}
      {!blocked && (
        <div className="wp-actions">
          <button type="button" className={on ? 'btn ghost small' : 'btn small'} onClick={toggle} disabled={busy} aria-pressed={on}>
            {on ? t('wpDisable') : t('wpEnable')}
          </button>
          {on && <button type="button" className="btn ghost small" onClick={test} disabled={busy}>{t('wpTest')}</button>}
        </div>
      )}
      <p className="meta small" role="status" aria-live="polite">{msg || ' '}</p>
    </div>
  );
}
