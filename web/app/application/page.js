'use client';
// Étape 22a — « Télécharger l'application » : installer le site sur l'écran d'accueil (PWA).
// Chrome / Edge / Android : bouton « Installer » (invite du navigateur). iPhone / iPad : Safari → Partager → « Sur l'écran d'accueil ».
// L'application Android à télécharger (fichier APK) viendra à l'étape 22b. Aucun achat dans l'application : le paiement reste sur le site.
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useApp } from '../../components/Providers';
import { isStandalone, onInstallPrompt, platform, promptInstall } from '../../lib/pwa';

function Steps({ items }) {
  return <ol className="pwa-steps">{items.map((s, i) => <li key={i}><span className="pwa-n" aria-hidden="true">{i + 1}</span><span>{s}</span></li>)}</ol>;
}

export default function AppInstallPage() {
  const { t, appName } = useApp();
  const [pf, setPf] = useState(null);
  const [can, setCan] = useState(false);
  const [installed, setInstalled] = useState(false);
  const [msg, setMsg] = useState('');

  useEffect(() => {
    setPf(platform());
    setInstalled(isStandalone());
    const off = onInstallPrompt(setCan);
    const done = () => { setInstalled(true); setMsg(t('pwaDone')); };
    window.addEventListener('appinstalled', done);
    return () => { off(); window.removeEventListener('appinstalled', done); };
  }, [t]);

  const install = async () => {
    const r = await promptInstall();
    if (r === 'accepted') setMsg(t('pwaDone'));
    else if (r === 'dismissed') setMsg(t('pwaLater'));
  };

  const name = appName || 'Mejliss TV';
  return (
    <main className="pwa-page">
      <section className="pwa-hero">
        <img src="/icon-192.png" alt="" width="96" height="96" className="pwa-icon" />
        <div>
          <h1>{t('pwaTitle')}</h1>
          <p className="meta">{t('pwaLead').replace('{app}', name)}</p>
        </div>
      </section>

      <ul className="pwa-perks">
        <li>{t('pwaPerk1')}</li>
        <li>{t('pwaPerk2')}</li>
        <li>{t('pwaPerk3')}</li>
      </ul>

      <section className="card pwa-card" aria-live="polite">
        {installed ? (
          <p className="ok-msg pwa-installed">✓ {t('pwaInstalled')}</p>
        ) : can ? (
          <>
            <h2>{t('pwaOneClick')}</h2>
            <button type="button" className="btn pwa-btn" onClick={install}>{t('pwaInstall')}</button>
          </>
        ) : pf?.os === 'ios' ? (
          <>
            <h2>{t('pwaIosTitle')}</h2>
            {pf.safari ? <Steps items={[t('pwaIos1'), t('pwaIos2'), t('pwaIos3')]} /> : <p className="meta">{t('pwaIosSafari')}</p>}
          </>
        ) : pf?.os === 'android' ? (
          <>
            <h2>{t('pwaAndroidTitle')}</h2>
            <Steps items={[t('pwaAndroid1'), t('pwaAndroid2'), t('pwaAndroid3')]} />
          </>
        ) : pf ? (
          <>
            <h2>{t('pwaDesktopTitle')}</h2>
            <p className="meta">{pf.safari ? t('pwaDesktopSafari') : t('pwaDesktop')}</p>
          </>
        ) : null}
        {msg && <p className="ok-msg" role="status">{msg}</p>}
      </section>

      <section className="card pwa-card pwa-soon">
        <h2>{t('pwaApkTitle')}</h2>
        <p className="meta">{t('pwaApkSoon')}</p>
      </section>

      <p className="meta small pwa-note">{t('pwaPayNote')} <Link className="link u" href="/pricing">{t('pwaPayLink')}</Link></p>
    </main>
  );
}
