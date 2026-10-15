// Chaînes (étape C) : une chaîne = la page publique d'un intervenant, avec un propriétaire (un organisateur).
//   GET  /channels, /channels/:slug      public : liste et fiche (mêmes données que /speakers, plus le nombre d'abonnés)
//   GET  /studio/channels                organisateur : SES chaînes ; modérateur et administrateur : toutes
//   PUT  /studio/channels/:slug          nom et présentation : le propriétaire, un modérateur ou un administrateur
//   PUT  /studio/channels/:slug/owner    attribuer / retirer le propriétaire : modérateur ou administrateur
//   GET  /studio/channel-owners          personnes à qui une chaîne peut être attribuée : modérateur ou administrateur
// Les conférences, séries et épisodes restent gérés par l'organisateur qui les a créés (organizer_id) ; la chaîne porte la présentation.
import { z } from 'zod';
import { pool } from '../db.js';
import { publicSpeakers, speakerBio, speakerSlug } from '../speakers.js';
import { syncChannels, channelImages } from '../channels.js';
import { listSeries } from './series.js';
import { putObject, presignGet, deleteObject } from '../storage.js';

const slugParam = z.object({ slug: z.string().min(1).max(120).regex(/^[a-z0-9-]+$/) });
const OWNER_ROLES = ['organizer', 'moderator', 'admin'];
// Formats d'image acceptés pour l'avatar et la bannière (le navigateur les réduit avant l'envoi).
const IMG_TYPES = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' };
const KINDS = { avatar: 'avatar_key', banner: 'banner_key' };

export default async function channelRoutes(app) {
  const anyManager = { preHandler: app.requireRole('organizer', 'moderator', 'admin') };
  const staff = { preHandler: app.requireRole('moderator', 'admin') };
  const followersOf = async (slugs) => new Map((await pool.query(
    'SELECT speaker_slug AS slug, count(*)::int AS n FROM speaker_follows WHERE speaker_slug = ANY($1) GROUP BY 1', [slugs])).rows.map((r) => [r.slug, r.n]));

  app.get('/channels', async (req, reply) => {
    const list = await publicSpeakers();
    const f = await followersOf(list.map((x) => x.slug));
    reply.header('cache-control', 'public, max-age=60');
    const img = await channelImages(list.map((x) => x.slug));
    return list.map(({ slug, name, talks, series }) => ({ slug, name, talks, series, followers: f.get(slug) || 0, avatarUrl: img.get(slug)?.avatarUrl || null }));
  });

  app.get('/channels/:slug', async (req, reply) => {
    const { slug } = slugParam.parse(req.params);
    const e = (await publicSpeakers()).find((x) => x.slug === slug);
    if (!e) return reply.code(404).send({ error: 'Chaîne introuvable' });
    const series = await listSeries({ limit: 100, speakerNames: e.names.map((n) => n.toLowerCase()) });
    reply.header('cache-control', 'public, max-age=60');
    return { slug, name: e.name, bio: await speakerBio(slug), talks: e.talks, seriesCount: e.series, series, followers: (await followersOf([slug])).get(slug) || 0, ...((await channelImages([slug])).get(slug) || { avatarUrl: null, bannerUrl: null }) };
  });

  // Chaînes que la personne peut gérer, avec propriétaire et chiffres.
  app.get('/studio/channels', anyManager, async (req) => {
    await syncChannels({ force: true });
    const isStaff = req.user.role === 'moderator' || req.user.role === 'admin';
    const { rows } = await pool.query(
      `SELECT c.slug, c.name, c.bio, c.owner_id AS "ownerId", u.name AS "ownerName", u.email AS "ownerEmail"
         FROM speakers c LEFT JOIN users u ON u.id = c.owner_id
        ${isStaff ? '' : 'WHERE c.owner_id = $1'} ORDER BY lower(c.name)`, isStaff ? [] : [req.user.sub]);
    // Nombre de conférences par chaîne (le slug se calcule côté serveur, pas en SQL).
    const counts = new Map();
    const { rows: tr } = await pool.query("SELECT trim(speaker) AS name, count(*)::int AS n FROM talks WHERE trim(speaker) <> '' GROUP BY 1");
    for (const r of tr) counts.set(speakerSlug(r.name), (counts.get(speakerSlug(r.name)) || 0) + r.n);
    const f = await followersOf(rows.map((r) => r.slug));
    const img = await channelImages(rows.map((r) => r.slug));
    return {
      canAssign: isStaff,
      channels: rows.map((c) => ({ ...c, avatarUrl: img.get(c.slug)?.avatarUrl || null, bannerUrl: img.get(c.slug)?.bannerUrl || null, name: c.name || c.slug, talks: counts.get(c.slug) || 0, followers: f.get(c.slug) || 0, mine: c.ownerId === req.user.sub })),
    };
  });

  const patchBody = z.object({ name: z.string().trim().min(1).max(120).optional(), bio: z.string().max(3000).optional() })
    .refine((b) => b.name !== undefined || b.bio !== undefined, { message: 'Rien à modifier' });
  app.put('/studio/channels/:slug', anyManager, async (req, reply) => {
    const { slug } = slugParam.parse(req.params);
    const b = patchBody.parse(req.body ?? {});
    const c = (await pool.query('SELECT owner_id FROM speakers WHERE slug = $1', [slug])).rows[0];
    if (!c) return reply.code(404).send({ error: 'Chaîne introuvable' });
    const staffOk = req.user.role === 'moderator' || req.user.role === 'admin';
    if (!staffOk && c.owner_id !== req.user.sub) return reply.code(403).send({ error: "Cette chaîne n'est pas la vôtre" });
    const { rows } = await pool.query(
      `UPDATE speakers SET name = COALESCE($2, name), bio = COALESCE($3, bio), updated_at = now() WHERE slug = $1 RETURNING slug, name, bio`,
      [slug, b.name ?? null, b.bio === undefined ? null : b.bio.trim()]);
    req.auditSummary = `Chaîne « ${rows[0].name} » : ${[b.name !== undefined && 'nom', b.bio !== undefined && 'présentation'].filter(Boolean).join(' et ')} modifié`;
    return rows[0];
  });

  // Image de la chaîne : avatar (carré) ou bannière, envoyée en data-URL JPEG / PNG / WebP. Propriétaire, modérateur ou administrateur.
  const imgParams = z.object({ slug: slugParam.shape.slug, kind: z.enum(['avatar', 'banner']) });
  async function canEdit(req, reply, slug) {
    const c = (await pool.query('SELECT name, owner_id, avatar_key, banner_key FROM speakers WHERE slug = $1', [slug])).rows[0];
    if (!c) { reply.code(404).send({ error: 'Chaîne introuvable' }); return null; }
    if (req.user.role === 'organizer' && c.owner_id !== req.user.sub) { reply.code(403).send({ error: "Cette chaîne n'est pas la vôtre" }); return null; }
    return c;
  }
  app.post('/studio/channels/:slug/image/:kind', { ...anyManager, bodyLimit: 4 * 1024 * 1024 }, async (req, reply) => {
    const { slug, kind } = imgParams.parse(req.params);
    const { image } = z.object({ image: z.string().max(3_500_000) }).parse(req.body ?? {});
    const m = image.match(/^data:(image\/(?:jpeg|png|webp));base64,([A-Za-z0-9+/=]+)$/);
    if (!m) return reply.code(400).send({ error: 'Image JPEG, PNG ou WebP attendue' });
    const buf = Buffer.from(m[2], 'base64');
    const magic = (m[1] === 'image/jpeg' && buf[0] === 0xff && buf[1] === 0xd8)
      || (m[1] === 'image/png' && buf.subarray(1, 4).toString() === 'PNG')
      || (m[1] === 'image/webp' && buf.subarray(0, 4).toString() === 'RIFF' && buf.subarray(8, 12).toString() === 'WEBP');
    if (!magic || buf.length > 2.5 * 1024 * 1024) return reply.code(400).send({ error: 'Image invalide ou trop lourde (2,5 Mo maximum)' });
    const c = await canEdit(req, reply, slug); if (!c) return undefined;
    const col = KINDS[kind];
    const key = `channels/${slug}/${kind}-${Date.now()}.${IMG_TYPES[m[1]]}`;
    await putObject(key, buf, m[1]);
    await pool.query(`UPDATE speakers SET ${col} = $2, updated_at = now() WHERE slug = $1`, [slug, key]);
    if (c[col]) await deleteObject(c[col]).catch(() => {});
    req.auditSummary = `Chaîne « ${c.name || slug} » : ${kind === 'avatar' ? 'image de profil' : 'bannière'} modifiée`;
    return reply.code(201).send({ url: await presignGet(key) });
  });

  app.delete('/studio/channels/:slug/image/:kind', anyManager, async (req, reply) => {
    const { slug, kind } = imgParams.parse(req.params);
    const c = await canEdit(req, reply, slug); if (!c) return undefined;
    const col = KINDS[kind];
    await pool.query(`UPDATE speakers SET ${col} = NULL, updated_at = now() WHERE slug = $1`, [slug]);
    if (c[col]) await deleteObject(c[col]).catch(() => {});
    req.auditSummary = `Chaîne « ${c.name || slug} » : ${kind === 'avatar' ? 'image de profil' : 'bannière'} retirée`;
    return reply.code(204).send();
  });

  app.put('/studio/channels/:slug/owner', staff, async (req, reply) => {
    const { slug } = slugParam.parse(req.params);
    const { ownerId } = z.object({ ownerId: z.string().uuid().nullable() }).parse(req.body ?? {});
    const c = (await pool.query('SELECT name FROM speakers WHERE slug = $1', [slug])).rows[0];
    if (!c) return reply.code(404).send({ error: 'Chaîne introuvable' });
    let who = null;
    if (ownerId) {
      who = (await pool.query('SELECT id, name, email, role FROM users WHERE id = $1', [ownerId])).rows[0];
      if (!who || !OWNER_ROLES.includes(who.role)) return reply.code(400).send({ error: 'Le propriétaire doit être un organisateur, un modérateur ou un administrateur' });
    }
    await pool.query('UPDATE speakers SET owner_id = $2, owner_locked = true, updated_at = now() WHERE slug = $1', [slug, ownerId]);
    req.auditSummary = `Chaîne « ${c.name || slug} » : ${who ? `attribuée à ${who.name || who.email}` : 'propriétaire retiré'}`;
    return { slug, ownerId, ownerName: who ? who.name : null };
  });

  app.get('/studio/channel-owners', staff, async () => (await pool.query(
    "SELECT id, name, email, role FROM users WHERE role = ANY($1) ORDER BY lower(coalesce(nullif(name, ''), email)) LIMIT 300", [OWNER_ROLES])).rows);
}
