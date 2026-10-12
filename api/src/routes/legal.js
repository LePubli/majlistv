// Pages légales (mentions légales, CGV, confidentialité) : lecture publique, modification par les admins.
import { z } from 'zod';
import { pool } from '../db.js';

const slugSchema = z.object({ slug: z.string().regex(/^[a-z0-9-]{2,40}$/) });

export default async function legalRoutes(app) {
  const adminOnly = { preHandler: app.requireRole('admin') };

  app.get('/legal', async () => (await pool.query('SELECT slug, title FROM legal_pages ORDER BY slug')).rows);

  app.get('/legal/:slug', async (req, reply) => {
    const { slug } = slugSchema.parse(req.params);
    const { rows } = await pool.query('SELECT slug, title, body, updated_at AS "updatedAt" FROM legal_pages WHERE slug = $1', [slug]);
    if (!rows[0]) return reply.code(404).send({ error: 'Page introuvable' });
    return rows[0];
  });

  app.put('/admin/legal/:slug', adminOnly, async (req) => {
    const { slug } = slugSchema.parse(req.params);
    const { title, body } = z.object({ title: z.string().trim().min(1).max(120), body: z.string().max(60000) }).parse(req.body);
    const { rows } = await pool.query(
      `INSERT INTO legal_pages(slug, title, body, updated_by) VALUES ($1, $2, $3, $4)
       ON CONFLICT (slug) DO UPDATE SET title = EXCLUDED.title, body = EXCLUDED.body, updated_by = EXCLUDED.updated_by, updated_at = now()
       RETURNING slug, title, body, updated_at AS "updatedAt"`,
      [slug, title, body, req.user.sub]
    );
    return rows[0];
  });

  // Preuves de consentement d'un utilisateur (en cas de litige).
  app.get('/admin/users/:id/consents', adminOnly, async (req) => {
    const { id } = z.object({ id: z.string().uuid() }).parse(req.params);
    const { rows } = await pool.query(
      'SELECT kind, version, text, context, ip, created_at AS "createdAt" FROM consents WHERE user_id = $1 ORDER BY created_at DESC LIMIT 50', [id]);
    return rows;
  });
}
