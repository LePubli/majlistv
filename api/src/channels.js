// Chaînes (étape C) : registre des chaînes (table speakers), propriétaire, synchronisation avec les conférences existantes.
// Une chaîne est identifiée par le slug du nom d'intervenant saisi sur ses conférences (speakers.js) : les anciennes adresses
// /intervenants/<slug> deviennent /chaines/<slug> sans aucun changement de slug.
import { pool } from './db.js';
import { speakerSlug } from './speakers.js';
import { presignGet } from './storage.js';
import { ensureSlug } from './slugs.js';
import { visibleSql } from './visibility.js';
import { adultSql } from './taxonomy.js';

let lastSync = 0;

// Crée les chaînes manquantes (toutes les conférences, publiées ou non) et attribue chaque chaîne sans propriétaire
// à l'organisateur qui y a le plus de conférences. Ne modifie jamais un nom ou un propriétaire déjà définis. Renvoie le nombre de créations.
export async function syncChannels({ force = false } = {}) {
  if (!force && Date.now() - lastSync < 60_000) return 0;
  lastSync = Date.now();
  const { rows } = await pool.query(
    `SELECT trim(speaker) AS name, organizer_id, count(*)::int AS n FROM talks WHERE trim(speaker) <> '' GROUP BY 1, 2`);
  const by = new Map();
  for (const r of rows) {
    const slug = speakerSlug(r.name);
    const e = by.get(slug) || { names: new Map(), owners: new Map() };
    e.names.set(r.name, (e.names.get(r.name) || 0) + r.n);
    if (r.organizer_id) e.owners.set(r.organizer_id, (e.owners.get(r.organizer_id) || 0) + r.n);
    by.set(slug, e);
  }
  const top = (m) => [...m.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] || null;
  let created = 0;
  for (const [slug, e] of by) {
    const r = await pool.query(
      `INSERT INTO speakers(slug, name, owner_id) VALUES ($1, $2, $3)
       ON CONFLICT (slug) DO UPDATE SET name = CASE WHEN speakers.name = '' THEN EXCLUDED.name ELSE speakers.name END,
                                        owner_id = CASE WHEN speakers.owner_locked THEN speakers.owner_id ELSE COALESCE(speakers.owner_id, EXCLUDED.owner_id) END
       RETURNING (xmax = 0) AS inserted`, [slug, top(e.names), top(e.owners)]);
    if (r.rows[0].inserted) created += 1;
  }
  return created;
}

// Démarre la synchronisation périodique (au démarrage, puis toutes les 10 minutes).
export function startChannelSync(log) {
  const run = () => syncChannels({ force: true }).then((n) => n && log?.info(`Chaînes créées : ${n}`)).catch((e) => log?.warn(`Synchronisation des chaînes : ${e.message}`));
  run();
  setInterval(run, 10 * 60 * 1000).unref();
}

// Liens temporaires vers les images de chaînes : Map slug → { avatarUrl, bannerUrl }.
export async function channelImages(slugs) {
  const out = new Map();
  if (!slugs.length) return out;
  const { rows } = await pool.query('SELECT slug, avatar_key, banner_key FROM speakers WHERE slug = ANY($1) AND (avatar_key IS NOT NULL OR banner_key IS NOT NULL)', [slugs]);
  for (const r of rows) out.set(r.slug, { avatarUrl: r.avatar_key ? await presignGet(r.avatar_key) : null, bannerUrl: r.banner_key ? await presignGet(r.banner_key) : null });
  return out;
}

// Réseaux acceptés sur une chaîne (adresses https uniquement).
export const SOCIAL_KEYS = ['youtube', 'instagram', 'x', 'facebook', 'tiktok'];

// Champs « riches » publics d'une chaîne : accroche, site, contact, réseaux, pays, langue, conférence à la une (seulement si visible).
export async function channelProfile(slug) {
  const r = (await pool.query(
    `SELECT tagline, website, contact_email AS "contactEmail", socials, country, main_language AS "mainLanguage", featured_talk_id AS "featuredId"
       FROM speakers WHERE slug = $1`, [slug])).rows[0];
  const base = { tagline: '', website: '', contactEmail: '', socials: {}, country: '', mainLanguage: '', featured: null };
  if (!r) return base;
  let featured = null;
  if (r.featuredId) {
    const t = (await pool.query(
      `SELECT t.id, t.title, t.duration_seconds AS "durationSeconds" FROM talks t
        WHERE t.id = $1 AND t.video_status = 'ready' AND ${visibleSql('t')} AND ${adultSql('t')}`, [r.featuredId])).rows[0];
    if (t) featured = { id: t.id, title: t.title, durationSeconds: t.durationSeconds, slug: await ensureSlug('talks', t.id) };
  }
  const { featuredId, ...rest } = r;
  return { ...base, ...rest, socials: rest.socials || {}, featured };
}
