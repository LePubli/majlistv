'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useApp } from './Providers';

// Pied de page : marque et liens légaux obligatoires, présents sur toutes les pages.
export default function Footer() {
  const { t, appName, kid, feat } = useApp();
  const path = usePathname();
  if (kid || path.startsWith('/studio') || path.startsWith('/admin')) return null; // espace enfant : pas de liens hors de Kids
  return (
    <footer className="site-footer">
      <span className="footer-brand">
        <img src="/brand/emblem.png" alt="" width="26" height="28" />
        <span>© {new Date().getFullYear()} {appName} · {t('tagline')}</span>
      </span>
      <nav aria-label={t('legalNav')}>
        {feat('channels') && <Link href="/chaines">{t('spTitle')}</Link>}
        <Link href="/legal/mentions-legales">{t('legalNotice')}</Link>
        <Link href="/legal/cgv">{t('legalTerms')}</Link>
        <Link href="/legal/confidentialite">{t('legalPrivacy')}</Link>
      </nav>
    </footer>
  );
}
