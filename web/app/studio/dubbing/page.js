'use client';
// Studio → sdDub : écran annoncé par la maquette, pas encore développé. Page honnête : aucune fonction simulée.
import Link from 'next/link';
import { useApp } from '../../../components/Providers';

export default function Soon() {
  const { t } = useApp();
  return (
    <main className="studio-page studio-narrow">
      <div className="studio-head"><h1 className="studio-title">{t('sdDub')} <em className="studio-soon">{t('sdSoon')}</em></h1></div>
      <section className="sd-card">
        <p>{t('sdDubText')}</p>
        <Link href="/studio/contents" className="btn ghost">{t('sdBackContents')}</Link>
      </section>
    </main>
  );
}
