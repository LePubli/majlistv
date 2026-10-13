// Intervenants (étape 16.2b) : un intervenant = le nom saisi sur ses conférences ; sa page est identifiée par un slug stable.
import { createHash } from 'node:crypto';
import { pool } from './db.js';
import { slugify } from './slugs.js';
import { visibleSql } from './visibility.js';
import { adultSql } from './taxonomy.js';

// « Cheikh Hamza » → « cheikh-hamza » ; nom sans lettres latines (arabe) : « intervenant-xxxxxxxx » (empreinte du nom).
export function speakerSlug(name) {
  const n = String(name || '').replace(/\s+/g, ' ').trim();
  if (!n) return null;
  return slugify(n) || `intervenant-${createHash('md5').update(n.toLowerCase()).digest('hex').slice(0, 8)}`;
}

// Intervenants du catalogue public (conférences et séries visibles) : { slug, name (graphie la plus fréquente), talks, series }.
export async function publicSpeakers() {
  const t = (await pool.query(
    `SELECT trim(t.speaker) AS name, count(*)::int AS n FROM talks t
      WHERE trim(t.speaker) <> '' AND t.video_status = 'ready' AND ${visibleSql('t')} AND ${adultSql('t')} GROUP BY 1`)).rows;
  const s = (await pool.query(
    `SELECT trim(s.speaker) AS name, count(DISTINCT s.id)::int AS n FROM series s
       JOIN series_episodes e ON e.series_id = s.id JOIN talks t ON t.id = e.talk_id AND t.video_status = 'ready' AND ${visibleSql('t')}
      WHERE s.published AND trim(s.speaker) <> '' GROUP BY 1`)).rows;
  const map = new Map();
  const add = (rows, key) => {
    for (const r of rows) {
      const slug = speakerSlug(r.name);
      const e = map.get(slug) || { slug, names: new Map(), talks: 0, series: 0 };
      e.names.set(r.name, (e.names.get(r.name) || 0) + r.n); e[key] += r.n; map.set(slug, e);
    }
  };
  add(t, 'talks'); add(s, 'series');
  return [...map.values()].map((e) => ({ slug: e.slug, name: [...e.names.entries()].sort((a, b) => b[1] - a[1])[0][0], names: [...e.names.keys()], talks: e.talks, series: e.series }))
    .sort((a, b) => b.talks - a.talks || a.name.localeCompare(b.name));
}

// Graphies (en minuscules) d'un slug, pour filtrer les conférences et séries de cet intervenant ; [] si inconnu.
export async function speakerNames(slug) {
  const e = (await publicSpeakers()).find((x) => x.slug === slug);
  return e ? e.names.map((n) => n.toLowerCase()) : [];
}

export async function speakerBio(slug) {
  return (await pool.query('SELECT bio FROM speakers WHERE slug = $1', [slug])).rows[0]?.bio || '';
}
