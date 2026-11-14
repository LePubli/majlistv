'use client';
// Studio (organisateurs, modérateurs, administrateurs) : menu à 8 entrées selon la maquette
//   Tableau de bord · Contenus · Données analytiques · Sous-titres · Audio et doublage · Éditeur · Activité · Paramètres
// + « Modération » pour les administrateurs ; un modérateur seul n'a que ses outils de modération.
// Étape D : l'Administration n'est plus dans ce menu (voir AdminShell.js). Les écrans qui ne sont plus dans le menu
// (séries, collections, ouvrages, quiz, mise en pratique, rappels, chaîne, revenus) restent accessibles par leurs onglets
// (components/StudioTabs.js) et par Paramètres → Outils, avec les mêmes adresses qu'avant.
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useApp } from './Providers';
import { featureForPath } from '../lib/features';
import { hasWebModule, MODULE_STUDIO_LINKS } from '../lib/modules';
import ManageShell, { ICONS } from './ManageShell';
import { fmtBytes } from '../lib/format';

// Entrées qui mènent aux écrans d'un module (identifiant du module = identifiant de sa fonction).
const MODULE_OF_HREF = {
  '/studio/series': 'series', '/studio/collections': 'collections', '/studio/channel': 'channels', '/studio/practice': 'practice', '/studio/quiz': 'quiz',
  '/studio/books': 'books', '/studio/reminders': 'revision', '/studio/stats': 'stats', '/studio/revenue': 'revenue',
  '/studio/dubbing': 'dubbing', // module « Doublage français » (étape S1)
  '/studio/editor': 'editor', // module « Éditeur de montage » (étape E1)
};
const UUID = /^\/studio\/[0-9a-f]{8}-[0-9a-f]{4}-/i;
// Quelle page du menu est « allumée » pour une adresse ?
export function studioSection(path) {
  if (path === '/studio') return 'dash';
  if (/^\/studio\/(contents|series|collections|books|new)(\/|$)/.test(path) || UUID.test(path)) return 'contents';
  if (/^\/studio\/(stats|revenue)(\/|$)/.test(path)) return 'analytics';
  if (/^\/studio\/(subtitles|corrections)(\/|$)/.test(path)) return 'subtitles';
  if (/^\/studio\/dubbing/.test(path)) return 'dubbing';
  if (/^\/studio\/editor/.test(path)) return 'editor';
  if (/^\/studio\/activity/.test(path)) return 'activity';
  if (/^\/studio\/(settings|quiz|practice|reminders|channel)(\/|$)/.test(path)) return 'settings';
  if (/^\/studio\/moderation/.test(path)) return 'moderation';
  return '';
}

// Groupe du menu pour les entrées ajoutées par les modules (audit 11/2026, lot A).
const STUDIO_GROUP_OF = { '/studio/references': 'settings' };
// Entrées de modules devenues un onglet d'une autre page : plus de ligne dans le menu (l'adresse reste).
// « Corrections de sous-titres » est le second onglet de « Sous-titres » (components/SubtitleTabs.js).
const STUDIO_TAB_OF = { '/studio/corrections': '/studio/subtitles' };

export default function StudioShell({ children }) {
  const { t, user, ready, feat, locale, modUsable } = useApp();
  const path = usePathname();
  const router = useRouter();

  useEffect(() => { if (ready && !user) router.replace('/login'); }, [ready, user, router]);
  // Un modérateur seul n'a pas de tableau de bord : on l'envoie sur la file de modération.
  useEffect(() => { if (ready && user?.role === 'moderator' && path === '/studio') router.replace('/studio/moderation'); }, [ready, user, path, router]);
  // Étape S3 : pastille du menu « Activité » (tâches en cours ou en attente) et encart « Stockage » (administrateur, module Stockage).
  const { call } = useApp();
  const [actCount, setActCount] = useState(0);
  const [space, setSpace] = useState(null);
  const role = user?.role;
  const storageOn = role === 'admin' && hasWebModule('storage') && feat('storage');
  useEffect(() => {
    if (!ready || !role || role === 'moderator' || !['organizer', 'admin'].includes(role)) return undefined;
    let alive = true;
    const tick = () => {
      call('/studio/activity/count').then((r) => { if (alive && r.ok) setActCount(r.data.count); });
      if (storageOn) call('/studio/storage/space').then((r) => { if (alive && r.ok) setSpace(r.data); });
    };
    tick();
    const h = setInterval(tick, 60000);
    return () => { alive = false; clearInterval(h); };
  }, [ready, role, storageOn, call, path]);
  if (!ready || !user) return null;
  if (!['organizer', 'moderator', 'admin'].includes(user.role)) return <main className="card"><p>{t('noAccess')}</p></main>;

  // Étape E1 : un projet de l'éditeur de montage s'ouvre en plein écran (sans le menu du Studio), comme sur la maquette.
  // L'écran « Remplacer la vidéo publiée » (étape E4b) garde le menu du Studio (maquette, écran 5).
  if (/^\/studio\/editor\/[0-9a-f-]{36}\/?$/i.test(path)) {
    return user.role === 'moderator' ? <main className="card"><p>{t('noAccess')}</p></main> : <div className="mt-full">{children}</div>;
  }

  if (/^\/studio\/editor\//.test(path) && user.role === 'moderator') return <main className="card"><p>{t('noAccess')}</p></main>;
  const isAdmin = user.role === 'admin';
  const isModOnly = user.role === 'moderator';
  const sec = studioSection(path);
  const analyticsHref = hasWebModule('stats') && feat('stats') ? '/studio/stats' : '/studio/revenue';

  // [adresse, libellé, icône, pastille, section]
  const full = [
    ['/studio', t('sdDash'), ICONS.dash, '', 'dash'],
    ['/studio/contents', t('sdContents'), ICONS.list, '', 'contents'],
    [analyticsHref, t('sdAnalytics'), ICONS.chart, '', 'analytics'],
    ['/studio/subtitles', t('sdSubs'), ICONS.sub, '', 'subtitles'],
    ['/studio/dubbing', t('sdDub'), ICONS.mic, '', 'dubbing'],
    ['/studio/editor', t('sdEditor'), ICONS.film, '', 'editor'],
    ['/studio/activity', t('sdActivity'), ICONS.pulse, actCount > 0 ? String(actCount) : '', 'activity'],
    ['/studio/settings', t('sdSettings'), ICONS.gear, '', 'settings'],
  ];
  // Audit 11/2026 (navigation, lot A) : les mêmes écrans, rangés par métier. Aucune adresse ne change.
  //   (sans titre) Tableau de bord · Publication · Production · Audience · Réglages
  const row = (href) => { const r = full.find((x) => x[0] === href); return [r[0], r[1], r[2], r[3]]; };
  const groups = [];
  if (!isModOnly) {
    groups.push({ key: 'dash', title: '', items: [row('/studio')] });
    groups.push({ key: 'publish', title: t('sdGrpPublish'), items: [row('/studio/contents')] });
    groups.push({ key: 'prod', title: t('sdGrpProd'), items: [row('/studio/subtitles'), row('/studio/dubbing'), row('/studio/editor'), row('/studio/activity')] });
    groups.push({ key: 'audience', title: t('sdGrpAudience'), items: [row(analyticsHref)] });
    groups.push({ key: 'settings', title: t('sdGrpSettings'), items: [row('/studio/settings')] });
  }
  if (isAdmin) groups.find((g) => g.key === 'audience').items.push(['/studio/moderation', t('modNav'), ICONS.check]);
  // TV en direct (La Mecque, Médine…) : administrateur, fonction « livetv », indépendante du module « Événements en direct ».
  if (isAdmin && feat('livetv')) groups.find((g) => g.key === 'publish').items.push(['/studio/live', t('lvAdminTitle'), ICONS.film]);
  if (isModOnly) {
    // Un modérateur retrouve ici ses outils d'avant : file de modération, collections, toutes les chaînes, mise en pratique.
    groups.push({ key: 'mod', title: t('modNav'), items: [['/studio/moderation', t('modQueue'), ICONS.check], ['/studio/collections', t('colNav'), ICONS.layers], ['/studio/channel', t('chNavAll'), ICONS.users], ['/studio/practice', t('pzNav'), ICONS.list]] });
  }
  // Entrées ajoutées par de nouveaux modules (fiche web/modules/<id>/module.js, champ « studio ») : dans le menu principal ou la modération.
  for (const l of MODULE_STUDIO_LINKS) {
    if (l.group === 'admin') continue; // les entrées d'administration passent par AdminShell
    if (l.group === 'settings') continue; // les entrées « Paramètres » (ex. Stockage et archivage) sont dans Studio → Paramètres
    if (STUDIO_TAB_OF[l.href]) continue; // onglet d'une autre page
    // Place d'une entrée de module : son groupe d'après son adresse ; une entrée inconnue va dans « Publication ».
    const key = l.group === 'mod' ? (isModOnly ? 'mod' : 'audience') : (isModOnly ? '' : (STUDIO_GROUP_OF[l.href] || 'publish'));
    const g = groups.find((x) => x.key === key);
    if (!g || (l.roles && !l.roles.includes(user.role))) continue;
    const item = [l.href, t(l.label), ICONS[l.icon] || ICONS.doc];
    g.items.push(item);
  }
  // Une entrée disparaît si sa fonction est coupée ou si la partie web de son module est absente.
  const visible = (href) => {
    const mod = MODULE_OF_HREF[href];
    if (mod) return hasWebModule(mod) && modUsable(mod);
    const id = featureForPath(href);
    return !id || feat(id);
  };
  const shown = groups.map((g) => ({ ...g, items: g.items.filter(([href]) => visible(href)) })).filter((g) => g.items.length);
  const isOn = (href) => {
    if (isModOnly) return path.startsWith(href);
    const row = full.find((r) => r[0] === href);
    return row ? row[4] === sec : (href === '/studio/moderation' ? sec === 'moderation' : path.startsWith(href));
  };
  const links = [
    ...(isAdmin ? [{ href: '/admin', label: t('sdToAdmin'), icon: ICONS.shield }] : []),
    { href: '/', label: t('viewSite'), icon: ICONS.eye },
  ];
  const extra = storageOn && space && space.usedBytes != null ? (
    <Link href="/studio/settings/storage" className={`sd-side-space${space.alert ? ' warn' : ''}`} aria-label={t('sdSpaceAria')}>
      <span className="sd-side-head"><b>{t('sdSpaceTitle')}</b><span>{space.usedPct.toLocaleString(locale)} %</span></span>
      <span className="sd-side-bar" aria-hidden="true"><i style={{ width: `${Math.min(100, space.usedPct)}%` }} /></span>
      <small>{t('sdSpaceUsed').replace('{u}', fmtBytes(space.usedBytes, locale)).replace('{c}', fmtBytes(space.capacityBytes, locale))}</small>
    </Link>
  ) : null;
  return <ManageShell space="studio" groups={shown} links={links} isOn={isOn} extra={extra}>{children}</ManageShell>;
}
