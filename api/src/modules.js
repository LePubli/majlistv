// Étape M1 — Socle des modules.
//
// Un MODULE est un dossier api/src/modules/<id>/ livré par zip puis redéployé. Il contient :
//   module.json        la fiche (id, nom, version, description, dépendances, réglages)         — obligatoire
//   index.js           export default async function register(app, ctx) : déclare les routes     — obligatoire
//   migrations/*.sql   scripts SQL du module, appliqués une seule fois, dans l'ordre alphabétique — facultatif
// Au démarrage : les fiches sont lues, les réglages déclarés rejoignent Admin → Paramètres, les routes sont branchées, puis les
// migrations du module s'appliquent. Admin → Modules montre la version et permet d'activer, de désactiver et de régler.
//
// Activation : un module livré est INACTIF tant qu'on ne l'a pas activé (sauf "defaultEnabled": true). Un module peut être lié à une
// fonction existante ("feature": "gifts") : son interrupteur est alors celui de Admin → Fonctions et le module gère lui-même
// ce qu'il fait quand la fonction est coupée. Sans "feature", toutes ses routes répondent 404 tant qu'il est inactif.
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { z } from 'zod';
import { pool } from './db.js';
import { FIELDS, BY_KEY, GROUPS, getSetting, isOn, describeSettings, saveSettings } from './settings.js';
import { BY_ID, settingKey } from './featuresList.js';

const here = path.dirname(fileURLToPath(import.meta.url));
// Dossiers de modules : celui du code, plus (tests, essais) celui de MODULES_EXTRA_DIR.
const dirs = () => [path.join(here, 'modules'), ...(process.env.MODULES_EXTRA_DIR ? [process.env.MODULES_EXTRA_DIR] : [])];

const SEMVER = /^\d+\.\d+\.\d+$/;
const FIELD_TYPES = ['text', 'number', 'bool', 'select', 'price', 'url', 'secret'];
const fieldSchema = z.object({
  key: z.string().regex(/^[a-z][a-z0-9_]{1,40}$/),
  type: z.enum(FIELD_TYPES), label: z.string().min(1).max(120), help: z.string().max(400).optional(),
  def: z.string().max(200).optional(), min: z.number().optional(), max: z.number().optional(), options: z.array(z.string()).max(30).optional(),
}).strict();
const manifestSchema = z.object({
  id: z.string().regex(/^[a-z][a-z0-9-]{1,30}$/),
  name: z.string().min(1).max(80), version: z.string().regex(SEMVER), description: z.string().max(600).default(''),
  feature: z.string().optional(), requires: z.array(z.string()).max(20).default([]), defaultEnabled: z.boolean().default(false),
  settings: z.array(z.union([z.string(), fieldSchema])).max(40).default([]),
  admin: z.object({ label: z.string().min(1).max(80), href: z.string().regex(/^\/admin(\?tab=[a-z]+)?$/) }).strict().optional(),
}).strict();

// Registre en mémoire : id → { manifest, dir, fields:[clés de réglages], enabledKey, error, loaded }
const registry = new Map();
export const listRegistered = () => [...registry.values()];

const prefix = (id) => `mod_${id.replace(/-/g, '_')}_`;

// 1) Lecture des fiches et déclaration des réglages. À appeler AVANT l'enregistrement des routes.
export async function discoverModules(log = console) {
  registry.clear();
  for (const base of dirs()) {
    let names = [];
    try { names = (await fs.readdir(base, { withFileTypes: true })).filter((d) => d.isDirectory()).map((d) => d.name).sort(); } catch { continue; }
    for (const name of names) {
      const dir = path.join(base, name);
      let raw;
      try { raw = JSON.parse(await fs.readFile(path.join(dir, 'module.json'), 'utf8')); } catch { continue; } // pas une fiche de module : ignoré
      const parsed = manifestSchema.safeParse(raw);
      if (!parsed.success) { registry.set(`?${name}`, { manifest: { id: name, name, version: '0.0.0', description: '', requires: [], settings: [] }, dir, fields: [], error: `Fiche module.json invalide : ${parsed.error.issues[0].path.join('.')} ${parsed.error.issues[0].message}`.trim(), invalid: true }); log.warn?.(`module ${name} : fiche invalide`); continue; }
      const m = parsed.data;
      if (m.id !== name) { registry.set(`?${name}`, { manifest: m, dir, fields: [], error: `Le dossier « ${name} » doit porter l'identifiant du module (« ${m.id} »).`, invalid: true }); continue; }
      if (registry.has(m.id)) { registry.set(`?${m.id}@${base}`, { manifest: m, dir, fields: [], error: `Identifiant « ${m.id} » déjà utilisé par un autre module.`, invalid: true }); continue; }
      const entry = { manifest: m, dir, fields: [], enabledKey: null, error: null, loaded: false };
      if (m.feature && !BY_ID[m.feature]) entry.error = `Fonction inconnue : ${m.feature}`;
      // Réglages : une clé existante (string) ou un nouveau champ, rangé sous « mod_<id>_<clé> »
      for (const s of m.settings) {
        if (typeof s === 'string') { if (BY_KEY[s]) entry.fields.push(s); else entry.error ||= `Réglage inconnu : ${s}`; continue; }
        const key = prefix(m.id) + s.key;
        if (!BY_KEY[key]) {
          const f = { key, group: `mod_${m.id}`, type: s.type, label: s.label, help: s.help, def: s.def, min: s.min, max: s.max, options: s.type === 'select' ? s.options || [] : undefined };
          FIELDS.push(f); BY_KEY[key] = f;
        }
        entry.fields.push(key);
      }
      if (!GROUPS.some((g) => g.id === `mod_${m.id}`)) GROUPS.push({ id: `mod_${m.id}`, label: `Module : ${m.name}` });
      if (!m.feature) {
        entry.enabledKey = `${prefix(m.id)}enabled`;
        if (!BY_KEY[entry.enabledKey]) { const f = { key: entry.enabledKey, group: `mod_${m.id}`, type: 'bool', label: `Module « ${m.name} » activé`, def: m.defaultEnabled ? 'true' : 'false', hidden: true }; FIELDS.push(f); BY_KEY[f.key] = f; }
      }
      registry.set(m.id, entry);
    }
  }
}

export async function moduleOn(id) {
  const e = registry.get(id);
  if (!e || e.error) return false;
  return isOn(await getSetting(e.enabledKey || settingKey(BY_ID[e.manifest.feature])));
}

// 2) Branchement des routes de chaque module (chacun dans sa « bulle » Fastify). Un module en erreur est ignoré, les autres démarrent.
export async function registerModules(app) {
  for (const e of registry.values()) {
    if (e.invalid || e.error) continue;
    const id = e.manifest.id;
    try {
      const mod = await import(pathToFileURL(path.join(e.dir, 'index.js')).href);
      if (typeof mod.default !== 'function') throw new Error('index.js doit exporter par défaut une fonction register(app, ctx)');
      e.mod = mod;
      await app.register(async (scope) => {
        if (!e.manifest.feature) {
          scope.addHook('onRequest', async (req, reply) => {
            if (req.method === 'OPTIONS') return undefined;
            if (!(await moduleOn(id))) return reply.code(404).send({ error: 'Module indisponible', code: 'module_off', module: id });
            return undefined;
          });
        }
        e.ctx = { id, version: e.manifest.version, enabled: () => moduleOn(id), setting: (k) => getSetting(BY_KEY[k] ? k : prefix(id) + k), log: app.log };
        await mod.default(scope, e.ctx);
      });
      e.loaded = true;
    } catch (err) {
      e.error = `Chargement impossible : ${err.message}`; app.log.error(`module ${id} : ${err.message}`);
    }
  }
}

// 3) Migrations propres aux modules + version installée. À appeler APRÈS migrate() (les tables du socle existent).
export async function migrateModules(log = console) {
  for (const e of registry.values()) {
    if (e.invalid) continue;
    const id = e.manifest.id;
    try {
      let files = [];
      try { files = (await fs.readdir(path.join(e.dir, 'migrations'))).filter((f) => f.endsWith('.sql')).sort(); } catch { /* pas de migrations */ }
      for (const f of files) {
        if ((await pool.query('SELECT 1 FROM module_migrations WHERE module = $1 AND name = $2', [id, f])).rowCount) continue;
        const sql = await fs.readFile(path.join(e.dir, 'migrations', f), 'utf8');
        const c = await pool.connect();
        try {
          await c.query('BEGIN'); await c.query(sql);
          await c.query('INSERT INTO module_migrations(module, name) VALUES ($1, $2)', [id, f]);
          await c.query('COMMIT'); log.info?.(`Module ${id} : migration appliquée ${f}`);
        } catch (err) { await c.query('ROLLBACK'); throw new Error(`migration ${f} : ${err.message}`); } finally { c.release(); }
      }
      if (!e.error) await pool.query(
        `INSERT INTO modules(id, installed_version, last_error) VALUES ($1, $2, NULL)
         ON CONFLICT (id) DO UPDATE SET installed_version = EXCLUDED.installed_version, last_error = NULL, updated_at = now()`, [id, e.manifest.version]);
      else await pool.query(
        `INSERT INTO modules(id, installed_version, last_error) VALUES ($1, $2, $3)
         ON CONFLICT (id) DO UPDATE SET last_error = EXCLUDED.last_error, updated_at = now()`, [id, e.manifest.version, e.error]);
    } catch (err) {
      e.error = err.message; e.loaded = false;
      log.error?.(`Module ${id} : ${err.message}`);
      await pool.query(`INSERT INTO modules(id, installed_version, last_error) VALUES ($1, '0.0.0', $2) ON CONFLICT (id) DO UPDATE SET last_error = EXCLUDED.last_error, updated_at = now()`, [id, err.message]).catch(() => {});
    }
  }
}

// 4) Tâches de fond : `export async function start(app, ctx)` dans index.js, appelée une fois l'API à l'écoute (étape M2).
//    Elle est appelée même si le module est désactivé : c'est à la tâche de vérifier ctx.enabled() ou son réglage (comme le faisaient
//    déjà les e-mails programmés). Une erreur au démarrage d'un module est inscrite et n'empêche pas les autres.
export async function startModules(app) {
  for (const e of registry.values()) {
    if (!e.loaded || e.error || typeof e.mod?.start !== 'function') continue;
    try { await e.mod.start(app, e.ctx); } catch (err) {
      e.error = `Démarrage impossible : ${err.message}`; app.log.error(`module ${e.manifest.id} : ${err.message}`);
      await pool.query('UPDATE modules SET last_error = $2, updated_at = now() WHERE id = $1', [e.manifest.id, e.error]).catch(() => {});
    }
  }
}

// État de tous les modules : { gifts: true, … } (pour /config).
export async function allModules() {
  const out = {};
  for (const e of registry.values()) if (!e.invalid) out[e.manifest.id] = e.loaded && !e.error && (await moduleOn(e.manifest.id));
  return out;
}

async function describeAll() {
  const db = new Map((await pool.query('SELECT id, installed_version, first_seen_at, updated_at, last_error FROM modules')).rows.map((r) => [r.id, r]));
  const settings = await describeSettings();
  const enabledOf = {};
  for (const e of registry.values()) if (!e.invalid) enabledOf[e.manifest.id] = e.error ? false : await moduleOn(e.manifest.id);
  const out = [];
  for (const e of registry.values()) {
    const m = e.manifest; const row = db.get(m.id);
    const requires = m.requires.map((r) => ({ id: r, name: registry.get(r)?.manifest.name || r, present: registry.has(r), enabled: Boolean(enabledOf[r]) }));
    out.push({
      id: e.invalid ? null : m.id, folder: path.basename(e.dir), name: m.name, description: m.description, version: m.version,
      installedVersion: row?.installed_version || null, installedAt: row?.first_seen_at || null, updatedAt: row?.updated_at || null,
      status: e.invalid || e.error ? 'error' : enabledOf[m.id] ? 'on' : 'off', error: e.error || null,
      feature: m.feature || null, admin: m.admin || null, requires, dependents: [...registry.values()].filter((o) => !o.invalid && o.manifest.requires.includes(m.id)).map((o) => ({ id: o.manifest.id, name: o.manifest.name, enabled: Boolean(enabledOf[o.manifest.id]) })),
      fields: e.fields.map((k) => settings.fields.find((f) => f.key === k)).filter(Boolean),
    });
  }
  // Modules connus de la base mais dont le dossier a disparu : on garde la trace (les données ne sont jamais supprimées).
  for (const [id, row] of db) if (![...registry.values()].some((e) => e.manifest.id === id)) out.push({ id, folder: null, name: id, description: '', version: null, installedVersion: row.installed_version, installedAt: row.first_seen_at, updatedAt: row.updated_at, status: 'absent', admin: null, error: 'Le dossier du module n’est plus dans le code : ses routes sont fermées, ses données sont conservées.', feature: null, requires: [], dependents: [], fields: [] });
  return { modules: out, secrets: settings.encryption };
}

export default async function moduleRoutes(app) {
  const admin = { preHandler: app.requireRole('admin') };
  app.get('/admin/modules', admin, async () => describeAll());

  // Corps : { enabled?: boolean, settings?: { clé: valeur } }
  app.put('/admin/modules/:id', admin, async (req, reply) => {
    const { id } = z.object({ id: z.string().regex(/^[a-z][a-z0-9-]{1,30}$/) }).parse(req.params);
    const body = z.object({ enabled: z.boolean().optional(), settings: z.record(z.string(), z.string().nullable()).optional() }).strict().parse(req.body ?? {});
    const e = registry.get(id);
    if (!e || e.invalid) return reply.code(404).send({ error: 'Module introuvable' });
    const label = [];
    if (body.settings) {
      const bad = Object.keys(body.settings).find((k) => !e.fields.includes(k));
      if (bad) return reply.code(400).send({ error: `Réglage inconnu pour ce module : ${bad}` });
      try { await saveSettings(body.settings, req.user.sub); } catch (err) { return reply.code(400).send({ error: err.message }); }
      label.push(`réglages (${Object.keys(body.settings).join(', ')})`);
    }
    if (body.enabled !== undefined) {
      if (e.error) return reply.code(409).send({ error: 'Ce module est en erreur : corrigez-le avant de l’activer.' });
      const m = e.manifest;
      if (body.enabled) {
        const miss = m.requires.filter((r) => !registry.has(r) || e.error);
        if (miss.length) return reply.code(409).send({ error: `Modules requis absents : ${miss.join(', ')}` });
        for (const r of m.requires) if (!(await moduleOn(r))) return reply.code(409).send({ error: `Activez d’abord le module « ${registry.get(r).manifest.name} ».` });
      } else {
        for (const o of registry.values()) if (!o.invalid && o.manifest.requires.includes(m.id) && (await moduleOn(o.manifest.id))) return reply.code(409).send({ error: `Le module « ${o.manifest.name} » en dépend : désactivez-le d’abord.` });
      }
      await saveSettings({ [e.enabledKey || settingKey(BY_ID[m.feature])]: body.enabled ? 'true' : 'false' }, req.user.sub);
      label.push(body.enabled ? 'activé' : 'désactivé');
    }
    req.auditSummary = `Module « ${e.manifest.name} » : ${label.join(', ') || 'aucun changement'}`;
    return describeAll();
  });
}
