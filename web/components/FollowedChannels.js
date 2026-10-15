'use client';
// Bibliothèque → Chaînes suivies (étape C) : les chaînes dont on reçoit les nouveautés, avec « Ne plus suivre ».
import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useApp } from './Providers';

export default function FollowedChannels() {
  const { t, call, user } = useApp();
  const [list, setList] = useState(null);
  const load = useCallback(() => call('/me/notifications').then((r) => setList(r.ok ? r.data.follows : [])), [call]);
  useEffect(() => { if (user) load(); }, [user, load]);
  const stop = async (slug) => { setList((l) => l.filter((x) => x.slug !== slug)); await call(`/speakers/${slug}/follow`, { method: 'DELETE' }); };
  if (list === null) return null;
  if (list.length === 0) return <p className="meta">{t('chFollowNone')} <Link className="link u" href="/chaines">{t('chBrowse')}</Link></p>;
  return (
    <ul className="spk-list ch-followed">
      {list.map((f) => (
        <li key={f.slug}>
          <Link href={`/chaines/${f.slug}`}><span className="ch-avatar" aria-hidden="true">{(f.name || '?').trim().charAt(0).toUpperCase()}</span><span className="ch-li-text"><b>{f.name}</b></span></Link>
          <button type="button" className="btn ghost" onClick={() => stop(f.slug)}>{t('chUnfollow')}</button>
        </li>
      ))}
    </ul>
  );
}
