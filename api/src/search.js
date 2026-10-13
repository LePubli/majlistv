// Recherche plein texte avec Meilisearch (tolérance aux fautes, arabe, transcriptions et traductions).
// L'API alimente l'index toute seule (boucle de synchronisation) ; sans Meilisearch configuré,
// la recherche retombe sur la recherche SQL simple.
import { categoryIdsSql } from './taxonomy.js';
import { createHash } from 'node:crypto';
import { visibleSql } from './visibility.js';
import { pool } from './db.js';
import { getSetting } from './settings.js';

export const INDEX = 'talks';
const MAX_TRANSCRIPT = 400_000; // caractères par champ : garde-fou de taille de document

const state = { configuredFor: null, lastError: null, lastSyncAt: null, running: false };
export const searchStatus = () => ({ lastError: state.lastError, lastSyncAt: state.lastSyncAt });

// Connexion d'après Admin → Paramètres → Recherche (null = Meilisearch non configuré).
export async function meiliConf() {
  const url = (await getSetting('meili_url')).replace(/\/$/, '');
  const key = await getSetting('meili_key');
  return url && key ? { url, key } : null;
}

export async function meili(c, method, path, body, timeout = 10000) {
  const res = await fetch(c.url + path, {
    method,
    headers: { authorization: `Bearer ${c.key}`, ...(body !== undefined ? { 'content-type': 'application/json' } : {}) },
    body: body !== undefined ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(timeout),
  });
  const text = await res.text();
  let json = null;
  try { json = JSON.parse(text); } catch { /* corps vide ou non JSON */ }
  if (!res.ok) {
    const err = new Error(`Meilisearch HTTP ${res.status} : ${json?.message || text.slice(0, 200)}`);
    err.status = res.status;
    err.code = json?.code;
    throw err;
  }
  return json;
}

const SETTINGS = {
  searchableAttributes: ['title', 'speaker', 'category', 'description', 'transcript', 'transcriptOther'],
  filterableAttributes: ['categoryId', 'categoryIds', 'showAdults', 'access', 'language', 'source'],
  sortableAttributes: ['createdAt'],
  typoTolerance: { minWordSizeForTypos: { oneTypo: 4, twoTypos: 8 } },
  pagination: { maxTotalHits: 1000 },
};

// Crée l'index et applique les réglages (une fois par serveur Meilisearch). Si l'index est neuf ou vide
// alors que la base croit l'avoir rempli (nouveau serveur, volume perdu), on repart de zéro.
async function ensureIndex(c) {
  const id = createHash('sha256').update(c.url + c.key).digest('hex');
  if (state.configuredFor === id) return;
  let docs = 0;
  try {
    docs = (await meili(c, 'GET', `/indexes/${INDEX}/stats`)).numberOfDocuments;
  } catch (err) {
    if (err.status !== 404) throw err;
    await meili(c, 'POST', '/indexes', { uid: INDEX, primaryKey: 'id' });
  }
  await meili(c, 'PATCH', `/indexes/${INDEX}/settings`, SETTINGS);
  if (docs === 0) await pool.query('DELETE FROM search_state');
  state.configuredFor = id;
}

// Signature du contenu indexable : si elle change, la conférence est réindexée.
const SIG = `md5(concat_ws('|', t.title, t.speaker, t.description, t.language, t.access, t.category_id, c.name, t.show_adults, array_to_string(${categoryIdsSql('t')}, ','),
  length(coalesce(t.transcript_text, '')), extract(epoch FROM t.transcript_edited_at)::bigint,
  (SELECT count(*) FROM transcript_segments s WHERE s.talk_id = t.id),
  (SELECT string_agg(tr.lang || ':' || tr.status || ':' || extract(epoch FROM tr.updated_at)::bigint, ',' ORDER BY tr.lang)
     FROM transcript_translations tr WHERE tr.talk_id = t.id)))`;

async function buildDocs(ids) {
  const { rows } = await pool.query(
    `SELECT t.id, t.title, t.speaker, t.description, t.language, t.access, t.source, t.category_id AS "categoryId", ${categoryIdsSql('t')} AS "categoryIds", t.show_adults AS "showAdults",
            c.name AS category, extract(epoch FROM t.created_at)::bigint AS "createdAt",
            left(coalesce(t.transcript_text, ''), $2) AS transcript,
            left(coalesce((SELECT string_agg(s.text, ' ' ORDER BY s.lang, s.idx) FROM transcript_segments s
                            WHERE s.talk_id = t.id AND s.lang <> coalesce(t.transcript_language, '')), ''), $2) AS "transcriptOther"
     FROM talks t LEFT JOIN category_names c ON c.id = t.category_id WHERE t.id = ANY($1)`,
    [ids, MAX_TRANSCRIPT]
  );
  return rows.map((r) => ({ ...r, createdAt: Number(r.createdAt) }));
}

// Un passage de synchronisation : ajoute/actualise les conférences prêtes, retire les autres et les supprimées.
export async function syncOnce(log) {
  const c = await meiliConf();
  if (!c) { state.lastError = null; return { enabled: false }; }
  await ensureIndex(c);
  let indexed = 0;
  let removed = 0;
  for (;;) {
    const { rows } = await pool.query(
      `SELECT x.id, x.sig, x.ready FROM (
         SELECT t.id, ${SIG} AS sig, (t.video_status = 'ready' AND ${visibleSql('t')}) AS ready, s.signature AS old
         FROM talks t LEFT JOIN category_names c ON c.id = t.category_id LEFT JOIN search_state s ON s.talk_id = t.id
       ) x WHERE (x.ready AND x.old IS DISTINCT FROM x.sig) OR (NOT x.ready AND x.old IS NOT NULL) LIMIT 25`
    );
    if (!rows.length) break;
    const ready = rows.filter((r) => r.ready);
    const gone = rows.filter((r) => !r.ready).map((r) => r.id);
    if (ready.length) {
      await meili(c, 'POST', `/indexes/${INDEX}/documents`, await buildDocs(ready.map((r) => r.id)), 60000);
      for (const r of ready) {
        await pool.query(
          `INSERT INTO search_state(talk_id, signature) VALUES ($1, $2)
           ON CONFLICT (talk_id) DO UPDATE SET signature = EXCLUDED.signature, indexed_at = now()`, [r.id, r.sig]);
      }
      indexed += ready.length;
    }
    if (gone.length) {
      await meili(c, 'POST', `/indexes/${INDEX}/documents/delete-batch`, gone);
      await pool.query('DELETE FROM search_state WHERE talk_id = ANY($1)', [gone]);
      removed += gone.length;
    }
  }
  // Conférences supprimées de la base : à retirer de l'index.
  const orphans = (await pool.query(
    'SELECT talk_id FROM search_state s WHERE NOT EXISTS (SELECT 1 FROM talks t WHERE t.id = s.talk_id) LIMIT 500'
  )).rows.map((r) => r.talk_id);
  if (orphans.length) {
    await meili(c, 'POST', `/indexes/${INDEX}/documents/delete-batch`, orphans);
    await pool.query('DELETE FROM search_state WHERE talk_id = ANY($1)', [orphans]);
    removed += orphans.length;
  }
  if (indexed || removed) log.info(`Recherche : ${indexed} conférence(s) indexée(s), ${removed} retirée(s)`);
  state.lastError = null;
  state.lastSyncAt = new Date().toISOString();
  return { enabled: true, indexed, removed };
}

// Boucle de fond (toutes les 15 s). Une erreur (Meilisearch arrêté…) est notée puis retentée au tour suivant.
export function startSearchSync(log, everyMs = 15000) {
  const tick = async () => {
    if (state.running) return;
    state.running = true;
    try {
      await syncOnce(log);
    } catch (err) {
      if (state.lastError !== err.message) log.warn(`Recherche : synchronisation impossible (${err.message})`);
      state.lastError = err.message;
      state.configuredFor = null; // revérifie l'index au prochain tour
    } finally {
      state.running = false;
    }
  };
  setTimeout(tick, 3000);
  return setInterval(tick, everyMs);
}

// Réindexation complète (bouton du back-office) : vide l'index, la boucle le remplit à nouveau.
export async function resetIndex() {
  const c = await meiliConf();
  if (!c) throw new Error('Meilisearch non configuré');
  try { await meili(c, 'DELETE', `/indexes/${INDEX}`); } catch (err) { if (err.status !== 404) throw err; }
  await pool.query('DELETE FROM search_state');
  state.configuredFor = null;
}

// Mots de la requête utilisables pour retrouver les passages horodatés (3 lettres ou plus, 6 au maximum).
export const queryWords = (q) => [...new Set(q.toLowerCase().split(/[^\p{L}\p{N}]+/u).filter((w) => w.length >= 3))].slice(0, 6);
