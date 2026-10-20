// Chaînes (étape C) : une chaîne = la page publique d'un intervenant, avec un propriétaire (un organisateur).
//   GET  /channels, /channels/:slug      public : liste et fiche (mêmes données que /speakers, plus le nombre d'abonnés)
//   GET  /studio/channels                organisateur : SES chaînes ; modérateur et administrateur : toutes
//   PUT  /studio/channels/:slug          page de la chaîne (nom, présentation, accroche, liens, pays…) : propriétaire, éditeur, modérateur, administrateur
//   POST /studio/channels                créer une chaîne (organisateur : 10 au plus) ; DELETE /studio/channels/:slug : supprimer une chaîne vide
//   GET/POST/DELETE /studio/channels/:slug/members   équipe d'éditeurs : propriétaire, modérateur, administrateur
//   PUT  /studio/channels/:slug/owner    attribuer / retirer le propriétaire : modérateur ou administrateur
//   GET  /studio/channel-owners          personnes à qui une chaîne peut être attribuée : modérateur ou administrateur
// Les séries restent gérées par leur créateur ; les conférences qui portent le nom de la chaîne sont gérées aussi par le propriétaire et les éditeurs (src/channelAccess.js).
import { z } from 'zod';
import { pool } from '../../db.js';
import { publicSpeakers, speakerBio, speakerSlug } from '../../speakers.js';
import { syncChannels, channelImages, channelProfile, SOCIAL_KEYS } from '../../channels.js';
import * as ext from '../../ext.js'; // séries : point d'extension « series.list »
import { putObject, presignGet, deleteObject } from '../../storage.js';

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
    const series = await ext.call('series.list', [], { limit: 100, speakerNames: e.names.map((n) => n.toLowerCase()) });
    reply.header('cache-control', 'public, max-age=60');
    return { slug, name: e.name, bio: await speakerBio(slug), talks: e.talks, seriesCount: e.series, series, followers: (await followersOf([slug])).get(slug) || 0, ...(await channelProfile(slug)), ...((await channelImages([slug])).get(slug) || { avatarUrl: null, bannerUrl: null }) };
  });

  // Niveau d'accès de la personne sur une chaîne : 'staff' (modérateur/administrateur), 'owner', 'editor' ou null.
  async function levelOf(req, slug) {
    if (req.user.role === 'moderator' || req.user.role === 'admin') return 'staff';
    const r = (await pool.query(
      `SELECT c.owner_id = $2 AS owner, EXISTS (SELECT 1 FROM channel_members m WHERE m.slug = c.slug AND m.user_id = $2) AS editor
         FROM speakers c WHERE c.slug = $1`, [slug, req.user.sub])).rows[0];
    if (!r) return null;
    return r.owner ? 'owner' : r.editor ? 'editor' : null;
  }

  // Chaînes que la personne peut gérer (les siennes, celles où elle est éditrice ; toutes pour le staff), avec propriétaire et chiffres.
  app.get('/studio/channels', anyManager, async (req) => {
    await syncChannels({ force: true });
    const isStaff = req.user.role === 'moderator' || req.user.role === 'admin';
    const { rows } = await pool.query(
      `SELECT c.slug, c.name, c.bio, c.tagline, c.website, c.contact_email AS "contactEmail", c.socials, c.country, c.main_language AS "mainLanguage",
              c.featured_talk_id AS "featuredTalkId", c.key_name AS "keyName", c.owner_id AS "ownerId", u.name AS "ownerName", u.email AS "ownerEmail",
              (c.owner_id = $1) AS owner, EXISTS (SELECT 1 FROM channel_members m WHERE m.slug = c.slug AND m.user_id = $1) AS editor
         FROM speakers c LEFT JOIN users u ON u.id = c.owner_id
        ${isStaff ? '' : 'WHERE c.owner_id = $1 OR EXISTS (SELECT 1 FROM channel_members m WHERE m.slug = c.slug AND m.user_id = $1)'} ORDER BY lower(c.name)`, [req.user.sub]);
    // Nombre de conférences par chaîne et graphie la plus utilisée (le slug se calcule côté serveur, pas en SQL).
    const counts = new Map(); const spell = new Map();
    const { rows: tr } = await pool.query("SELECT trim(speaker) AS name, count(*)::int AS n FROM talks WHERE trim(speaker) <> '' GROUP BY 1");
    for (const r of tr) {
      const sl = speakerSlug(r.name);
      counts.set(sl, (counts.get(sl) || 0) + r.n);
      if (!spell.has(sl) || spell.get(sl).n < r.n) spell.set(sl, { name: r.name, n: r.n });
    }
    const f = await followersOf(rows.map((r) => r.slug));
    const img = await channelImages(rows.map((r) => r.slug));
    return {
      canAssign: isStaff,
      channels: rows.map(({ owner, editor, ...c }) => ({
        ...c, avatarUrl: img.get(c.slug)?.avatarUrl || null, bannerUrl: img.get(c.slug)?.bannerUrl || null, name: c.name || c.slug,
        // Texte à saisir dans « Intervenant » d'une conférence pour la rattacher à cette chaîne.
        keyName: c.keyName || spell.get(c.slug)?.name || c.name || c.slug,
        talks: counts.get(c.slug) || 0, followers: f.get(c.slug) || 0, mine: c.ownerId === req.user.sub,
        myRole: owner ? 'owner' : editor ? 'editor' : 'staff',
      })),
    };
  });

  // Champs d'une chaîne. Adresses : https uniquement ; pour effacer un champ, envoyer une chaîne vide.
  const httpsUrl = z.string().trim().max(200).refine((v) => v === '' || /^https:\/\/[^\s<>"']+\.[^\s<>"']+$/i.test(v), { message: 'Adresse https:// attendue' });
  const emailField = z.string().trim().max(160).refine((v) => v === '' || z.string().email().safeParse(v).success, { message: 'E-mail invalide' });
  const socialsBody = z.object(Object.fromEntries(SOCIAL_KEYS.map((k) => [k, httpsUrl.optional()]))).strict();
  const patchBody = z.object({
    name: z.string().trim().min(1).max(120).optional(), bio: z.string().max(3000).optional(),
    tagline: z.string().trim().max(100).optional(), website: httpsUrl.optional(), contactEmail: emailField.optional(),
    socials: socialsBody.optional(), country: z.string().trim().max(80).optional(),
    mainLanguage: z.string().trim().regex(/^([a-z]{2,3})?$/).optional(), featuredTalkId: z.string().uuid().nullable().optional(),
  }).refine((b) => Object.keys(b).length > 0, { message: 'Rien à modifier' });
  const LABELS = { name: 'nom', bio: 'présentation', tagline: 'accroche', website: 'site', contactEmail: 'contact', socials: 'réseaux', country: 'pays', mainLanguage: 'langue', featuredTalkId: 'conférence à la une' };
  app.put('/studio/channels/:slug', anyManager, async (req, reply) => {
    const { slug } = slugParam.parse(req.params);
    const b = patchBody.parse(req.body ?? {});
    if (!(await pool.query('SELECT 1 FROM speakers WHERE slug = $1', [slug])).rows[0]) return reply.code(404).send({ error: 'Chaîne introuvable' });
    if (!(await levelOf(req, slug))) return reply.code(403).send({ error: "Cette chaîne n'est pas la vôtre" });
    if (b.featuredTalkId) { // la conférence à la une doit porter le nom de cette chaîne
      const t = (await pool.query('SELECT speaker FROM talks WHERE id = $1', [b.featuredTalkId])).rows[0];
      if (!t || speakerSlug(t.speaker) !== slug) return reply.code(400).send({ error: 'Cette conférence n\'appartient pas à la chaîne' });
    }
    const sets = []; const vals = [slug];
    const set = (col, v, cast = '') => { vals.push(v); sets.push(`${col} = $${vals.length}${cast}`); };
    if (b.name !== undefined) set('name', b.name);
    if (b.bio !== undefined) set('bio', b.bio.trim());
    if (b.tagline !== undefined) set('tagline', b.tagline);
    if (b.website !== undefined) set('website', b.website);
    if (b.contactEmail !== undefined) set('contact_email', b.contactEmail);
    if (b.socials !== undefined) set('socials', JSON.stringify(Object.fromEntries(Object.entries(b.socials).filter(([, v]) => v))), '::jsonb');
    if (b.country !== undefined) set('country', b.country);
    if (b.mainLanguage !== undefined) set('main_language', b.mainLanguage);
    if (b.featuredTalkId !== undefined) set('featured_talk_id', b.featuredTalkId);
    const { rows } = await pool.query(`UPDATE speakers SET ${sets.join(', ')}, updated_at = now() WHERE slug = $1 RETURNING slug, name, bio`, vals);
    req.auditSummary = `Chaîne « ${rows[0].name} » : ${Object.keys(b).map((k) => LABELS[k]).join(', ')} modifié`;
    return rows[0];
  });

  // Créer une chaîne (même sans aucune conférence). Une vidéo n'a jamais l'obligation d'avoir une chaîne.
  const MAX_OWN = 10;
  app.post('/studio/channels', anyManager, async (req, reply) => {
    const { name } = z.object({ name: z.string().trim().min(1).max(120) }).parse(req.body ?? {});
    const slug = speakerSlug(name);
    if (!slug) return reply.code(400).send({ error: 'Nom invalide' });
    const isStaff = req.user.role === 'moderator' || req.user.role === 'admin';
    if (!isStaff && (await pool.query('SELECT count(*)::int AS n FROM speakers WHERE owner_id = $1', [req.user.sub])).rows[0].n >= MAX_OWN) {
      return reply.code(409).send({ error: `Vous pouvez posséder ${MAX_OWN} chaînes au plus` });
    }
    const r = await pool.query(
      `INSERT INTO speakers(slug, name, key_name, owner_id, owner_locked, created_by) VALUES ($1, $2, $2, $3, true, $3) ON CONFLICT (slug) DO NOTHING RETURNING slug, name`,
      [slug, name, req.user.sub]);
    if (!r.rows[0]) return reply.code(409).send({ error: 'Une chaîne porte déjà ce nom' });
    req.auditSummary = `Chaîne « ${name} » créée`;
    return reply.code(201).send(r.rows[0]);
  });

  // Supprimer une chaîne qui ne contient plus rien (aucune conférence ni série). Propriétaire, modérateur ou administrateur.
  app.delete('/studio/channels/:slug', anyManager, async (req, reply) => {
    const { slug } = slugParam.parse(req.params);
    const c = (await pool.query('SELECT name FROM speakers WHERE slug = $1', [slug])).rows[0];
    if (!c) return reply.code(404).send({ error: 'Chaîne introuvable' });
    const lv = await levelOf(req, slug);
    if (lv !== 'staff' && lv !== 'owner') return reply.code(403).send({ error: "Seul le propriétaire peut supprimer la chaîne" });
    const used = (await pool.query("SELECT trim(speaker) AS s FROM talks WHERE trim(speaker) <> '' UNION SELECT trim(speaker) FROM series WHERE trim(speaker) <> ''")).rows;
    if (used.some((r) => speakerSlug(r.s) === slug)) return reply.code(409).send({ error: 'La chaîne contient encore des conférences ou des séries' });
    const imgs = (await pool.query('SELECT avatar_key, banner_key FROM speakers WHERE slug = $1', [slug])).rows[0];
    await pool.query('DELETE FROM speakers WHERE slug = $1', [slug]);
    for (const k of [imgs.avatar_key, imgs.banner_key]) if (k) await deleteObject(k).catch(() => {});
    req.auditSummary = `Chaîne « ${c.name || slug} » supprimée`;
    return reply.code(204).send();
  });

  // Équipe d'éditeurs (propriétaire, modérateur, administrateur). Un éditeur modifie la page de la chaîne, pas les revenus ni l'équipe.
  async function teamGuard(req, reply, slug) {
    const c = (await pool.query('SELECT name, owner_id FROM speakers WHERE slug = $1', [slug])).rows[0];
    if (!c) { reply.code(404).send({ error: 'Chaîne introuvable' }); return null; }
    const lv = await levelOf(req, slug);
    if (lv !== 'staff' && lv !== 'owner') { reply.code(403).send({ error: "Seul le propriétaire gère l'équipe" }); return null; }
    return c;
  }
  const teamOf = async (slug) => (await pool.query(
    `SELECT u.id AS "userId", u.name, u.email FROM channel_members m JOIN users u ON u.id = m.user_id WHERE m.slug = $1 ORDER BY m.created_at`, [slug])).rows;
  app.get('/studio/channels/:slug/members', anyManager, async (req, reply) => {
    const { slug } = slugParam.parse(req.params);
    if (!(await teamGuard(req, reply, slug))) return undefined;
    return teamOf(slug);
  });
  app.post('/studio/channels/:slug/members', anyManager, async (req, reply) => {
    const { slug } = slugParam.parse(req.params);
    const { email } = z.object({ email: z.string().trim().toLowerCase().email().max(200) }).parse(req.body ?? {});
    const c = await teamGuard(req, reply, slug); if (!c) return undefined;
    const u = (await pool.query('SELECT id, name, email, role FROM users WHERE lower(email) = $1', [email])).rows[0];
    if (!u || !OWNER_ROLES.includes(u.role)) return reply.code(400).send({ error: 'Aucun organisateur avec cet e-mail (la personne doit avoir un compte organisateur)' });
    if (u.id === c.owner_id) return reply.code(400).send({ error: 'Cette personne est déjà propriétaire' });
    await pool.query('INSERT INTO channel_members(slug, user_id, added_by) VALUES ($1, $2, $3) ON CONFLICT DO NOTHING', [slug, u.id, req.user.sub]);
    req.auditSummary = `Chaîne « ${c.name || slug} » : éditeur ajouté (${u.name || u.email})`;
    return reply.code(201).send(await teamOf(slug));
  });
  app.delete('/studio/channels/:slug/members/:userId', anyManager, async (req, reply) => {
    const { slug, userId } = z.object({ slug: slugParam.shape.slug, userId: z.string().uuid() }).parse(req.params);
    const c = await teamGuard(req, reply, slug); if (!c) return undefined;
    await pool.query('DELETE FROM channel_members WHERE slug = $1 AND user_id = $2', [slug, userId]);
    req.auditSummary = `Chaîne « ${c.name || slug} » : éditeur retiré`;
    return reply.code(204).send();
  });

  // Image de la chaîne : avatar (carré) ou bannière, envoyée en data-URL JPEG / PNG / WebP. Propriétaire, modérateur ou administrateur.
  const imgParams = z.object({ slug: slugParam.shape.slug, kind: z.enum(['avatar', 'banner']) });
  async function canEdit(req, reply, slug) {
    const c = (await pool.query('SELECT name, owner_id, avatar_key, banner_key FROM speakers WHERE slug = $1', [slug])).rows[0];
    if (!c) { reply.code(404).send({ error: 'Chaîne introuvable' }); return null; }
    if (!(await levelOf(req, slug))) { reply.code(403).send({ error: "Cette chaîne n'est pas la vôtre" }); return null; }
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
