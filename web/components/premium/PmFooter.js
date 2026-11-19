'use client';
// Pied de page du thème Premium : reproduction du pied de page de la maquette V20 (rangée de liens, puis marque,
// texte et ©). Les liens de la maquette sont remplacés par les vraies pages du site ; les liens légaux restent
// obligatoires. Langue et thème se choisissent ici (un visiteur doit pouvoir quitter le thème sans compte).
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useApp } from '../Providers';
import SkinPicker from '../SkinPicker';
import { LOCALES } from '../../lib/locales';
import { BrandWord } from './PmBrand';

export default function PmFooter() {
  const { t, appName, kid, feat, user, locale } = useApp();
  const path = usePathname() || '/';
  const router = useRouter();
  if (kid || path.startsWith('/studio') || path.startsWith('/admin')) return null;
  const links = [
    { href: user ? '/account' : '/login', label: user ? t('account') : t('login'), on: true },
    { href: '/pricing', label: t('pricing'), on: true },
    { href: '/catalogue', label: t('hmSearch'), on: true },
    { href: '/learning', label: t('navLearn'), on: feat('learning') },
    { href: '/application', label: t('pwaNav'), on: feat('app_install') },
    { href: '/chaines', label: t('spTitle'), on: feat('channels') },
    { href: '/legal/mentions-legales', label: t('legalNotice'), on: true },
    { href: '/legal/cgv', label: t('legalTerms'), on: true },
    { href: '/legal/confidentialite', label: t('legalPrivacy'), on: true },
    { href: '/licences', label: t('licNav'), on: true },
  ].filter((x) => x.on);
  const setLocale = (e) => {
    document.cookie = `locale=${e.target.value};path=/;max-age=31536000;samesite=lax`;
    router.refresh();
  };
  return (
    <div className="v20-app v20-part">
      <footer className="v20-footer">
        <nav className="v20-shell v20-mv20-footer-links" aria-label={t('legalNav')}>
          {links.map((l) => <Link key={l.href} href={l.href}>{l.label}</Link>)}
        </nav>
        <div className="v20-shell v20-footer-inner">
          <div className="v20-brand"><img src="/brand/emblem-bleu-s.png" alt="" width="26" height="28" /><BrandWord name={appName} /></div>
          <div>{t('tagline')}</div>
          <div>© {new Date().getFullYear()} {appName}</div>
        </div>
        <div className="v20-shell pm-footer-opts">
          <select value={locale} onChange={setLocale} aria-label={t('languageMenu')}>
            {Object.entries(LOCALES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
          <SkinPicker />
        </div>
      </footer>
    </div>
  );
}
