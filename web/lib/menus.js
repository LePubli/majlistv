// Étape I4 — Menus et en-tête configurables : fusion des réglages enregistrés (Admin → Pages → En-tête, menus et pied de page)
// avec les éléments d'origine du site. Sans réglage, le résultat est exactement le menu d'origine.
import { tx } from './blocks';

const MANAGERS = ['organizer', 'moderator', 'admin'];
export const isManager = (user) => Boolean(user && MANAGERS.includes(user.role));

// Public d'un lien ou d'un élément (affichage seulement : ce n'est pas une protection).
export function audienceOk(audience, user) {
  switch (audience) {
    case 'visitor': return !user;
    case 'member': return Boolean(user);
    case 'manager': return isManager(user);
    default: return true;
  }
}

// Classes qui masquent un élément sur certains appareils (mêmes règles CSS que les blocs : ≤ 700 px, 701–1024 px, ≥ 1025 px).
export function deviceClass(show) {
  const d = show?.devices || ['m', 't', 'd'];
  return ['m', 't', 'd'].filter((x) => !d.includes(x)).map((x) => `pb-hide-${x}`).join(' ');
}

// Liste finale d'un menu.
//   cfg      : liste enregistrée (ou undefined = menu d'origine)
//   defaults : éléments d'origine dans l'ordre d'origine : { key, href, label, on (condition), …autres champs }
//   required : clés qu'on n'a pas le droit de masquer (liens légaux)
// Un élément marqué `hid` est masqué tant qu'aucun réglage ne l'a affiché (ex. Collections dans le menu du haut depuis l'étape B).
// Un élément d'origine garde son adresse et sa condition ; on peut changer son texte, son ordre, sa visibilité.
export function resolveList(cfg, defaults, { user, lang, required = [] }) {
  const byKey = new Map(defaults.map((d) => [d.key, d]));
  if (!Array.isArray(cfg)) return defaults.filter((d) => d.on && !d.hid).map((d) => ({ ...d, cls: '' }));
  const out = [];
  const seen = new Set();
  for (const it of cfg) {
    if (it.key) {
      const d = byKey.get(it.key);
      if (!d) continue;
      seen.add(it.key);
      if (!d.on) continue;
      // Les éléments obligatoires (liens légaux) restent toujours visibles, sur tous les appareils et pour tout le monde.
      const fixed = required.includes(it.key);
      if (!fixed && it.hidden) continue;
      if (!fixed && !audienceOk(it.show?.audience, user)) continue;
      out.push({ ...d, label: tx(it.label, lang) || d.label, cls: fixed ? '' : deviceClass(it.show) });
    } else {
      if (it.hidden || !audienceOk(it.show?.audience, user)) continue;
      const label = tx(it.label, lang);
      if (!label || !it.url) continue;
      out.push({ key: it.id, href: it.url, label, icon: it.icon || 'link', custom: true, type: it.type, buttonKind: it.buttonKind, cls: deviceClass(it.show) });
    }
  }
  // Une fonction ajoutée plus tard (ou un élément absent des réglages) apparaît quand même, à la fin.
  for (const d of defaults) if (!seen.has(d.key) && d.on && !d.hid) out.push({ ...d, cls: '' });
  return out;
}

// Éléments d'origine d'un menu (navcfg MENUS) avec leur condition : applique le drapeau « masqué par défaut » (3e valeur).
export const withHid = (builtin, D) => builtin.map(([k, , hid]) => ({ ...D[k], ...(hid ? { hid: true } : {}) }));
