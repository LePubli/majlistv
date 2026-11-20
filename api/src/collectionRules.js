// Catalogue, phase 6 (20/11/2026) — moteur des collections dynamiques (cahier des charges § 11).
//   manual    liste choisie à la main (table collection_items), comme avant
//   auto      règles : catégorie (slug), intervenant, niveau, langue, format, durée, à la une, avec quiz, tri, nombre
//   seasonal  visible seulement pendant la saison choisie (Ramadan, Hajj…) ; contenu = règles si elles existent, sinon liste manuelle
//   personal  propre à chaque membre : continue (commencées), path (prochains épisodes de ses séries), foryou, later
// Une collection « personnelle » n'existe que pour un membre connecté (vide pour un visiteur, jamais mise en cache publique).
// Séparation des catalogues : adult = vidéos pour adultes ; kids = vidéos ayant une tranche d'âge Kids (le filtre d'âge et le contrôle
// parental sont ensuite appliqués côté serveur par l'espace enfant).
import { z } from 'zod';
import { pool } from './db.js';
import { visibleSql } from './visibility.js';
import { adultSql, inCategorySql } from './taxonomy.js';
import { CARD, cards } from './talkCards.js';
import * as ext from './ext.js';

export const MODES = ['manual', 'auto', 'seasonal', 'personal'];
export const SORTS = ['recent', 'alpha', 'shortest', 'longest'];
export const PERSONAL_TYPES = ['continue', 'path', 'foryou', 'later'];
export const DEFAULT_LIMIT = 12;
const SORT_SQL = {
  recent: 'COALESCE(t.publish_at, t.created_at) DESC, t.id',
  alpha: 'lower(t.title) ASC, t.id',
  shortest: 'COALESCE(t.duration_seconds, 2147483647) ASC, t.id',
  longest: 'COALESCE(t.duration_seconds, 0) DESC, t.id',
};
const slug = z.string().regex(/^[a-z0-9-]{2,80}$/);

/** Règles d'une collection automatique / saisonnière (toutes facultatives). */
export const ruleSchema = z.object({
  category: slug.optional(),                 // slug de catégorie ou de sous-catégorie (les sous-catégories d'un thème comptent)
  speaker: z.string().trim().min(1).max(120).optional(),
  level: z.enum(['beginner', 'intermediate', 'advanced']).optional(),
  language: z.string().regex(/^[a-z]{2,3}$/).optional(),
  format: slug.optional(),
  minSeconds: z.number().int().min(0).max(86400).optional(),
  maxSeconds: z.number().int().min(1).max(86400).optional(),
  featured: z.boolean().optional(),
  withQuiz: z.boolean().optional(),
  sort: z.enum(SORTS).optional(),
  limit: z.number().int().min(1).max(50).optional(),
  type: z.enum(PERSONAL_TYPES).optional(),   // collections personnelles seulement
}).strict();

/** Règle nettoyée (clés vides retirées) ; lève une erreur zod si elle est invalide. */
export const cleanRule = (r) => ruleSchema.parse(r ?? {});
export const isEmptyRule = (r) => Object.keys(r || {}).filter((k) => k !== 'sort' && k !== 'limit').length === 0;

const limitOf = (rule, size) => Math.max(1, Math.min(50, Number(size ?? rule.limit ?? DEFAULT_LIMIT)));

/** Identifiants des vidéos d'une règle automatique, dans l'ordre demandé. */
export async function autoIds(rule, catalogue, size) {
  const vals = [];
  const bind = (v) => { vals.push(v); return `$${vals.length}`; };
  const w = [`t.video_status = 'ready'`, visibleSql('t'), catalogue === 'kids' ? `COALESCE(array_length(t.kids_bands, 1), 0) > 0` : adultSql('t')];
  if (rule.category) {
    const c = (await pool.query('SELECT id FROM categories WHERE slug = $1 AND catalogue_type = $2 AND is_active', [rule.category, catalogue])).rows[0];
    if (!c) return []; // catégorie inconnue, désactivée ou de l'autre catalogue : aucune vidéo (jamais « tout »)
    w.push(`COALESCE(${inCategorySql('t', bind(c.id))}, false)`);
  }
  if (rule.speaker) w.push(`lower(trim(t.speaker)) = lower(trim(${bind(rule.speaker)}))`);
  if (rule.level) w.push(`t.level = ${bind(rule.level)}`);
  if (rule.language) w.push(`t.language = ${bind(rule.language)}`);
  if (rule.format) w.push(`t.format_id = (SELECT id FROM formats WHERE slug = ${bind(rule.format)})`);
  if (rule.minSeconds != null) w.push(`t.duration_seconds >= ${bind(rule.minSeconds)}`);
  if (rule.maxSeconds != null) w.push(`t.duration_seconds > 0 AND t.duration_seconds <= ${bind(rule.maxSeconds)}`);
  if (rule.featured) w.push('t.featured');
  if (rule.withQuiz) w.push(`EXISTS (SELECT 1 FROM quiz_questions qq WHERE qq.talk_id = t.id AND qq.status = 'approved')`);
  const n = limitOf(rule, size);
  const { rows } = await pool.query(
    `SELECT t.id FROM talks t WHERE ${w.join(' AND ')} ORDER BY ${SORT_SQL[rule.sort] || SORT_SQL.recent} LIMIT ${n}`, vals);
  return rows.map((r) => r.id);
}

/** Vidéos d'une collection personnelle pour un membre. `profileId` : profil enfant (espace Kids). */
export async function personalIds(rule, catalogue, viewer, size) {
  if (!viewer?.sub) return [];
  const n = limitOf(rule, size);
  const vis = `t.video_status = 'ready' AND ${visibleSql('t')} AND ${catalogue === 'kids' ? `COALESCE(array_length(t.kids_bands, 1), 0) > 0` : adultSql('t')}`;
  if (catalogue === 'kids') {
    if (!viewer.profileId) return [];
    if (rule.type !== 'continue') return [];
    const { rows } = await pool.query(
      `SELECT t.id FROM kid_progress k JOIN talks t ON t.id = k.talk_id
        WHERE k.profile_id = $1 AND NOT k.completed AND k.position_ms >= 5000 AND ${vis} ORDER BY k.updated_at DESC LIMIT ${n}`, [viewer.profileId]);
    return rows.map((r) => r.id);
  }
  if (rule.type === 'continue') {
    const { rows } = await pool.query(
      `SELECT t.id FROM watch_progress p JOIN talks t ON t.id = p.talk_id
        WHERE p.user_id = $1 AND NOT p.completed AND p.position_ms >= 5000 AND ${vis} ORDER BY p.updated_at DESC LIMIT ${n}`, [viewer.sub]);
    return rows.map((r) => r.id);
  }
  if (rule.type === 'later') {
    const { rows } = await pool.query(
      `SELECT t.id FROM watch_later l JOIN talks t ON t.id = l.talk_id WHERE l.user_id = $1 AND ${vis} ORDER BY l.added_at DESC LIMIT ${n}`, [viewer.sub]).catch(() => ({ rows: [] }));
    return rows.map((r) => r.id);
  }
  if (rule.type === 'path') {
    const next = await ext.call('series.nextUp', [], viewer.sub);
    const ids = next.map((x) => x.talkId);
    if (!ids.length) return [];
    const ok = new Set((await pool.query(`SELECT t.id FROM talks t WHERE t.id = ANY($1::uuid[]) AND ${vis}`, [ids])).rows.map((r) => r.id));
    return ids.filter((i) => ok.has(i)).slice(0, n);
  }
  if (rule.type === 'foryou') {
    const { forYouTalks } = await import('./routes/home.js');
    return (await forYouTalks(viewer.sub, `${visibleSql('t')} AND ${adultSql('t')}`, n)).map((r) => r.id);
  }
  return [];
}

/** La saison de la collection est-elle ouverte ? (module Saisons ; sans lui, une collection saisonnière reste cachée.) */
export async function seasonOpen(season) {
  if (!season) return false;
  return (await ext.call('seasons.current', null)) === season;
}

/**
 * Vidéos d'une collection (fiches complètes, dans l'ordre), selon son mode et le membre qui la regarde.
 * Renvoie { open, talks } : open = false si la collection ne doit pas s'afficher (saison fermée, membre non connecté).
 */
export async function resolveCollection(c, viewer, { size, preview = false } = {}) {
  let ids = null;
  if (c.mode === 'personal') {
    if (!viewer) return { open: false, talks: [] };
    ids = await personalIds(c.rule || {}, c.catalogue, viewer, size);
  } else {
    if (c.mode === 'seasonal' && !preview && !(await seasonOpen(c.season))) return { open: false, talks: [] };
    if ((c.mode === 'auto' || c.mode === 'seasonal') && !isEmptyRule(c.rule)) ids = await autoIds(c.rule, c.catalogue, size);
  }
  const vis = `t.video_status = 'ready' AND ${visibleSql('t')}`;
  let rows;
  if (ids) {
    if (!ids.length) return { open: true, talks: [] };
    const res = await pool.query(`SELECT ${CARD} FROM talks t LEFT JOIN category_names c ON c.id = t.category_id WHERE t.id = ANY($1::uuid[]) AND ${vis}`, [ids]);
    const by = new Map(res.rows.map((r) => [r.id, r]));
    rows = ids.map((i) => by.get(i)).filter(Boolean);
  } else {
    const n = limitOf(c.rule || {}, size);
    rows = (await pool.query(
      `SELECT ${CARD} FROM collection_items i JOIN talks t ON t.id = i.talk_id LEFT JOIN category_names c ON c.id = t.category_id
        WHERE i.collection_id = $1 AND ${vis} AND ${c.catalogue === 'kids' ? `COALESCE(array_length(t.kids_bands, 1), 0) > 0` : adultSql('t')} ORDER BY i.position LIMIT ${n}`, [c.id])).rows;
  }
  return { open: true, talks: await cards(rows) };
}

/**
 * Collections publiées « à l'accueil » d'un catalogue, dans l'ordre choisi par l'équipe.
 * `allowed` (Set d'identifiants de vidéos) : pour Kids, on ne garde que ce que CET enfant peut voir (âge, contrôle parental).
 * Une collection vide, hors saison ou personnelle sans membre n'est jamais renvoyée.
 */
export async function homeCollections(catalogue, viewer, { allowed = null, size = DEFAULT_LIMIT } = {}) {
  const { rows } = await pool.query(
    `SELECT id, slug, title, description, mode, catalogue, rule, season FROM collections
      WHERE published AND on_home AND catalogue = $1 ORDER BY home_order, title`, [catalogue]);
  const out = [];
  for (const c of rows) {
    const r = await resolveCollection(c, viewer, { size: allowed ? 50 : size });
    if (!r.open) continue;
    let talks = r.talks;
    if (allowed) talks = talks.filter((x) => allowed.has(x.id));
    talks = talks.slice(0, size);
    if (talks.length) out.push({ id: c.id, slug: c.slug, title: c.title, description: c.description, mode: c.mode, talks });
  }
  return out;
}
