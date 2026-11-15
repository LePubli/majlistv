'use client';
// Navigation de novembre 2026 (lots D et E) — onglets d'une destination.
//
// « Catalogue » réunit les types de contenu (Vidéos, Séries, Shorts, Collections, Chaînes, Audio, Ouvrages, En direct) et
// « Pratique » les gestes quotidiens (Prière, Coran, Adhkar, Ramadan). Chaque type garde sa page et son adresse : cette barre,
// posée en haut de chacune (app/layout.js), les présente comme les onglets d'une même rubrique.
// Elle ne s'affiche que sur les pages de liste (adresse exacte), jamais sur une fiche (/series/<id>, /coran/<n>…).
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useApp } from './Providers';

// Rubrique d'une adresse (aussi utilisée par le menu du haut et le menu latéral pour marquer la destination active).
export const SECTION_PATHS = {
  catalogue: ['/catalogue', '/series', '/shorts', '/collections', '/chaines', '/audyn', '/books', '/live', '/events'],
  pratique: ['/pratique', '/priere', '/coran', '/adhkar', '/ramadan'],
};
export const sectionOf = (path) => Object.keys(SECTION_PATHS).find((s) => SECTION_PATHS[s].some((p) => path === p || path.startsWith(p + '/'))) || null;

export default function SectionTabs() {
  const { t, feat, hasSeries, hasBooks, kid } = useApp();
  const path = usePathname() || '/';
  if (kid) return null;
  const section = Object.keys(SECTION_PATHS).find((s) => SECTION_PATHS[s].includes(path));
  if (!section) return null;
  const tabs = section === 'catalogue' ? [
    ['/catalogue', t('stVideos'), true],
    ['/series', t('seriesNav'), hasSeries],
    ['/shorts', t('shrTitle'), feat('shorts')],
    ['/collections', t('colNav'), feat('collections')],
    ['/chaines', t('spTitle'), feat('channels')],
    ['/audyn', t('stAudio'), feat('audyn')],
    ['/books', t('bkNav'), hasBooks],
    // Étape N1 (15/11) : « En direct » réunit la TV 24 h/24 et les événements (page /live) ; sans la TV, il mène aux événements.
    [feat('livetv') ? '/live' : '/events', t('stLive'), feat('livetv') || feat('events'), ['/live', '/events']],
  ] : [
    ['/pratique', t('pqHub'), true],
    ['/priere', t('pqNav'), feat('prayer')],
    ['/coran', t('qrNav'), feat('quran')],
    ['/adhkar', t('atTab'), feat('athkar')],
    ['/ramadan', t('rzNav'), feat('ramadan')],
  ];
  const shown = tabs.filter(([, , on]) => on);
  if (shown.length < 2) return null;
  return (
    <nav className="sec-tabs" aria-label={t('stLabel')}>
      {shown.map(([href, label, , also]) => {
        const on = path === href || Boolean(also?.includes(path));
        return <Link key={href} href={href} className={on ? 'on' : undefined} aria-current={on ? 'page' : undefined}>{label}</Link>;
      })}
    </nav>
  );
}
