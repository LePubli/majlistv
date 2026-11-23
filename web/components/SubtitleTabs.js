'use client';
// Studio → Sous-titres : deux onglets pour une même rubrique (audit 11/2026).
//   « Par contenu »            /studio/subtitles          — langue transcrite et sous-titres de chaque contenu
//   « Qualité »                /studio/subtitles/quality  — note de lisibilité et de complétude de chaque langue
//   « Corrections des membres » /studio/corrections        — suggestions à relire (module « corrections », seulement s'il est utilisable)
// Organisateur et administrateur ont toujours les onglets (Par contenu, Qualité) ; la ligne « Corrections » s'y ajoute quand le module
// est utilisable. Un modérateur (qui n'a pas ces écrans) garde l'écran des corrections seul, sans onglets.
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useApp } from './Providers';
import { hasWebModule } from '../lib/modules';

/** Vrai si la rubrique « Sous-titres » a ses onglets pour ce rôle (le second argument, module « corrections » utilisable, ne change que la liste). */
export const subtitleTabsOn = (role) => ['organizer', 'admin'].includes(role);

export default function SubtitleTabs({ pending }) {
  const { t, user, call, modUsable } = useApp();
  const path = usePathname() || '';
  const on = subtitleTabsOn(user?.role);
  const withCor = hasWebModule('corrections') && modUsable('corrections');
  const [count, setCount] = useState(null);
  // L'écran des corrections connaît déjà le nombre en attente (prop « pending ») ; l'autre onglet le demande une fois.
  useEffect(() => {
    if (!on || !withCor || pending != null) return undefined;
    let alive = true;
    call('/studio/corrections?status=pending').then((r) => { if (alive && r.ok) setCount(r.data?.counts?.pending ?? 0); });
    return () => { alive = false; };
  }, [on, withCor, pending, call]);
  if (!on) return null;
  const n = pending != null ? pending : count;
  const tabs = [['/studio/subtitles', t('sdSubTabMine'), ''], ['/studio/subtitles/quality', t('sdSubTabQual'), '']];
  if (withCor) tabs.push(['/studio/corrections', t('sdSubTabCor'), n > 0 ? String(n) : '']);
  return (
    <nav className="sd-tabs" aria-label={t('sdSubs')}>
      {tabs.map(([href, label, badge]) => {
        const cur = href === '/studio/subtitles' ? path === href || path === href + '/' : path.startsWith(href);
        return (
          <Link key={href} href={href} className={cur ? 'on' : ''} aria-current={cur ? 'page' : undefined}>
            {label}{badge && <span className="sd-tabs-n" aria-label={t('sdSubTabWaiting').replace('{n}', badge)}>{badge}</span>}
          </Link>
        );
      })}
    </nav>
  );
}
