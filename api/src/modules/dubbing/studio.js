// Module « Doublage français » — intégration au Studio (étape S3) :
//   Studio → Activité : demandes de doublage dans la liste des tâches, pause d'une demande en cours ;
//   tableau de bord : écoute en français, choses à faire ; Studio → Contenus : état du doublage de chaque conférence.
import { pool } from '../../db.js';
import { KEPT, SEGS_FROM, TEXT_HASH } from './routes.js';

// Tâches de doublage (en cours, en attente, en échec depuis moins de 30 jours).
export async function collectTasks(out, { organizerId }) {
  const { rows } = await pool.query(
    `SELECT j.id, j.talk_id, j.kind, j.status, j.progress, j.phase, j.error, j.created_at, t.title
       FROM dub_jobs j JOIN talks t ON t.id = j.talk_id
      WHERE (j.status IN ('queued', 'running') OR (j.status = 'failed' AND j.updated_at > now() - interval '30 days'))
        AND ($1::uuid IS NULL OR t.organizer_id = $1) ORDER BY j.created_at`, [organizerId]);
  for (const r of rows) {
    out.push({ queue: 'dubbing', ref: r.id, talkId: r.talk_id, title: r.title, kind: r.kind,
      status: r.status === 'running' ? 'running' : r.status === 'failed' ? 'failed' : 'waiting',
      progress: r.status === 'running' ? r.progress : null, error: r.error, createdAt: r.created_at, canPauseRunning: true,
      // Une écoute de 60 s n'est pas une tâche lourde : ni la plage horaire ni la pause générale ne la retiennent.
      light: r.kind === 'preview', link: `/studio/dubbing/${r.talk_id}` });
  }
}

// Pause d'une demande en cours : le service s'arrête au prochain bloc et la remet dans la file (en pause).
export async function pauseRunning({ queue, ref }) {
  if (queue !== 'dubbing') return;
  await pool.query(`UPDATE dub_jobs SET cancel_requested = true, updated_at = now() WHERE id = $1 AND status = 'running'`, [ref]);
}

// État du doublage de conférences : texte français, relecture, piste, demande active, demandes des membres, phrases à revoir.
export async function talkStates(ids) {
  const out = new Map();
  if (!ids.length) return out;
  const base = await pool.query(
    `SELECT t.id, COALESCE(t.transcript_language, t.language) AS lang,
            (SELECT count(*) FROM transcript_segments s WHERE s.talk_id = t.id AND s.lang = 'fr')::int AS fr,
            (tr.talk_id IS NOT NULL) AS track,
            (SELECT count(*) FROM dub_requests r WHERE r.talk_id = t.id AND r.notified_at IS NULL)::int AS requests,
            (SELECT json_build_object('kind', j.kind, 'status', j.status, 'progress', j.progress) FROM dub_jobs j
              WHERE j.talk_id = t.id AND j.status IN ('queued', 'running') ORDER BY j.created_at LIMIT 1) AS job,
            (SELECT j.result->'segments' FROM dub_jobs j WHERE j.talk_id = t.id AND j.status = 'done' ORDER BY j.finished_at DESC LIMIT 1) AS report,
            rv.text_hash AS reviewed_hash
       FROM talks t LEFT JOIN dub_tracks tr ON tr.talk_id = t.id LEFT JOIN dub_reviews rv ON rv.talk_id = t.id
      WHERE t.id = ANY($1::uuid[])`, [ids]);
  const hashes = new Map((await pool.query(
    `SELECT s.talk_id AS id, ${TEXT_HASH} AS h FROM ${SEGS_FROM} WHERE s.lang = 'fr' AND s.talk_id = ANY($1::uuid[]) GROUP BY s.talk_id`, [ids])).rows.map((r) => [r.id, r.h]));
  const flags = await pool.query(
    `SELECT s.talk_id AS id, s.idx, ${KEPT} AS keep, COALESCE(f.accepted, false) AS accepted FROM ${SEGS_FROM}
      WHERE s.lang = 'fr' AND s.talk_id = ANY($1::uuid[]) AND (f.talk_id IS NOT NULL OR left(ltrim(s.text), 1) = '#')`, [ids]);
  const flagOf = new Map(flags.rows.map((r) => [`${r.id}:${r.idx}`, r]));
  for (const r of base.rows) {
    const french = String(r.lang || '').startsWith('fr');
    const review = !r.reviewed_hash ? 'todo' : r.reviewed_hash === hashes.get(r.id) ? 'validated' : 'stale';
    const toReview = (r.report || []).filter((x) => x.state === 'review' && !flagOf.get(`${r.id}:${x.idx}`)?.accepted && !flagOf.get(`${r.id}:${x.idx}`)?.keep).length;
    out.set(r.id, { french, hasFrench: r.fr > 0, review, track: r.track, job: r.job, requests: r.requests, toReview });
  }
  return out;
}

export async function production(out, { ids }) {
  const st = await talkStates(ids);
  for (const [id, v] of st) if (out[id]) out[id].dub = v;
}

// Tableau de bord : part d'écoute en version française (période et dernière conférence) et choses à faire.
export async function overview(out, { organizerId, days, talkId }) {
  const share = (rows) => {
    const fr = Number(rows.find((x) => x.lang === 'fr')?.s || 0); const orig = Number(rows.find((x) => x.lang === 'orig')?.s || 0);
    return fr + orig > 0 ? Math.round((100 * fr) / (fr + orig)) : null;
  };
  const per = (await pool.query(
    `SELECT l.audio_lang AS lang, sum(l.seconds)::bigint AS s FROM dub_listen l JOIN talks t ON t.id = l.talk_id
      WHERE t.organizer_id = $1 AND l.day > (now() AT TIME ZONE 'utc')::date - $2::int GROUP BY l.audio_lang`, [organizerId, days])).rows;
  const last = talkId ? (await pool.query('SELECT audio_lang AS lang, sum(seconds)::bigint AS s FROM dub_listen WHERE talk_id = $1 GROUP BY audio_lang', [talkId])).rows : [];
  // À faire : seulement les conférences où le doublage a commencé (demande, écoute, membres qui l'attendent).
  const ids = (await pool.query(
    `SELECT DISTINCT t.id FROM talks t
      WHERE t.organizer_id = $1 AND (EXISTS (SELECT 1 FROM dub_jobs j WHERE j.talk_id = t.id) OR EXISTS (SELECT 1 FROM dub_requests r WHERE r.talk_id = t.id AND r.notified_at IS NULL))`,
    [organizerId])).rows.map((r) => r.id);
  const st = await talkStates(ids);
  let reviews = 0; let segments = 0; let requests = 0; let firstReview = null; let firstSegments = null;
  for (const [id, v] of st) {
    if (v.french || !v.hasFrench) continue;
    if (v.review !== 'validated' && !v.track) { reviews += 1; firstReview ||= id; }
    if (v.toReview) { segments += v.toReview; firstSegments ||= id; }
    requests += v.requests;
  }
  out.dubbing = { frPct: share(per), lastFrPct: talkId ? share(last) : null, todo: { reviews, segments, requests, firstReview, firstSegments } };
}

// Étape E1 (module « Éditeur de montage ») : la piste « Voix française » de l'éditeur suit les phrases du doublage.
// Chaque phrase garde ses temps dans la vidéo d'origine ; l'éditeur les place selon le montage (pistes liées).
export async function editorMedia(out, { talkId }) {
  const segs = (await pool.query(
    `SELECT s.start_ms / 1000.0 AS s, s.end_ms / 1000.0 AS e, ${KEPT} AS keep FROM ${SEGS_FROM}
      WHERE s.talk_id = $1 AND s.lang = 'fr' ORDER BY s.idx LIMIT 6000`, [talkId])).rows;
  const track = (await pool.query('SELECT 1 FROM dub_tracks WHERE talk_id = $1', [talkId])).rowCount > 0;
  if (!segs.length && !track) return;
  out.dub = { track, segments: segs.map((x) => ({ s: Number(x.s), e: Number(x.e), keep: Boolean(x.keep) })), link: `/studio/dubbing/${talkId}` };
}
