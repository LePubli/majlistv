// Contenu des pages en blocs : forme normalisée et validation (partagé par les routes de pages et par les thèmes uploadables).
import { ZONES, cleanContent, kidsErrors } from './blocks.js';
import { cleanNav } from './navcfg.js';

export const emptyContent = (kind) => ({ meta: {}, zones: Object.fromEntries(ZONES[kind].map((z) => [z, []])) });
// Contenu normalisé (toutes les zones présentes, même vides).
export const norm = (kind, c) => {
  const base = emptyContent(kind);
  if (!c || typeof c !== 'object') return base;
  return { meta: c.meta || {}, zones: { ...base.zones, ...(c.zones || {}) }, ...(kind === 'layout' && c.nav ? { nav: c.nav } : {}) };
};
// Blocs (cleanContent) + réglages de navigation (cleanNav) pour une page « layout » → { value, errors }.
export const validate = (kind, content, strict, path = '') => {
  const r = cleanContent(content, kind, strict);
  Object.assign(r.errors, kidsErrors(path, r.value)); // espace Kids : blocs simples seulement
  if (kind === 'layout' && content && typeof content === 'object') {
    const n = cleanNav(content.nav, strict);
    if (n.value) r.value.nav = n.value;
    Object.assign(r.errors, n.errors);
  }
  return r;
};
