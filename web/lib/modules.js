// Étape M3b — Registre des modules côté site web.
//
// Chaque module peut avoir sa partie web dans web/modules/<id>/ :
//   module.js   fiche : id, fonctions (features) qu'il porte, chemins de ses pages, écrans d'administration, entrées du Studio
//   …           ses composants (écran d'administration, etc.)
// et ses pages dans un « groupe de routes » de Next.js : web/app/(module-<id>)/… et web/app/studio/(module-<id>)/…
// (le nom entre parenthèses n'apparaît pas dans l'adresse). Supprimer le dossier web/modules/<id> et ses groupes de routes
// retire le module du site : ses menus, pages et écrans disparaissent, le reste du site se construit et fonctionne.
//
// Les fiches sont trouvées automatiquement à la construction (require.context de webpack) : aucune liste à tenir à jour.
const ctx = require.context('../modules', true, /^\.\/[a-z0-9-]+\/module\.js$/);

export const WEB_MODULES = ctx.keys().map((k) => ctx(k).default).filter(Boolean).sort((a, b) => a.id.localeCompare(b.id));
const BY_ID = Object.fromEntries(WEB_MODULES.map((m) => [m.id, m]));
// fonction (feature) → module qui la porte
const FEATURE_MODULE = Object.fromEntries(WEB_MODULES.flatMap((m) => (m.features || [m.id]).map((f) => [f, m.id])));
// Fonctions qui appartiennent à un module (même si sa partie web est absente) : liste figée, comme api/src/featuresList.js.
export const MODULE_FEATURES = ['series', 'collections', 'books', 'quiz', 'practice', 'revision', 'selfcheck', 'learning', 'notes', 'favorites', 'lists',
  'channels', 'follow', 'weekly', 'announce', 'citations', 'kids', 'showcase', 'stats', 'gifts', 'revenue'];

export const webModule = (id) => BY_ID[id] || null;
export const hasWebModule = (id) => Boolean(BY_ID[id]);

// Une fonction portée par un module n'est disponible sur le site que si la partie web du module est présente.
export function webFeatures(features = {}) {
  const out = { ...features };
  for (const f of MODULE_FEATURES) if (!FEATURE_MODULE[f]) out[f] = false;
  return out;
}

// Fonction dont dépend une adresse du site (ou null) : sert à la garde des pages et aux menus.
export function featureForModulePath(path) {
  for (const m of WEB_MODULES) for (const re of m.paths || []) if (re.test(path)) return (m.features || [m.id])[0];
  return null;
}

// Écrans d'administration fournis par les modules : [{ tab, title, label, icon, feature, load }]
export const MODULE_ADMIN_TABS = WEB_MODULES.flatMap((m) => (m.admin || []).map((a) => ({ feature: (m.features || [m.id])[0], module: m.id, ...a })));
// Entrées supplémentaires du Studio fournies par les modules (nouveaux modules) : [{ group: 'studio'|'mod'|'admin', href, label, icon, roles }]
export const MODULE_STUDIO_LINKS = WEB_MODULES.flatMap((m) => (m.studio || []).map((s) => ({ feature: (m.features || [m.id])[0], module: m.id, ...s })));
