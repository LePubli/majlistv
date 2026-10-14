// Étape 31 — Bibliothèque de thèmes « Du savoir à l'action ».
// Les thèmes (qualités Q, défauts D, thèmes d'action A) sont dans themesTazkiya.json, issu de docs/themes-tazkiya-base.md.
// La base reste cachée au public tant que l'administrateur n'a pas activé « practice_themes_on » (relecture faite).
import { readFileSync } from 'node:fs';
import { pool } from './db.js';
import { getSetting, isOn } from './settings.js';
import { visibleSql } from './visibility.js';

export const THEMES = JSON.parse(readFileSync(new URL('./themesTazkiya.json', import.meta.url), 'utf8'));
export const THEME_BY_ID = new Map(THEMES.map((t) => [t.id, t]));
export const MAX_TALK_THEMES = 3;
export const themesOn = async () => isOn(await getSetting('practice_themes_on'));

export const themeCard = (t) => ({ id: t.id, kind: t.kind, title: t.title, translit: t.translit, ar: t.ar, desc: t.desc });

// Thèmes posés sur une conférence (liste vide tant que la base n'est pas activée).
export async function talkThemes(talkId) {
  if (!(await themesOn())) return [];
  const { rows } = await pool.query('SELECT theme_id FROM talk_themes WHERE talk_id = $1 ORDER BY theme_id', [talkId]);
  return rows.map((r) => THEME_BY_ID.get(r.theme_id)).filter(Boolean).map(themeCard);
}

// Conférences visibles portant ce thème.
export async function talksOfTheme(themeId, limit = 24) {
  const { rows } = await pool.query(
    `SELECT t.id, t.title, t.speaker, t.duration_seconds, t.language
       FROM talk_themes x JOIN talks t ON t.id = x.talk_id
      WHERE x.theme_id = $1 AND ${visibleSql('t')} ORDER BY t.created_at DESC LIMIT $2`, [themeId, limit]);
  return rows;
}
