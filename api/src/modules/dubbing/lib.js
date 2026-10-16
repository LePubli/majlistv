// Module « Doublage français » — règles partagées : réglages (plages, valeurs de départ, préréglages), voix, estimation.
import { z } from 'zod';
import { pool } from '../../db.js';

// Réglages numériques : plage autorisée, pas du curseur, valeur de départ. Les valeurs de départ viennent des essais du 16/10/2026.
export const PARAMS = {
  vcSteps: { min: 1, max: 10, step: 1, def: 3 },          // étapes de génération de la conversion de voix (3 = jugé équivalent à 10 à l'écoute)
  vcChunk: { min: 5, max: 25, step: 1, def: 20 },         // taille des blocs convertis en un seul appel (secondes)
  maxSpeedup: { min: 1, max: 1.5, step: 0.05, def: 1.35 }, // accélération maximale d'une phrase pour tenir dans son créneau
  duck: { min: 0, max: 100, step: 1, def: 15 },           // volume de la voix d'origine sous la voix française (%)
  borrow: { min: 0, max: 2, step: 0.1, def: 1 },          // silence qu'une phrase peut emprunter après son créneau (secondes)
  lengthScale: { min: 0.7, max: 1.5, step: 0.05, def: 1 }, // voix de base : durée des sons (> 1 = plus lent)
  noiseScale: { min: 0, max: 1, step: 0.05, def: 0.667 }, // voix de base : variation de la voix (valeur habituelle de Piper)
  noiseW: { min: 0, max: 1, step: 0.05, def: 0.8 },       // voix de base : variation du rythme (valeur habituelle de Piper)
};
export const PRESETS = {
  fast: { vcSteps: 2, vcChunk: 25 },
  balanced: { vcSteps: 3, vcChunk: 20 },
  quality: { vcSteps: 5, vcChunk: 20 },
};
export const BUILTIN = Object.fromEntries(Object.entries(PARAMS).map(([k, p]) => [k, p.def]));

const num = (k) => z.number().min(PARAMS[k].min, `${k} : ${PARAMS[k].min} minimum`).max(PARAMS[k].max, `${k} : ${PARAMS[k].max} maximum`);
const uuid = z.string().uuid();
// Valeurs envoyées : toutes facultatives (une conférence ne garde que ce qui diffère des réglages par défaut).
export const paramsSchema = z.object({
  ...Object.fromEntries(Object.keys(PARAMS).map((k) => [k, num(k).optional()])),
  baseVoice: uuid.optional(),
  targetVoice: uuid.nullable().optional(),
}).strict();

const VOICE_COLS = `id, slug, kind, name, engine, model, speaker, gender, license, notes, (sample_key IS NOT NULL) AS "hasSample", sample_bytes::int AS "sampleBytes",
  consent_date::text AS "consentDate", consent_by AS "consentBy", consent_recorded_at AS "consentRecordedAt", active, created_at AS "createdAt"`;
export async function listVoices({ all = false } = {}) {
  const { rows } = await pool.query(`SELECT ${VOICE_COLS} FROM dub_voices ${all ? '' : 'WHERE active'} ORDER BY kind DESC, (slug = 'tom') DESC, created_at, name`);
  return rows;
}
export const getVoice = async (id) => (await pool.query(`SELECT ${VOICE_COLS}, sample_key FROM dub_voices WHERE id = $1`, [id])).rows[0] || null;

// Vérifie que les voix choisies existent, sont actives et du bon type. Renvoie un message d'erreur ou null.
export async function checkVoices(p) {
  if (p.baseVoice) {
    const v = await getVoice(p.baseVoice);
    if (!v || !v.active || v.kind !== 'base') return 'Voix de base inconnue ou désactivée';
  }
  if (p.targetVoice) {
    const v = await getVoice(p.targetVoice);
    if (!v || !v.active || v.kind !== 'target') return 'Voix cible inconnue ou désactivée';
  }
  return null;
}

export const getDefaults = async () => (await pool.query('SELECT params FROM dub_defaults WHERE id = 1')).rows[0]?.params || {};
export const getTalkParams = async (talkId) => (await pool.query('SELECT params FROM dub_talk_settings WHERE talk_id = $1', [talkId])).rows[0]?.params || null;

// Réglages effectifs : valeurs d'origine ← réglages par défaut ← réglages de la conférence. Une voix supprimée entre-temps
// est remplacée : voix de base → première voix de base active (Tom d'abord) ; voix cible → aucune.
export function effective(defaults, talk, voices) {
  const out = { ...BUILTIN, baseVoice: null, targetVoice: null, ...defaults, ...(talk || {}) };
  const active = new Map(voices.filter((v) => v.active).map((v) => [v.id, v]));
  if (!out.baseVoice || active.get(out.baseVoice)?.kind !== 'base') out.baseVoice = voices.find((v) => v.active && v.kind === 'base')?.id || null;
  if (out.targetVoice && active.get(out.targetVoice)?.kind !== 'target') out.targetVoice = null;
  return out;
}

// Temps de calcul estimé. Modèle simple tiré des mesures : voix de base + (conversion : part fixe + part par étape × étapes).
export function estimate(params, speechSeconds, coefs) {
  if (!speechSeconds) return { speechSeconds: 0, rtf: null, seconds: null };
  const rtf = coefs.base + (params.targetVoice ? coefs.vcFixed + coefs.vcStep * params.vcSteps : 0);
  return { speechSeconds: Math.round(speechSeconds), rtf: Math.round(rtf * 100) / 100, seconds: Math.round(speechSeconds * rtf) };
}

export async function coefficients(ctx) {
  const n = async (k, d) => { const v = Number(await ctx.setting(k)); return Number.isFinite(v) && v >= 0 ? v : d; };
  return { base: await n('rtf_base', 2), vcFixed: await n('rtf_vc_fixed', 0.3), vcStep: await n('rtf_vc_step', 0.42) };
}

// Temps d'écoute : crédité entre deux reprises de lecture, comme le temps de visionnage des chaînes (jamais plus vite que le temps réel).
const MAX_STEP_MS = 60_000;
export async function recordListening({ talkId, positionMs, prev, audioLang }) {
  if (!prev) return 0;
  const advanced = positionMs - prev.position_ms;
  const wall = Date.now() - new Date(prev.updated_at).getTime();
  const ms = Math.min(advanced, wall + 2000, MAX_STEP_MS);
  if (!(ms >= 1000)) return 0;
  const sec = Math.round(ms / 1000);
  await pool.query(
    `INSERT INTO dub_listen(day, talk_id, audio_lang, seconds) VALUES ((now() AT TIME ZONE 'utc')::date, $1, $2, $3)
     ON CONFLICT (day, talk_id, audio_lang) DO UPDATE SET seconds = dub_listen.seconds + EXCLUDED.seconds`,
    [talkId, audioLang === 'fr' ? 'fr' : 'orig', sec]);
  return sec;
}
