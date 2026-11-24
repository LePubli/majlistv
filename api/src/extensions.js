// Lot X1 — Extensions : état « en marche » (blocs enregistrés, CSS, textes, réglages, fonctions) rechargé à chaque installation / activation / réglage.
import crypto from 'node:crypto';
import { pool } from './db.js';
import { registerExtBlocks } from './blocks.js';

let runtime = { v: '0', css: '', client: { blocks: {}, texts: {}, settings: {}, features: {} } };

// Valeur d'un réglage : celle choisie par l'administrateur, sinon la valeur par défaut de l'extension.
export function settingValues(payload, stored) {
  const out = {};
  for (const s of payload?.settings || []) out[s.key] = stored?.[`s:${s.key}`] !== undefined ? stored[`s:${s.key}`] : s.default;
  return out;
}
export function featureValues(payload, stored) {
  const out = {};
  for (const f of payload?.features || []) out[f.key] = stored?.[`f:${f.key}`] !== undefined ? Boolean(stored[`f:${f.key}`]) : f.default === true;
  return out;
}

export async function reloadExtensions() {
  const rows = (await pool.query('SELECT slug, css, payload FROM ext_packs WHERE active ORDER BY slug')).rows;
  const vals = (await pool.query('SELECT ext, key, value FROM ext_values')).rows;
  const byExt = {};
  for (const v of vals) (byExt[v.ext] ||= {})[v.key] = v.value;
  const blocks = {}; const texts = {}; const settings = {}; const features = {}; let css = '';
  for (const r of rows) {
    Object.assign(blocks, r.payload?.blocks || {});
    texts[r.slug] = r.payload?.texts || {};
    settings[r.slug] = settingValues(r.payload, byExt[r.slug]);
    features[r.slug] = featureValues(r.payload, byExt[r.slug]);
    if (r.css) css += `/* extension ${r.slug} */\n${r.css}\n`;
  }
  registerExtBlocks(blocks);
  const client = { blocks, texts, settings, features };
  runtime = { v: crypto.createHash('sha1').update(JSON.stringify([css, client])).digest('hex').slice(0, 10), css, client };
  return runtime;
}
// Ce que reçoit le site (dans la réponse de /theme) : blocs, textes, réglages, fonctions, CSS.
export const extRuntime = () => ({ v: runtime.v, css: runtime.css, ...runtime.client });

// Pages et modèles qui utilisent un bloc de l'extension (pour refuser une désactivation ou une suppression qui casserait une page).
export async function extUsage(slug, types = null) {
  const marks = (types || [`x_${slug.replace(/-/g, '_')}_`]).map((t) => `"type": "${t}`);
  const out = [];
  for (const mark of marks) {
    const pages = (await pool.query(
      `SELECT path, title FROM site_pages WHERE position($1 in coalesce(draft::text, '')) > 0 OR position($1 in coalesce(published::text, '')) > 0 ORDER BY path LIMIT 30`, [mark])).rows;
    for (const p of pages) if (!out.some((o) => o.path === p.path)) out.push({ path: p.path, title: p.title });
    const tpl = (await pool.query('SELECT name FROM site_templates WHERE position($1 in content::text) > 0 LIMIT 20', [mark])).rows;
    for (const t of tpl) out.push({ path: '(modèle)', title: t.name });
  }
  return out;
}
