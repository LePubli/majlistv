'use client';
// Étape 22a — enregistre le service worker du site installable (public/sw.js) et capte l'invite d'installation.
// Fonction coupée (Admin → Fonctions → « Application installable ») : le service worker déjà installé est retiré et ses fichiers effacés.
import { useEffect } from 'react';
import { useApp } from './Providers';
import { setInstallPrompt } from '../lib/pwa';

export default function PwaRegister() {
  const { feat, locale } = useApp();
  const on = feat('app_install');

  useEffect(() => {
    const keep = (e) => { e.preventDefault(); setInstallPrompt(e); }; // l'invite sera ouverte par le bouton « Installer »
    const done = () => setInstallPrompt(null);
    window.addEventListener('beforeinstallprompt', keep);
    window.addEventListener('appinstalled', done);
    return () => { window.removeEventListener('beforeinstallprompt', keep); window.removeEventListener('appinstalled', done); };
  }, []);

  useEffect(() => {
    if (!('serviceWorker' in navigator) || !window.isSecureContext) return;
    if (!on) {
      // Retrait, puis effacement des fichiers gardés (refait à chaque page : la page ouverte peut encore être servie par l'ancien service worker).
      navigator.serviceWorker.getRegistrations()
        .then((regs) => Promise.all(regs.filter((r) => (r.active || r.installing || r.waiting)?.scriptURL?.endsWith('/sw.js')).map((r) => r.unregister())))
        .then(() => (window.caches ? caches.keys() : []))
        .then((ks) => Promise.all(ks.filter((k) => k.startsWith('mejliss-')).map((k) => caches.delete(k))))
        .catch(() => {});
      return;
    }
    navigator.serviceWorker.register('/sw.js', { scope: '/' })
      .then(() => navigator.serviceWorker.ready)
      .then((reg) => reg.active?.postMessage({ type: 'locale', locale })) // langue de la page « hors connexion »
      .catch(() => {});
  }, [on, locale]);

  return null;
}
