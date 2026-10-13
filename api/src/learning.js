// Apprentissage (palier « Apprentissage ») : score, courbe, badges et progression par série, calculés à partir des tentatives de quiz.
// Rien n'est stocké : tout se recalcule à la demande, donc un membre qui passe à ce palier retrouve tout son historique.
import { pool } from './db.js';
import { visibleSql } from './visibility.js';
import { getSetting, getNumber, isOn } from './settings.js';

// Le score s'érode lentement : un quiz non revu perd 40 % de sa valeur au maximum, sur 120 jours (donc 1 point sur 3 jours environ).
// Refaire un quiz (ou, plus tard, une révision espacée) remet sa valeur à 100 %.
export const FLOOR = 0.6;
export const DECAY_DAYS = 120;
export const freshness = (days) => Math.max(FLOOR, 1 - ((1 - FLOOR) * Math.min(Math.max(days, 0), DECAY_DAYS)) / DECAY_DAYS);

export const BADGES = ['first_quiz', 'passed_5', 'passed_10', 'perfect', 'comeback', 'streak_3', 'explorer', 'series_done'];
const DAY = 86400000;

// Score à une date donnée : moyenne, sur les quiz tentés, du meilleur pourcentage pondéré par la fraîcheur.
export function scoreAt(attempts, asOf = new Date()) {
  const per = new Map();
  for (const a of attempts) {
    const at = new Date(a.created_at);
    if (at > asOf) continue;
    const cur = per.get(a.talk_id) || { best: 0, last: at };
    cur.best = Math.max(cur.best, a.percent);
    if (at > cur.last) cur.last = at;
    per.set(a.talk_id, cur);
  }
  if (!per.size) return { score: 0, quizzes: 0 };
  let sum = 0;
  for (const v of per.values()) sum += v.best * freshness((asOf - v.last) / DAY);
  return { score: Math.round(sum / per.size), quizzes: per.size };
}

// Courbe d'apprentissage : un point par semaine depuis la première tentative (52 points au plus), plus aujourd'hui.
export function curveOf(attempts, now = new Date()) {
  if (!attempts.length) return [];
  const first = new Date(attempts[0].created_at);
  const step = Math.max(7, Math.ceil((now - first) / DAY / 52)) * DAY;
  const out = [{ at: first.toISOString(), score: scoreAt(attempts, new Date(first.getTime() + 1000)).score }];
  for (let d = new Date(first.getTime() + step); d < now; d = new Date(d.getTime() + step)) out.push({ at: d.toISOString(), score: scoreAt(attempts, d).score });
  out.push({ at: now.toISOString(), score: scoreAt(attempts, now).score });
  return out;
}

async function quizAvailabilityParams() {
  return [isOn(await getSetting('quiz_default_enabled')), await getNumber('quiz_min_questions')];
}

export async function attemptsOf(userId) {
  const { rows } = await pool.query(
    `SELECT a.talk_id, a.percent, a.passed, a.created_at, t.title, t.category_id
       FROM quiz_attempts a JOIN talks t ON t.id = a.talk_id WHERE a.user_id = $1 ORDER BY a.created_at, a.id`, [userId]);
  return rows;
}

// Séries publiées où le membre a tenté au moins un quiz : quiz proposés au total, réussis, et date de la dernière réussite.
export async function seriesProgress(userId, attempts) {
  const [def, min] = await quizAvailabilityParams();
  const { rows } = await pool.query(
    `SELECT s.id, s.title, s.speaker, s.poster_key, e.talk_id
       FROM series s JOIN series_episodes e ON e.series_id = s.id JOIN talks t ON t.id = e.talk_id
      WHERE s.published AND t.video_status = 'ready' AND ${visibleSql('t')}
        AND COALESCE(t.quiz_enabled, $2::boolean)
        AND (SELECT count(*) FROM quiz_questions q WHERE q.talk_id = t.id AND q.status = 'approved') >= $3
        AND s.id IN (SELECT e2.series_id FROM series_episodes e2 JOIN quiz_attempts a ON a.talk_id = e2.talk_id WHERE a.user_id = $1)
      ORDER BY s.title, e.position`, [userId, def, min]);
  const firstPass = new Map();
  for (const a of attempts) if (a.passed && !firstPass.has(a.talk_id)) firstPass.set(a.talk_id, new Date(a.created_at));
  const best = new Map();
  for (const a of attempts) best.set(a.talk_id, Math.max(best.get(a.talk_id) || 0, a.percent));
  const by = new Map();
  for (const r of rows) {
    const s = by.get(r.id) || { id: r.id, title: r.title, speaker: r.speaker, poster_key: r.poster_key, total: 0, passed: 0, doneAt: null, percents: [] };
    s.total += 1;
    if (firstPass.has(r.talk_id)) {
      s.passed += 1;
      const at = firstPass.get(r.talk_id);
      if (!s.doneAt || at > s.doneAt) s.doneAt = at;
      s.percents.push(best.get(r.talk_id));
    }
    by.set(r.id, s);
  }
  return [...by.values()].map((s) => ({ ...s, complete: s.total > 0 && s.passed === s.total,
    average: s.percents.length ? Math.round(s.percents.reduce((x, y) => x + y, 0) / s.percents.length) : 0 }));
}

// Badges obtenus, avec la date d'obtention : { id: Date }.
export function badgesOf(attempts, series) {
  const got = {};
  const firstPass = new Map();
  for (const a of attempts) if (a.passed && !firstPass.has(a.talk_id)) firstPass.set(a.talk_id, a);
  const passes = [...firstPass.values()].sort((x, y) => new Date(x.created_at) - new Date(y.created_at));
  if (passes[0]) got.first_quiz = new Date(passes[0].created_at);
  if (passes[4]) got.passed_5 = new Date(passes[4].created_at);
  if (passes[9]) got.passed_10 = new Date(passes[9].created_at);
  const perfect = attempts.find((a) => a.percent === 100);
  if (perfect) got.perfect = new Date(perfect.created_at);
  // Persévérant : réussi un quiz après l'avoir raté.
  const failed = new Set();
  for (const a of attempts) {
    if (!a.passed) failed.add(a.talk_id);
    else if (failed.has(a.talk_id)) { got.comeback = new Date(a.created_at); break; }
  }
  // Régulier : au moins un quiz tenté trois jours de suite.
  const days = [...new Map(attempts.map((a) => [new Date(a.created_at).toISOString().slice(0, 10), new Date(a.created_at)])).entries()].sort();
  for (let i = 2; i < days.length; i++) {
    const d = (k) => Date.parse(days[k][0]);
    if (d(i) - d(i - 1) === DAY && d(i - 1) - d(i - 2) === DAY) { got.streak_3 = days[i][1]; break; }
  }
  // Explorateur : quiz réussis dans au moins trois catégories différentes.
  const cats = new Set();
  for (const a of passes) {
    if (a.category_id != null) cats.add(a.category_id);
    if (cats.size >= 3) { got.explorer = new Date(a.created_at); break; }
  }
  const done = series.filter((s) => s.complete && s.doneAt).sort((x, y) => x.doneAt - y.doneAt)[0];
  if (done) got.series_done = done.doneAt;
  return got;
}

// Résumé court pour la correction d'un quiz : score global et badges obtenus.
export async function learningBrief(userId) {
  const attempts = await attemptsOf(userId);
  const series = await seriesProgress(userId, attempts);
  return { score: scoreAt(attempts).score, badges: Object.keys(badgesOf(attempts, series)) };
}
