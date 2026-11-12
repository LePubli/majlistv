'use client';
// Studio → Sous-titres : deux onglets pour une même rubrique (audit 11/2026).
//   « Par contenu »            /studio/subtitles    — langue transcrite et sous-titres de chaque contenu
//   « Corrections des membres » /studio/corrections  — suggestions à relire (module « corrections »)
// Les adresses ne changent pas. Les onglets n'apparaissent que si le module « corrections » est utilisable ;
// un modérateur (qui n'a pas l'écran « Par contenu ») garde l'écran des corrections seul, sans onglets.
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useApp } from './Providers';
import { hasWebModule } from '../lib/modules';

/** Vrai si la rubrique « Sous-titres » a ses deux onglets pour ce rôle. */
export const subtitleTabsOn = (role, corrections) => corrections && ['organizer', 'admin'].includes(role);

export default function SubtitleTabs({ pending }) {
  const { t, user, call, modUsable } = useApp();
  const path = usePathname() || '';
  const on = subtitleTabsOn(user?.role, hasWebModule('corrections') && modUsable('corrections'));
  const [count, setCount] = useState(null);
  // L'écran des corrections connaît déjà le nombre en attente (prop « pending ») ; l'autre onglet le demande une fois.
  useEffect(() => {
    if (!on || pending != null) return undefined;
    let alive = true;
    call('/studio/corrections?status=pending').then((r) => { if (alive && r.ok) setCount(r.data?.counts?.pending ?? 0); });
    return () => { alive = false; };
  }, [on, pending, call]);
  if (!on) return null;
  const n = pending != null ? pending : count;
  const tabs = [['/studio/subtitles', t('sdSubTabMine'), ''], ['/studio/corrections', t('sdSubTabCor'), n > 0 ? String(n) : '']];
  return (
    <nav className="sd-tabs" aria-label={t('sdSubs')}>
      {tabs.map(([href, label, badge]) => {
        const cur = path.startsWith(href);
        return (
          <Link key={href} href={href} className={cur ? 'on' : ''} aria-current={cur ? 'page' : undefined}>
            {label}{badge && <span className="sd-tabs-n" aria-label={t('sdSubTabWaiting').replace('{n}', badge)}>{badge}</span>}
          </Link>
        );
      })}
    </nav>
  );
}
