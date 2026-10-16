// Échéances des engagements (« aujourd'hui », « cette semaine », « ce mois-ci »), partagées par la mise en pratique (module)
// et les thèmes (socle). Étape M3a : sorti du module practice pour que le socle n'en dépende plus.
import { pool } from './db.js';

export const DUE_KINDS = ['today', 'week', 'month'];
// Échéance en date (jour de Paris) : aujourd'hui, dimanche de cette semaine, dernier jour du mois.
const DUE_SQL = `CASE $1::text
  WHEN 'today' THEN (now() AT TIME ZONE 'Europe/Paris')::date
  WHEN 'week'  THEN (now() AT TIME ZONE 'Europe/Paris')::date + (7 - extract(isodow FROM now() AT TIME ZONE 'Europe/Paris'))::int
  WHEN 'month' THEN (date_trunc('month', now() AT TIME ZONE 'Europe/Paris') + interval '1 month - 1 day')::date
  ELSE NULL END`;
export const dueOn = async (kind) => (kind ? (await pool.query(`SELECT to_char(${DUE_SQL}, 'YYYY-MM-DD') AS d`, [kind])).rows[0].d : null);
