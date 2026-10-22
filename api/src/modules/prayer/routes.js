// Réglages « Prière » du compte :
//   GET /me/prayer   { prefs }   les choix enregistrés (null si la personne n'a encore rien choisi)
//   PUT /me/prayer   { prefs }   enregistre les choix (validés ; la durée de pause est ramenée au plafond de l'administrateur)
import { z } from 'zod';
import { pool } from '../../db.js';
import { getNumber } from '../../settings.js';

const METHODS = ['uoif', 'mwl', 'umm', 'egypt', 'turkey', 'isna'];
const PRAYERS = ['fajr', 'dhuhr', 'asr', 'maghrib', 'isha'];

const prefsSchema = z.object({
  enabled: z.boolean(),
  pill: z.boolean(),
  method: z.enum(METHODS),
  asr: z.enum(['standard', 'hanafi']),
  highLat: z.enum(['angle', 'middle', 'seventh']).default('angle'),
  blockMinutes: z.number().int().min(1).max(120),
  prayers: z.object(Object.fromEntries(PRAYERS.map((p) => [p, z.boolean()]))).strict(),
  loc: z.discriminatedUnion('mode', [
    z.object({ mode: z.literal('auto') }).strict(),
    z.object({ mode: z.literal('city'), city: z.string().regex(/^[a-z0-9-]{2,40}$/) }).strict(),
    z.object({ mode: z.literal('geo'), lat: z.number().min(-90).max(90), lon: z.number().min(-180).max(180), tz: z.string().max(60), name: z.string().max(80).default('') }).strict(),
  ]),
}).strict();

export default async function prayerRoutes(app) {
  const auth = { preHandler: app.authenticate };

  app.get('/me/prayer', auth, async (req) => {
    const { rows } = await pool.query('SELECT prefs FROM user_prayer_prefs WHERE user_id = $1', [req.user.sub]);
    return { prefs: rows[0]?.prefs ?? null };
  });

  app.put('/me/prayer', auth, async (req) => {
    const { prefs } = z.object({ prefs: prefsSchema }).parse(req.body ?? {});
    const max = await getNumber('mod_prayer_max_block_minutes');
    const clean = { ...prefs, blockMinutes: Math.min(prefs.blockMinutes, max || 30) };
    if (clean.loc.mode === 'geo') { // précision limitée à 0,1° (≈ 11 km) : les horaires n'en demandent pas plus
      clean.loc = { ...clean.loc, lat: Math.round(clean.loc.lat * 10) / 10, lon: Math.round(clean.loc.lon * 10) / 10 };
    }
    await pool.query(
      `INSERT INTO user_prayer_prefs(user_id, prefs, updated_at) VALUES ($1, $2, now())
       ON CONFLICT (user_id) DO UPDATE SET prefs = EXCLUDED.prefs, updated_at = now()`, [req.user.sub, clean]);
    return { prefs: clean };
  });
}
