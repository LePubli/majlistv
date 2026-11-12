// Schémas de modification partielle (PATCH) — zod 4.
// Avec zod 4, `objet.partial()` applique les valeurs par défaut des champs absents : un PATCH { titre } remettrait donc
// les autres champs à leur valeur par défaut. `patchOf` rend chaque champ facultatif SANS sa valeur par défaut :
// un champ absent reste absent (comportement de zod 3). Garde le mode strict de l'objet d'origine.
import { z } from 'zod';

const bare = (s) => { let x = s; while (x instanceof z.ZodDefault || x instanceof z.ZodPrefault) x = x.unwrap(); return x; };

/** Version « PATCH » d'un objet zod : tous les champs facultatifs, aucune valeur par défaut. `omit` : champs à retirer. */
export function patchOf(obj, omit = []) {
  const shape = Object.fromEntries(Object.entries(obj.shape).filter(([k]) => !omit.includes(k)).map(([k, s]) => [k, bare(s).optional()]));
  const out = obj.extend(shape);
  const base = omit.length ? out.omit(Object.fromEntries(omit.map((k) => [k, true]))) : out;
  // Filet de sécurité : un objet vide doit rester vide (sinon une valeur par défaut est restée cachée dans un champ).
  const empty = base.safeParse({});
  if (!empty.success || Object.keys(empty.data).length) throw new Error('patchOf : une valeur par défaut subsiste dans ' + Object.keys(empty.data ?? {}).join(', '));
  return base;
}

const DT = /^(\d{4})-(\d{2})-(\d{2})T([01]\d|2[0-3]):[0-5]\d(:[0-5]\d(\.\d+)?)?(Z|[+-]\d{2}:?\d{2})$/;
const realDay = (y, m, d) => { const x = new Date(Date.UTC(y, m - 1, d)); return x.getUTCFullYear() === y && x.getUTCMonth() === m - 1 && x.getUTCDate() === d; };

/**
 * Date et heure ISO 8601, acceptée comme avec zod 3 : secondes facultatives (« 2026-01-01T10:00Z »),
 * décalage avec ou sans deux-points si `offset` (« +01:00 », « +0100 »), sinon « Z » seulement. zod 4 seul refuserait ces écritures.
 */
export const isoDateTime = ({ offset = false } = {}) => z.string().refine((v) => {
  const m = DT.exec(v);
  return !!m && realDay(Number(m[1]), Number(m[2]), Number(m[3])) && (offset || m[7] === 'Z');
}, 'Date et heure invalides (format ISO 8601 attendu)');
