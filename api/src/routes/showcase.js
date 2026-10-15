// Vitrine visiteur (étape E1) : une vraie conférence, tirée au hasard parmi les plus vues, avec une vraie question de son quiz.
// GET /showcase est public. Il ne renvoie jamais la bonne réponse : le visiteur répond via POST /talks/:id/quiz/submit
// (ouvert aux visiteurs, rien n'est enregistré sans compte).
import { pool } from '../db.js';
import { presignGet } from '../storage.js';
import { visibleSql } from '../visibility.js';
import { adultSql } from '../taxonomy.js';
import { getNumber } from '../settings.js';
import { quizInfo } from './quiz.js';

const TOP = 8;      // le tirage se fait parmi les 8 conférences les plus vues qui ont un quiz
const WINDOW = 90;  // « les plus vues » = les 90 derniers jours (lectures comptent triple)
const clip = (s, n) => { const x = String(s || '').replace(/\s+/g, ' ').trim(); return x.length > n ? `${x.slice(0, n - 1).trimEnd()}…` : x; };

export default async function showcaseRoutes(app) {
  app.get('/showcase', async (req) => {
    const lang = String(req.query?.lang || 'fr').split('-')[0].slice(0, 8);
    const min = await getNumber('quiz_min_questions');
    // Conférences prêtes, publiques, adultes, avec assez de questions validées ; classées par audience récente.
    const { rows } = await pool.query(
      `SELECT t.id, t.title, t.speaker, t.source, t.video_ref, t.access, t.level, t.duration_seconds AS "durationSeconds", t.poster_key, t.external_thumb, t.description,
              COALESCE(p.score, 0) AS score
         FROM talks t
         LEFT JOIN (SELECT talk_id, sum(plays * 3 + views)::int AS score FROM stat_talk_daily
                     WHERE audience = 'web' AND day >= current_date - $2::int GROUP BY talk_id) p ON p.talk_id = t.id
        WHERE t.video_status = 'ready' AND ${visibleSql('t')} AND ${adultSql('t')}
          AND (SELECT count(*) FROM quiz_questions q WHERE q.talk_id = t.id AND q.status = 'approved') >= $1
        ORDER BY COALESCE(p.score, 0) DESC, COALESCE(t.publish_at, t.created_at) DESC LIMIT 30`, [min, WINDOW]);
    // Le quiz doit aussi être proposé au public (réglage de la conférence, fonction Quiz allumée).
    const ok = [];
    for (const r of rows) { if (ok.length >= TOP) break; if ((await quizInfo(r.id)).available) ok.push(r); }
    if (!ok.length) return { available: false };
    const talk = ok[Math.floor(Math.random() * ok.length)];

    const qs = (await pool.query(
      `SELECT id, question, options, chapter_title FROM quiz_questions WHERE talk_id = $1 AND status = 'approved'
        ORDER BY evidence_ms NULLS LAST, created_at, id`, [talk.id])).rows;
    const q = qs[Math.floor(Math.random() * qs.length)];

    const ins = (await pool.query("SELECT lang, summary, chapters FROM talk_insights WHERE talk_id = $1 AND status = 'ready' ORDER BY lang", [talk.id])).rows;
    const row = ins.find((r) => r.lang === lang) || ins.find((r) => r.lang === 'fr') || ins[0] || null;
    const chapters = Array.isArray(row?.chapters) ? row.chapters : [];
    const out = {
      available: true,
      talk: {
        id: talk.id, title: talk.title, speaker: talk.speaker, source: talk.source, video_ref: talk.source === 'upload' ? undefined : talk.video_ref, access: talk.access, level: talk.level, durationSeconds: talk.durationSeconds,
        posterUrl: talk.poster_key ? await presignGet(talk.poster_key) : (talk.external_thumb || null),
        summary: clip(row?.summary || talk.description, 220),
      },
      // Les chapitres d'une conférence réservée aux abonnés restent cachés (comme l'aperçu gratuit) : on n'annonce que leur nombre.
      chapters: talk.access === 'free' ? chapters.slice(0, 4).map((c) => ({ ms: c.ms, title: c.title })) : [],
      chapterCount: chapters.length,
      quizCount: qs.length,
      question: { id: q.id, question: q.question, options: q.options },
    };
    return out;
  });
}
