// Droits « par chaîne » : le propriétaire d'une chaîne et ses éditeurs gèrent aussi les conférences qui portent le nom de la chaîne,
// même si une autre personne les a créées (organizer_id). Pas de colonne en plus : le lien conférence → chaîne est le nom d'intervenant
// (speakerSlug), comme partout. La suppression d'une conférence reste réservée à son créateur et à l'administrateur.
import { pool } from './db.js';
import { speakerSlug } from './speakers.js';

// Identifiants (slugs) des chaînes que la personne possède ou où elle est éditrice.
export async function myChannelSlugs(userId) {
  if (!userId) return new Set();
  const { rows } = await pool.query(
    'SELECT slug FROM speakers WHERE owner_id = $1 UNION SELECT slug FROM channel_members WHERE user_id = $1', [userId]);
  return new Set(rows.map((r) => r.slug));
}

// La conférence (identifiant ou ligne avec .speaker) appartient-elle à l'une de mes chaînes ?
export async function viaChannel(user, talk) {
  if (!user?.sub) return false;
  let speaker = talk && typeof talk === 'object' ? talk.speaker : undefined;
  if (speaker === undefined) {
    const id = typeof talk === 'object' ? talk?.id : talk;
    if (!id) return false;
    speaker = (await pool.query('SELECT speaker FROM talks WHERE id = $1', [id])).rows[0]?.speaker;
  }
  const slug = speakerSlug(speaker);
  return !!slug && (await myChannelSlugs(user.sub)).has(slug);
}

// Noms d'intervenant (minuscules, sans espaces autour) des conférences de mes chaînes : pour filtrer en SQL
// `lower(trim(t.speaker)) = ANY($n::text[])`.
export async function managedSpeakers(userId) {
  const slugs = await myChannelSlugs(userId);
  if (!slugs.size) return [];
  const { rows } = await pool.query("SELECT DISTINCT lower(trim(speaker)) AS n FROM talks WHERE trim(speaker) <> ''");
  return rows.map((r) => r.n).filter((n) => slugs.has(speakerSlug(n)));
}
