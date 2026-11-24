// Éditeur visuel (étape 2) — opérations pures sur le contenu d'une page : { meta, zones: { zone: [bloc, …] }, nav? }.
// Aucune dépendance au navigateur : testé par web/tests/test_site_editor.mjs.

export const clone = (x) => JSON.parse(JSON.stringify(x));

// Où se trouve un bloc : { zone, index, block } ou null.
export function findBlock(content, id) {
  for (const [zone, list] of Object.entries(content?.zones || {})) {
    const index = list.findIndex((b) => b.id === id);
    if (index >= 0) return { zone, index, block: list[index] };
  }
  return null;
}

const withZone = (content, zone, list) => ({ ...content, zones: { ...content.zones, [zone]: list } });

// Insère un bloc à la position `index` d'une zone. Renvoie null si la zone est pleine (max blocs).
export function insertBlock(content, zone, index, block, max = Infinity) {
  const list = content.zones[zone] || [];
  if (list.length >= max) return null;
  const at = Math.max(0, Math.min(list.length, index));
  return withZone(content, zone, [...list.slice(0, at), block, ...list.slice(at)]);
}

export function removeBlock(content, id) {
  const f = findBlock(content, id);
  if (!f) return content;
  return withZone(content, f.zone, content.zones[f.zone].filter((b) => b.id !== id));
}

// Déplace un bloc. `toIndex` = position d'insertion dans la zone d'arrivée AVANT le retrait (c'est ce que donne un
// glisser-déposer : « avant le bloc n° i »). Même zone : l'index est corrigé du retrait. Renvoie null si la zone d'arrivée est pleine.
export function moveBlock(content, id, toZone, toIndex, max = Infinity) {
  const f = findBlock(content, id);
  if (!f) return content;
  if (f.zone !== toZone && (content.zones[toZone] || []).length >= max) return null;
  let at = toIndex;
  if (f.zone === toZone && f.index < toIndex) at -= 1;
  const without = removeBlock(content, id);
  const list = without.zones[toZone] || [];
  at = Math.max(0, Math.min(list.length, at));
  if (f.zone === toZone && at === f.index) return content; // rien ne bouge
  return withZone(without, toZone, [...list.slice(0, at), f.block, ...list.slice(at)]);
}

// Monte (-1) ou descend (+1) un bloc d'un cran dans sa zone.
export function nudgeBlock(content, id, d) {
  const f = findBlock(content, id);
  if (!f) return content;
  const j = f.index + d;
  const list = content.zones[f.zone];
  if (j < 0 || j >= list.length) return content;
  const next = [...list];
  [next[f.index], next[j]] = [next[j], next[f.index]];
  return withZone(content, f.zone, next);
}

// Copie d'un bloc juste après l'original, avec un nouvel identifiant. Renvoie { content, id } ou null (zone pleine).
export function duplicateBlock(content, id, newId, max = Infinity) {
  const f = findBlock(content, id);
  if (!f || content.zones[f.zone].length >= max) return null;
  const copy = clone(f.block);
  copy.id = newId;
  return { content: insertBlock(content, f.zone, f.index + 1, copy, max), id: newId };
}

// Position d'insertion sous le pointeur. rects : [{ id, zone, y, h }] (blocs, en pixels du document de l'aperçu),
// zones : [{ zone, y, h }] (conteneurs de zones, y compris vides). Renvoie { zone, index, lineY } ou null.
export function dropTarget(rects, zones, y) {
  if (!zones.length) return null;
  // La zone sous le pointeur, sinon la plus proche.
  let z = zones.find((c) => y >= c.y && y <= c.y + c.h);
  if (!z) z = [...zones].sort((a, b) => Math.min(Math.abs(y - a.y), Math.abs(y - (a.y + a.h))) - Math.min(Math.abs(y - b.y), Math.abs(y - (b.y + b.h))))[0];
  const own = rects.filter((r) => r.zone === z.zone).sort((a, b) => a.y - b.y);
  if (!own.length) return { zone: z.zone, index: 0, lineY: z.y + Math.min(24, z.h / 2) };
  for (let i = 0; i < own.length; i++) {
    if (y < own[i].y + own[i].h / 2) return { zone: z.zone, index: i, lineY: own[i].y };
  }
  const last = own[own.length - 1];
  return { zone: z.zone, index: own.length, lineY: last.y + last.h };
}

// ------------------------------------------------------------------ Annuler / rétablir
// Pile d'états. Des modifications du même champ à moins de `gap` ms les unes des autres comptent pour une seule (frappe au clavier).
export const newHistory = (limit = 100) => ({ past: [], future: [], limit, key: null, at: 0 });

export function pushHistory(h, current, key = null, now = Date.now(), gap = 900) {
  const merge = key && h.key === key && now - h.at < gap && h.past.length > 0;
  return {
    ...h,
    past: merge ? h.past : [...h.past, current].slice(-h.limit),
    future: [],
    key,
    at: now,
  };
}
export function undoHistory(h, current) {
  if (!h.past.length) return null;
  return { state: h.past[h.past.length - 1], history: { ...h, past: h.past.slice(0, -1), future: [current, ...h.future], key: null } };
}
export function redoHistory(h, current) {
  if (!h.future.length) return null;
  return { state: h.future[0], history: { ...h, past: [...h.past, current], future: h.future.slice(1), key: null } };
}
