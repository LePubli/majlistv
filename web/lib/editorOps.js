// Éditeur visuel (étape 2) — opérations pures sur le contenu d'une page : { meta, zones: { zone: [bloc, …] }, nav? }.
// Aucune dépendance au navigateur : testé par web/tests/test_site_editor.mjs.

export const clone = (x) => JSON.parse(JSON.stringify(x));

// Zones : « main », « before »… (blocs de la page) ou « <idBloc>:<n> » = colonne n d'un bloc Colonnes (un seul niveau).
export const isColZone = (zone) => typeof zone === 'string' && zone.includes(':');
const colParts = (zone) => { const [id, n] = zone.split(':'); return [id, Number(n)]; };
const isContainer = (b) => b && b.type === 'columns';

export function getList(content, zone) {
  if (!isColZone(zone)) return content?.zones?.[zone] || [];
  const [id, n] = colParts(zone);
  for (const list of Object.values(content?.zones || {})) { const c = list.find((b) => b.id === id); if (c) return (c.cols || [])[n] || []; }
  return [];
}
export function setList(content, zone, list) {
  if (!isColZone(zone)) return { ...content, zones: { ...content.zones, [zone]: list } };
  const [id, n] = colParts(zone);
  const zones = {};
  for (const [z, l] of Object.entries(content.zones || {})) {
    zones[z] = l.map((b) => {
      if (b.id !== id) return b;
      const cols = [...(b.cols || [])];
      while (cols.length <= n) cols.push([]);
      cols[n] = list;
      return { ...b, cols };
    });
  }
  return { ...content, zones };
}

// Où se trouve un bloc : { zone, index, block } ou null.
export function findBlock(content, id) {
  for (const [zone, list] of Object.entries(content?.zones || {})) {
    const index = list.findIndex((b) => b.id === id);
    if (index >= 0) return { zone, index, block: list[index] };
    for (const c of list) {
      for (let n = 0; n < (c.cols || []).length; n++) {
        const k = c.cols[n].findIndex((b) => b.id === id);
        if (k >= 0) return { zone: `${c.id}:${n}`, index: k, block: c.cols[n][k] };
      }
    }
  }
  return null;
}

const withZone = setList;

// Insère un bloc à la position `index` d'une zone. Renvoie null si la zone est pleine ou si on met des colonnes dans des colonnes.
export function insertBlock(content, zone, index, block, max = Infinity) {
  if (isColZone(zone) && isContainer(block)) return null;
  const list = getList(content, zone);
  if (list.length >= (isColZone(zone) ? Math.min(max, 20) : max)) return null;
  const at = Math.max(0, Math.min(list.length, index));
  return withZone(content, zone, [...list.slice(0, at), block, ...list.slice(at)]);
}

export function removeBlock(content, id) {
  const f = findBlock(content, id);
  if (!f) return content;
  return withZone(content, f.zone, getList(content, f.zone).filter((b) => b.id !== id));
}

// Déplace un bloc. `toIndex` = position d'insertion dans la zone d'arrivée AVANT le retrait (c'est ce que donne un
// glisser-déposer : « avant le bloc n° i »). Même zone : l'index est corrigé du retrait. Renvoie null si la zone d'arrivée est pleine
// ou si l'on dépose des colonnes dans une colonne (ou un bloc dans sa propre colonne).
export function moveBlock(content, id, toZone, toIndex, max = Infinity) {
  const f = findBlock(content, id);
  if (!f) return content;
  if (isColZone(toZone) && (isContainer(f.block) || colParts(toZone)[0] === id)) return null;
  if (f.zone !== toZone && getList(content, toZone).length >= (isColZone(toZone) ? Math.min(max, 20) : max)) return null;
  let at = toIndex;
  if (f.zone === toZone && f.index < toIndex) at -= 1;
  const without = removeBlock(content, id);
  const list = getList(without, toZone);
  at = Math.max(0, Math.min(list.length, at));
  if (f.zone === toZone && at === f.index) return content; // rien ne bouge
  return withZone(without, toZone, [...list.slice(0, at), f.block, ...list.slice(at)]);
}

// Monte (-1) ou descend (+1) un bloc d'un cran dans sa zone.
export function nudgeBlock(content, id, d) {
  const f = findBlock(content, id);
  if (!f) return content;
  const j = f.index + d;
  const list = getList(content, f.zone);
  if (j < 0 || j >= list.length) return content;
  const next = [...list];
  [next[f.index], next[j]] = [next[j], next[f.index]];
  return withZone(content, f.zone, next);
}

// Copie d'un bloc juste après l'original, avec un nouvel identifiant (les blocs des colonnes aussi). Renvoie { content, id } ou null (zone pleine).
export function duplicateBlock(content, id, newId, max = Infinity, makeId = () => 'b' + Math.random().toString(36).slice(2, 10)) {
  const f = findBlock(content, id);
  if (!f || getList(content, f.zone).length >= max) return null;
  const copy = clone(f.block);
  copy.id = newId;
  if (copy.cols) copy.cols = copy.cols.map((col) => col.map((b) => ({ ...b, id: makeId() })));
  return { content: insertBlock(content, f.zone, f.index + 1, copy, max), id: newId };
}

// Position d'insertion sous le pointeur. rects : [{ id, zone, y, h }] (blocs, en pixels du document de l'aperçu),
// zones : [{ zone, x?, w?, y, h }] (conteneurs de zones, colonnes comprises, y compris vides). x : abscisse du pointeur (pour les colonnes).
// `allowNested` faux : les colonnes ne sont pas proposées (on déplace un bloc Colonnes). Renvoie { zone, index, lineY, x?, w? } ou null.
export function dropTarget(rects, zones, y, x = null, allowNested = true) {
  const usable = zones.filter((z) => allowNested || !isColZone(z.zone));
  if (!usable.length) return null;
  const inside = (c) => y >= c.y && y <= c.y + c.h && (x == null || c.w == null || (x >= c.x && x <= c.x + c.w));
  // Zone la plus petite qui contient le pointeur (une colonne l'emporte sur la zone de la page qui la contient) ; sinon la zone de page la plus proche.
  const hits = usable.filter(inside).sort((a, b) => a.h * (a.w || 1) - b.h * (b.w || 1));
  let z = hits.find((c) => isColZone(c.zone)) || hits[0];
  if (!z) {
    const top = usable.filter((c) => !isColZone(c.zone));
    z = [...(top.length ? top : usable)].sort((a, b) => Math.min(Math.abs(y - a.y), Math.abs(y - (a.y + a.h))) - Math.min(Math.abs(y - b.y), Math.abs(y - (b.y + b.h))))[0];
  }
  const own = rects.filter((r) => r.zone === z.zone).sort((a, b) => a.y - b.y);
  const geo = z.w != null ? { x: z.x, w: z.w } : {};
  if (!own.length) return { zone: z.zone, index: 0, lineY: z.y + Math.min(24, z.h / 2), ...geo };
  for (let i = 0; i < own.length; i++) {
    if (y < own[i].y + own[i].h / 2) return { zone: z.zone, index: i, lineY: own[i].y, ...geo };
  }
  const last = own[own.length - 1];
  return { zone: z.zone, index: own.length, lineY: last.y + last.h, ...geo };
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
