// Intervenants : liste publique, fiche (présentation, séries), et édition de la présentation par l'administrateur.
import { z } from 'zod';
import { pool } from '../db.js';
import { speakerSlug, publicSpeakers, speakerNames, speakerBio } from '../speakers.js';
import * as ext from '../ext.js'; // étape M3a : séries fournies par le module series

const slugParam = z.object({ slug: z.string().min(1).max(120).regex(/^[a-z0-9-]+$/) });

export default async function speakersRoutes(app) {
  app.get('/speakers', async (req, reply) => {
    reply.header('cache-control', 'public, max-age=60');
    return (await publicSpeakers()).map(({ slug, name, talks, series }) => ({ slug, name, talks, series }));
  });

  app.get('/speakers/:slug', async (req, reply) => {
    const { slug } = slugParam.parse(req.params);
    const e = (await publicSpeakers()).find((x) => x.slug === slug);
    if (!e) return reply.code(404).send({ error: 'Intervenant introuvable' });
    const names = e.names.map((n) => n.toLowerCase());
    const series = (await ext.call('series.list', [], { limit: 100, speakerNames: names }));
    reply.header('cache-control', 'public, max-age=60');
    return { slug, name: e.name, bio: await speakerBio(slug), talks: e.talks, seriesCount: e.series, series };
  });

  // --- Administration : toutes les graphies saisies, avec leur présentation
  const adminOnly = { preHandler: app.requireRole('admin') };
  app.get('/admin/speakers', adminOnly, async () => {
    const { rows } = await pool.query(
      `SELECT trim(speaker) AS name, count(*)::int AS n FROM talks WHERE trim(speaker) <> '' GROUP BY 1`);
    const map = new Map();
    for (const r of rows) {
      const slug = speakerSlug(r.name);
      const e = map.get(slug) || { slug, names: new Map(), talks: 0 };
      e.names.set(r.name, r.n); e.talks += r.n; map.set(slug, e);
    }
    const bios = new Map((await pool.query('SELECT slug, bio FROM speakers')).rows.map((r) => [r.slug, r.bio]));
    return [...map.values()].map((e) => ({ slug: e.slug, name: [...e.names.entries()].sort((a, b) => b[1] - a[1])[0][0], talks: e.talks, bio: bios.get(e.slug) || '' }))
      .sort((a, b) => b.talks - a.talks || a.name.localeCompare(b.name));
  });

  app.put('/admin/speakers/:slug', adminOnly, async (req, reply) => {
    const { slug } = slugParam.parse(req.params);
    const { bio } = z.object({ bio: z.string().max(3000) }).parse(req.body ?? {});
    const known = (await pool.query(`SELECT trim(speaker) AS name FROM talks WHERE trim(speaker) <> '' GROUP BY 1`)).rows.some((r) => speakerSlug(r.name) === slug);
    if (!known) return reply.code(404).send({ error: 'Intervenant introuvable' });
    const text = bio.trim();
    await pool.query('INSERT INTO speakers(slug, bio) VALUES ($1, $2) ON CONFLICT (slug) DO UPDATE SET bio = EXCLUDED.bio, updated_at = now()', [slug, text]); // la ligne reste (nom et propriétaire de la chaîne)
    return { slug, bio: text };
  });
}
