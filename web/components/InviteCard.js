'use client';
// Étape B4 — Invitation des visiteurs : carte « Créez votre compte gratuit » adaptée à l'endroit (Coran, Ramadan, Apprendre,
// fin d'aperçu d'une vidéo), au lieu d'un simple bouton « Se connecter ». Ne s'affiche jamais pour un membre connecté.
// Inscription fermée (Admin → Fonctions → registration) : seul « J'ai déjà un compte » reste.
import Link from 'next/link';
import { useApp } from './Providers';

const TEXT = { quran: 'ivQuran', ramadan: 'ivRamadan', learn: 'ivLearn', preview: 'ivPreview' };

export default function InviteCard({ context = 'quran', next = '/', compact = false }) {
  const { t, user, ready, feat } = useApp();
  if (!ready || user) return null;
  const q = encodeURIComponent(next);
  const canRegister = feat('registration');
  return (
    <section className={`invite${compact ? ' invite-compact' : ''}`} aria-labelledby={`iv-${context}`}>
      <h2 id={`iv-${context}`}>{t('ivTitle')}</h2>
      <p className="invite-text">{t(TEXT[context] || 'ivQuran')}</p>
      {!compact && (
        <ul className="invite-list">
          <li>{t('ivB1')}</li><li>{t('ivB2')}</li><li>{t('ivB3')}</li>
        </ul>
      )}
      {context === 'learn' && <p className="meta small">{t('ivLearnNote')}</p>}
      <p className="invite-actions">
        {canRegister && <Link className="btn" href={`/register?next=${q}`}>{t('ivCreate')}</Link>}
        <Link className={canRegister ? 'btn ghost' : 'btn'} href={`/login?next=${q}`}>{t('haveAccount')}</Link>
      </p>
    </section>
  );
}
