// Phase 5 (20/11) — filtres communs au Catalogue (GET /talks), à la recherche (GET /search) et à la recherche Kids.
// Un seul endroit décrit les filtres et leur SQL, pour que le site, l'API et les tests parlent de la même chose :
//   lang      langue de la vidéo (celle de l'intervenant)               ex. fr
//   audio     langue qu'on peut ÉCOUTER : la langue d'origine, ou le français si un doublage existe
//   subs      langue de sous-titres disponible (transcription d'origine ou traduction prête)
//   duration  short (< 10 min) · medium (10 à 30 min) · long (> 30 min)
//   progress  todo (pas commencée) · started (en cours) · done (terminée) — nécessite d'être connecté, sinon ignoré
//   resources quiz (questions validées) · book (livre/PDF lié et publié) · any (l'un ou l'autre)
// Les tables des modules (doublage, livres) peuvent ne pas exister : on le vérifie avant de les citer dans une requête.
import { z } from 'zod';
import { pool } from './db.js';

const LANG = z.string().regex(/^[a-z]{2,3}$/);
export const filterShape = {
  lang: LANG.optional(),
  audio: LANG.optional(),
  subs: LANG.optional(),
  duration: z.enum(['short', 'medium', 'long']).optional(),
  progress: z.enum(['todo', 'started', 'done']).optional(),
  resources: z.enum(['quiz', 'book', 'any']).optional(),
};
export const FILTER_KEYS = Object.keys(filterShape);

/** Vrai si au moins un filtre de cette phase est demandé (hors niveau et catégorie, déjà gérés ailleurs). */
export const hasFilters = (p) => FILTER_KEYS.some((k) => p[k] != null);

const SHORT_S = 600;
const LONG_S = 1800;

const cache = new Map();
/** La table existe-t-elle ? (un « oui » est gardé ; un « non » est revérifié, un module peut être activé plus tard.) */
async function hasTable(name) {
  if (cache.get(name)) return true;
  const ok = (await pool.query('SELECT to_regclass($1) IS NOT NULL AS ok', [`public.${name}`])).rows[0].ok;
  if (ok) cache.set(name, true);
  return ok;
}

/**
 * Conditions SQL (chacune commence par « AND ») pour les filtres demandés.
 * `vals` est la liste des paramètres de la requête : on y ajoute les nôtres et on cite leur numéro.
 * `viewerId` : utilisateur connecté (ou null) — sert au filtre de progression.
 */
export async function filterSql(p, vals, viewerId = null, alias = 't') {
  const a = alias;
  const out = [];
  const bind = (v) => { vals.push(v); return `$${vals.length}`; };
  if (p.lang) out.push(`AND ${a}.language = ${bind(p.lang)}`);
  if (p.audio) {
    const n = bind(p.audio);
    const dub = p.audio === 'fr' && (await hasTable('dub_tracks')) ? ` OR EXISTS (SELECT 1 FROM dub_tracks d WHERE d.talk_id = ${a}.id)` : '';
    out.push(`AND (${a}.language = ${n}${dub})`);
  }
  if (p.subs) {
    const n = bind(p.subs);
    out.push(`AND (${a}.transcript_language = ${n} OR EXISTS (SELECT 1 FROM transcript_translations tt WHERE tt.talk_id = ${a}.id AND tt.lang = ${n} AND tt.status = 'ready'))`);
  }
  if (p.duration === 'short') out.push(`AND ${a}.duration_seconds > 0 AND ${a}.duration_seconds < ${SHORT_S}`);
  if (p.duration === 'medium') out.push(`AND ${a}.duration_seconds >= ${SHORT_S} AND ${a}.duration_seconds <= ${LONG_S}`);
  if (p.duration === 'long') out.push(`AND ${a}.duration_seconds > ${LONG_S}`);
  if (p.progress && viewerId) {
    const n = bind(viewerId);
    const row = `SELECT 1 FROM watch_progress w WHERE w.talk_id = ${a}.id AND w.user_id = ${n}`;
    if (p.progress === 'done') out.push(`AND EXISTS (${row} AND w.completed)`);
    else if (p.progress === 'started') out.push(`AND EXISTS (${row} AND NOT w.completed AND w.position_ms > 0)`);
    else out.push(`AND NOT EXISTS (${row} AND (w.completed OR w.position_ms > 0))`);
  }
  if (p.resources) {
    const quiz = `EXISTS (SELECT 1 FROM quiz_questions qq WHERE qq.talk_id = ${a}.id AND qq.status = 'approved')`;
    const book = (await hasTable('book_talks')) ? `EXISTS (SELECT 1 FROM book_talks bt JOIN books b ON b.id = bt.book_id WHERE bt.talk_id = ${a}.id AND b.published)` : 'FALSE';
    out.push(`AND (${p.resources === 'quiz' ? quiz : p.resources === 'book' ? book : `${quiz} OR ${book}`})`);
  }
  return out.join(' ');
}
