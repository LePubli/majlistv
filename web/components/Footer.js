'use client';
import Link from 'next/link';
import { useApp } from './Providers';

// Pied de page : liens légaux obligatoires, présents sur toutes les pages.
export default function Footer() {
  const { t, appName } = useApp();
  return (
    <footer className="site-footer">
      <span>© {new Date().getFullYear()} {appName}</span>
      <nav aria-label={t('legalNav')}>
        <Link href="/legal/mentions-legales">{t('legalNotice')}</Link>
        <Link href="/legal/cgv">{t('legalTerms')}</Link>
        <Link href="/legal/confidentialite">{t('legalPrivacy')}</Link>
      </nav>
    </footer>
  );
}
