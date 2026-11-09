// Projet Menus (étape 2) — menus de l'application créés dans Admin → Menus : règles pures (testées avec Node, sans téléphone).
// Deux emplacements : « Application — menu ☰ » (app_drawer) et « Application — onglets du bas » (app_tabs).
// Sans menu affecté (ou fonction « Menus personnalisés » coupée, ou hors connexion), l'application garde ses menus d'origine.

export type MenuLabel = { fr?: string; en?: string; ar?: string };
export type MenuItem = {
  id: string; kind: string; key?: string; href?: string; screen?: string; ref?: string;
  label?: MenuLabel; icon?: string; audience?: string; devices?: string[]; newTab?: boolean; children?: MenuItem[];
};
export type AppMenus = Partial<Record<'app_drawer' | 'app_tabs', MenuItem[]>>;

type Feather = string; // nom d'icône Feather (vérifié par le compilateur à l'endroit où l'icône est affichée)

/** Écrans de l'application qu'un menu peut ouvrir (mêmes identifiants que l'écran Admin → Menus). */
export const SCREENS: Record<string, { pathname: string; icon: Feather; feat?: string; member?: boolean; series?: boolean }> = {
  home: { pathname: '/', icon: 'home' },
  talks: { pathname: '/talks', icon: 'film' },
  learn: { pathname: '/learn', icon: 'book-open', feat: 'learning' },
  library: { pathname: '/library', icon: 'bookmark', member: true },
  account: { pathname: '/account', icon: 'user' },
  search: { pathname: '/search', icon: 'search' },
  shorts: { pathname: '/shorts', icon: 'zap', feat: 'shorts' },
  quran: { pathname: '/quran', icon: 'book', feat: 'quran' },
  athkar: { pathname: '/athkar', icon: 'sun', feat: 'athkar', member: true },
  prayer: { pathname: '/prayer', icon: 'clock', feat: 'prayer' },
  ramadan: { pathname: '/ramadan', icon: 'moon', feat: 'ramadan' },
  kids: { pathname: '/kids', icon: 'smile', feat: 'kids' },
  downloads: { pathname: '/downloads', icon: 'download', feat: 'offline' },
  events: { pathname: '/events', icon: 'bell', feat: 'events' },
  series: { pathname: '/series', icon: 'layers', series: true },
  collections: { pathname: '/collections', icon: 'folder', feat: 'collections' },
  audyn: { pathname: '/audyn', icon: 'headphones', feat: 'audyn' },
};

/** Icônes du menu (mêmes noms que sur le site) → icônes de l'application. */
export const ICONS: Record<string, Feather> = {
  home: 'home', series: 'layers', col: 'folder', books: 'book', people: 'users', learn: 'book-open', lib: 'bookmark',
  bilan: 'check-circle', kids: 'smile', user: 'user', star: 'star', info: 'info', mail: 'mail', link: 'link',
};

export type Target =
  | { type: 'route'; pathname: string; params?: Record<string, string> }
  | { type: 'site'; url: string }
  | { type: 'link'; url: string };

export type AppItem = { key: string; label: string; icon: Feather; target: Target | null; children: AppItem[] };

export type Ctx = {
  locale: string;
  loggedIn: boolean;
  role?: string | null;
  hasSeries: boolean;
  feat: (id: string) => boolean;
  siteUrl: string;
};

const MANAGERS = ['organizer', 'moderator', 'admin'];

/** L'élément est-il pour ce public ? (affichage seulement : ce n'est pas une protection d'accès) */
export function audienceOk(audience: string | undefined, c: Pick<Ctx, 'loggedIn' | 'role'>): boolean {
  switch (audience) {
    case 'visitor': return !c.loggedIn;
    case 'member': return c.loggedIn;
    case 'manager': return c.loggedIn && !!c.role && MANAGERS.includes(c.role);
    default: return true;
  }
}

/** L'élément est-il visible sur un téléphone ? (appareils « m » ; vide = tous) */
export const onPhone = (devices?: string[]) => !devices || devices.length === 0 || devices.includes('m');

export function labelOf(l: MenuLabel | undefined, locale: string): string {
  if (!l) return '';
  return (l as Record<string, string | undefined>)[locale] || l.fr || l.en || l.ar || '';
}

/** Où mène un élément ? null = nulle part (écran absent, fonction coupée, type inconnu). */
export function targetOf(it: MenuItem, c: Ctx): Target | null {
  switch (it.kind) {
    case 'appscreen': {
      const s = it.screen ? SCREENS[it.screen] : undefined;
      if (!s) return null;
      if (s.feat && !c.feat(s.feat)) return null;
      if (s.member && !c.loggedIn) return null;
      if (s.series && !c.hasSeries) return null;
      return { type: 'route', pathname: s.pathname };
    }
    case 'talk': return it.ref ? { type: 'route', pathname: '/talk/[id]', params: { id: it.ref } } : null;
    case 'series': return it.ref ? { type: 'route', pathname: '/series/[id]', params: { id: it.ref } } : null;
    case 'collection': return it.ref ? { type: 'route', pathname: '/collections/[id]', params: { id: it.ref } } : null;
    case 'channel': return it.ref ? { type: 'route', pathname: '/speaker/[slug]', params: { slug: it.ref } } : null;
    case 'page': return it.ref ? { type: 'site', url: `${c.siteUrl}${it.ref}` } : null;
    case 'url': {
      const h = it.href || '';
      if (h.startsWith('/')) return { type: 'site', url: `${c.siteUrl}${h}` };
      if (/^https:\/\//.test(h)) return { type: 'site', url: h };
      if (/^(mailto|tel):/.test(h)) return { type: 'link', url: h };
      return null;
    }
    default: return null; // « builtin » (liens d'origine du site) et « heading » n'ont pas d'écran
  }
}

function one(it: MenuItem, c: Ctx): AppItem | null {
  if (!audienceOk(it.audience, c) || !onPhone(it.devices)) return null;
  const label = labelOf(it.label, c.locale);
  const kids = (it.children || []).map((k) => one(k, c)).filter((x): x is AppItem => !!x);
  if (it.kind === 'heading') return label && kids.length ? { key: it.id, label, icon: ICONS[it.icon || ''] || 'chevron-right', target: null, children: kids } : null;
  const target = targetOf(it, c);
  if (!target || !label) return null;
  const icon = ICONS[it.icon || ''] || (it.kind === 'appscreen' && it.screen ? SCREENS[it.screen]?.icon : undefined) || 'link';
  return { key: it.id, label, icon, target, children: kids };
}

/** Liste finale d'un menu de l'application : filtre public, téléphone, fonctions coupées ; null si aucun menu affecté. */
export function resolveAppMenu(items: MenuItem[] | undefined | null, c: Ctx): AppItem[] | null {
  if (!Array.isArray(items)) return null;
  return items.map((it) => one(it, c)).filter((x): x is AppItem => !!x);
}

/** Onglets du bas : 5 au plus, sans sous-menu (les éléments avec sous-menu sont ignorés par la validation du serveur). */
export function resolveTabs(items: MenuItem[] | undefined | null, c: Ctx): AppItem[] | null {
  const r = resolveAppMenu(items, c);
  return r ? r.filter((i) => i.target).slice(0, 5) : null;
}

/** L'onglet est-il celui de la page affichée ? */
export function tabActive(t: Target | null, path: string): boolean {
  if (!t || t.type !== 'route') return false;
  if (t.pathname === '/') return path === '/' || path === '' || path === '/index';
  const p = t.params?.id ? t.pathname.replace('[id]', t.params.id) : t.params?.slug ? t.pathname.replace('[slug]', t.params.slug) : t.pathname;
  return path === p || path.startsWith(p + '/');
}

/** Adresse de l'API pour les menus de l'application. */
export const MENUS_PATH = '/menus/resolved';

/** Réponse de l'API → menus de l'application (ignore tout ce qui n'est pas valide). */
export function parseMenus(data: unknown): AppMenus | null {
  const loc = (data as { locations?: Record<string, unknown> } | null)?.locations;
  if (!loc || typeof loc !== 'object') return null;
  const out: AppMenus = {};
  for (const k of ['app_drawer', 'app_tabs'] as const) if (Array.isArray(loc[k])) out[k] = loc[k] as MenuItem[];
  return Object.keys(out).length ? out : null;
}
