'use client';
// Étape 21 — Bouton « Suivre » sur la page d'un intervenant : alerte e-mail à chaque nouvelle conférence.
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { authPath } from '../lib/nav';

export default function FollowButton({ slug, t, call, user }) {
  const [on, setOn] = useState(null); // null = inconnu (chargement ou déconnecté)
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  useEffect(() => {
    if (!user) { setOn(null); return undefined; }
    let off = false;
    call('/me/notifications').then((r) => { if (!off && r.ok) setOn(r.data.follows.some((f) => f.slug === slug)); });
    return () => { off = true; };
  }, [user, slug, call]);
  if (!user) return <Link className="fav" href={authPath('login', `/intervenants/${slug}`)} title={t('nfFollowLogin')}>＋ {t('nfFollow')}</Link>;
  if (on === null) return null;
  const toggle = async () => {
    setBusy(true); setErr('');
    const r = await call(`/speakers/${slug}/follow`, { method: on ? 'DELETE' : 'PUT' });
    if (r.ok) setOn(!on); else setErr(r.status === 409 ? t('nfFollowMax') : (r.data?.error || t('errGeneric')));
    setBusy(false);
  };
  return (
    <span className="nf-follow">
      <button type="button" className={`fav ${on ? 'on' : ''}`} aria-pressed={on} disabled={busy} title={t('nfFollowHint')} onClick={toggle}>
        {on ? t('nfFollowing') : `＋ ${t('nfFollow')}`}
      </button>
      {err && <span className="error small" role="alert"> {err}</span>}
    </span>
  );
}
