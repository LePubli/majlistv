'use client';
// Étape 22a — « Télécharger l'application » : installer le site sur l'écran d'accueil (PWA).
// Chrome / Edge / Android : bouton « Installer » (invite du navigateur). iPhone / iPad : Safari → Partager → « Sur l'écran d'accueil ».
// Application Android (fichier APK publié sur notre serveur, étape 22b-5) : carte « Télécharger » avec version, taille, nouveautés et étapes d'installation (22b-7). Aucun achat dans l'application : le paiement reste sur le site.
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useApp } from '../../components/Providers';
import { isStandalone, onInstallPrompt, platform, promptInstall } from '../../lib/pwa';

function Steps({ items }) {
  return <ol className="pwa-steps">{items.map((s, i) => <li key={i}><span className="pwa-n" aria-hidden="true">{i + 1}</span><span>{s}</span></li>)}</ol>;
}

export default function AppInstallPage() {
  const { t, appName, locale, call } = useApp();
  const [apk, setApk] = useState(undefined); // undefined = on vérifie, null = aucune version publiée (ou fonction coupée)
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

  useEffect(() => {
    let dead = false;
    call('/app/latest?platform=android&versionCode=0')
      .then((r) => { if (!dead) setApk(r.ok && r.data?.latest?.downloadUrl ? r.data.latest : null); })
      .catch(() => { if (!dead) setApk(null); });
    return () => { dead = true; };
  }, [call]);

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

      {apk ? (
        <section className="card pwa-card" aria-labelledby="pwa-apk-title">
          <h2 id="pwa-apk-title">{t('pwaApkTitle')}</h2>
          <p className="meta">{t('pwaApkLead')}</p>
          <p className="pwa-apkmeta">
            <strong>{name} {apk.version}</strong>
            {apk.size ? <span> · {(apk.size / 1048576).toFixed(apk.size >= 104857600 ? 0 : 1)} {t('pwaApkMb')}</span> : null}
            {apk.publishedAt ? <span> · {new Date(apk.publishedAt).toLocaleDateString(locale)}</span> : null}
          </p>
          {(apk.notes?.[locale] || apk.notes?.fr) ? <p className="meta pwa-apknotes">{apk.notes[locale] || apk.notes.fr}</p> : null}
          <a className="btn pwa-btn" href={apk.downloadUrl} rel="nofollow">{t('pwaApkDownload')}</a>
          {pf && pf.os !== 'android' ? <p className="meta small">{t('pwaApkOther')}</p> : null}
          <h3 className="pwa-h3">{t('pwaApkHow')}</h3>
          <Steps items={[t('pwaApkS1'), t('pwaApkS2'), t('pwaApkS3'), t('pwaApkS4')]} />
          <p className="meta small">{t('pwaApkUpdates')}</p>
          <p className="meta small pwa-sha">SHA-256 : <code>{apk.sha256}</code></p>
        </section>
      ) : apk === null ? (
        <section className="card pwa-card pwa-soon">
          <h2>{t('pwaApkTitle')}</h2>
          <p className="meta">{t('pwaApkSoon')}</p>
        </section>
      ) : null}

      <p className="meta small pwa-note">{t('pwaPayNote')} <Link className="link u" href="/pricing">{t('pwaPayLink')}</Link></p>
    </main>
  );
}
