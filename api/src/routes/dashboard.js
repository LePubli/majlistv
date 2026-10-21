// Tableau de bord du back-office (étape 11.1) : chiffres clés, « À traiter », santé des services, dernières inscriptions.
// Une seule requête GET /admin/dashboard ; réservé aux administrateurs.
import { pool } from '../db.js';
import { getSetting, isOn } from '../settings.js';
import { stripeContext } from './billing.js';
import { meiliConf, searchStatus } from '../search.js';
import { storage } from '../storage.js';
import { config } from '../config.js';
import { HeadBucketCommand } from '@aws-sdk/client-s3';

// Une tâche « en cours » depuis plus longtemps que ces seuils est considérée comme bloquée.
const STUCK = { video: '3 hours', transcript: '3 hours', translation: '2 hours', insights: '2 hours' };

// Montants des formules chez Stripe (cache 10 min) : sert uniquement à estimer le revenu mensuel.
let plans = { at: 0, sig: '', data: null };
async function planAmounts() {
  const ctx = await stripeContext();
  if (!ctx) return null;
  const sig = `${ctx.prices.month}|${ctx.prices.year}`;
  if (plans.data && plans.sig === sig && Date.now() - plans.at < 10 * 60 * 1000) return plans.data;
  try {
    const out = {};
    for (const [interval, id] of Object.entries(ctx.prices)) {
      const p = await ctx.stripe.prices.retrieve(id);
      out[interval] = { amount: p.unit_amount, currency: p.currency };
    }
    plans = { at: Date.now(), sig, data: out };
    return out;
  } catch {
    return null;
  }
}

async function storageCheck() {
  if (!storage) return { state: 'off', message: 'Stockage non configuré' };
  try {
    await storage.send(new HeadBucketCommand({ Bucket: config.s3.bucket }), { abortSignal: AbortSignal.timeout(4000) });
    return { state: 'ok', message: 'Stockage vidéo joignable' };
  } catch (err) {
    return { state: 'error', message: `Stockage injoignable : ${err.name || err.message}` };
  }
}

export default async function dashboardRoutes(app) {
  const adminOnly = { preHandler: app.requireRole('admin') };
  const rows = async (sql, params = []) => (await pool.query(sql, params)).rows;
  const one = async (sql, params = []) => (await pool.query(sql, params)).rows[0];

  app.get('/admin/dashboard', adminOnly, async () => {
    const [users, subs, talks, queues, signups, failedTalks, emails, billing, insightsOn] = await Promise.all([
      one(`SELECT count(*)::int AS total,
                  count(*) FILTER (WHERE created_at > now() - interval '7 days')::int AS week,
                  count(*) FILTER (WHERE created_at > now() - interval '30 days')::int AS month,
                  count(*) FILTER (WHERE disabled_at IS NOT NULL)::int AS suspended,
                  count(*) FILTER (WHERE premium_until > now())::int AS complimentary,
                  count(*) FILTER (WHERE role = 'organizer')::int AS organizers
             FROM users`),
      rows(`SELECT status, billing_interval AS interval, cancel_at_period_end AS cancelling, count(*)::int AS n
              FROM subscriptions GROUP BY 1, 2, 3`),
      one(`SELECT count(*)::int AS total,
                  count(*) FILTER (WHERE video_status = 'ready' AND publication = 'published' AND review_status IN ('none', 'approved'))::int AS live,
                  count(*) FILTER (WHERE video_status IN ('pending', 'processing', 'importing'))::int AS processing,
                  count(*) FILTER (WHERE video_status = 'failed')::int AS failed,
                  count(*) FILTER (WHERE publication = 'draft')::int AS draft,
                  count(*) FILTER (WHERE publication = 'scheduled')::int AS scheduled,
                  count(*) FILTER (WHERE source = 'upload')::int AS uploads,
                  count(*) FILTER (WHERE source <> 'upload')::int AS external
             FROM talks`),
      one(`SELECT
        (SELECT count(*)::int FROM talks t WHERE t.video_status IN ('pending','processing') AND coalesce((SELECT max(at) FROM talk_events e WHERE e.talk_id = t.id), t.created_at) < now() - interval '${STUCK.video}') AS stuck_video,
        (SELECT count(*)::int FROM talks t WHERE t.transcript_status IN ('pending','processing') AND t.video_status = 'ready' AND coalesce((SELECT max(at) FROM talk_events e WHERE e.talk_id = t.id), t.created_at) < now() - interval '${STUCK.transcript}') AS stuck_transcript,
        (SELECT count(*)::int FROM talks WHERE transcript_status = 'failed') AS failed_transcript,
        (SELECT count(*)::int FROM transcript_translations WHERE status = 'failed') AS failed_translation,
        (SELECT count(*)::int FROM transcript_translations WHERE status IN ('pending','processing') AND created_at < now() - interval '${STUCK.translation}') AS stuck_translation,
        (SELECT count(*)::int FROM talk_insights WHERE status = 'failed') AS failed_insights,
        (SELECT count(*)::int FROM talk_insights WHERE status IN ('pending','processing') AND updated_at < now() - interval '${STUCK.insights}') AS stuck_insights,
        (SELECT count(*)::int FROM transcript_translations WHERE status IN ('pending','processing')) AS q_translation,
        (SELECT count(*)::int FROM talk_insights WHERE status IN ('pending','processing')) AS q_insights,
        (SELECT count(*)::int FROM talks WHERE transcript_status IN ('pending','processing') AND video_status = 'ready') AS q_transcript`),
      rows(`SELECT u.id, u.email, u.name, u.role, u.created_at AS "createdAt", u.disabled_at AS "disabledAt",
                   (SELECT s.status FROM subscriptions s WHERE s.user_id = u.id ORDER BY (s.status IN ('trialing','active','past_due')) DESC, s.updated_at DESC LIMIT 1) AS "subscription"
              FROM users u ORDER BY u.created_at DESC LIMIT 8`),
      rows(`SELECT t.id, t.title, t.video_status AS "videoStatus", t.transcript_status AS "transcriptStatus", t.created_at AS "createdAt"
              FROM talks t WHERE t.video_status = 'failed' OR t.transcript_status = 'failed'
              ORDER BY t.created_at DESC LIMIT 6`),
      rows(`SELECT status, count(*)::int AS n FROM email_outbox WHERE created_at > now() - interval '30 days' GROUP BY status`),
      planAmounts(),
      getSetting('insights_enabled'),
    ]);

    // --- Abonnés et revenu estimé ---
    const count = (pred) => subs.filter(pred).reduce((a, s) => a + s.n, 0);
    const paying = count((s) => ['active', 'past_due'].includes(s.status));
    const trialing = count((s) => s.status === 'trialing');
    const pastDue = count((s) => s.status === 'past_due');
    const cancelling = count((s) => ['active', 'trialing'].includes(s.status) && s.cancelling);
    let mrr = null;
    if (billing) {
      const monthly = (i) => (billing[i]?.amount ?? 0);
      const cents = subs.filter((s) => ['active', 'past_due'].includes(s.status))
        .reduce((a, s) => a + s.n * (s.interval === 'year' ? monthly('year') / 12 : monthly('month')), 0);
      mrr = { amount: Math.round(cents), currency: billing.month?.currency || billing.year?.currency || 'eur' };
    }

    // --- À traiter ---
    const todo = [];
    const add = (key, n, label, link, severity = 'warn') => { if (n > 0) todo.push({ key, count: n, label, link, severity }); };
    add('video_failed', talks.failed, 'conversion(s) vidéo en échec', '/studio?filter=err', 'error');
    add('transcript_failed', queues.failed_transcript, 'transcription(s) en échec', '/studio?filter=err', 'error');
    add('translation_failed', queues.failed_translation, 'traduction(s) de sous-titres en échec', '/studio?filter=err', 'error');
    add('insights_failed', queues.failed_insights, 'résumé(s) / chapitres en échec', '/studio?filter=err', 'error');
    add('stuck_video', queues.stuck_video, `conversion(s) vidéo bloquée(s) depuis plus de 3 h (le worker tourne-t-il ?)`, '/studio/activity');
    add('stuck_transcript', queues.stuck_transcript, 'transcription(s) bloquée(s) (le service de transcription tourne-t-il ?)', '/studio/activity');
    add('stuck_translation', queues.stuck_translation, 'traduction(s) bloquée(s) (le service de traduction tourne-t-il ?)', '/studio/activity');
    add('stuck_insights', queues.stuck_insights, 'résumé(s) bloqué(s) (le service de traduction tourne-t-il ?)', '/studio/activity');
    add('past_due', pastDue, 'abonné(s) avec un paiement en retard', '/admin?tab=users');
    const mail = Object.fromEntries(emails.map((r) => [r.status, r.n]));
    add('email_failed', mail.failed || 0, 'e-mail(s) en échec sur 30 jours (Paramètres → E-mails)', '/admin?tab=settings', 'error');
    const search = { enabled: Boolean(await meiliConf()), ...searchStatus() };
    if (search.enabled && search.lastError) add('search_error', 1, `Recherche : ${search.lastError}`, '/admin?tab=settings', 'error');

    // --- Santé des services : déduite des files d'attente et de tests rapides (le worker, etc. n'exposent pas d'adresse à l'API) ---
    const health = [];
    let dbOk = true;
    try { await pool.query('SELECT 1'); } catch { dbOk = false; }
    health.push({ key: 'db', label: 'Base de données', state: dbOk ? 'ok' : 'error', message: dbOk ? 'Connectée' : 'Injoignable' });
    const st = await storageCheck();
    health.push({ key: 'storage', label: 'Stockage vidéo', ...st });
    const queue = (key, label, pending, stuck, idle) => health.push({
      key, label,
      state: stuck > 0 ? 'error' : 'ok',
      message: stuck > 0 ? `${stuck} tâche(s) bloquée(s)` : pending > 0 ? `${pending} en file d'attente` : idle,
    });
    queue('worker', 'Conversion vidéo (worker)', talks.processing, queues.stuck_video, 'Au repos');
    queue('transcriber', 'Transcription', queues.q_transcript, queues.stuck_transcript, 'Au repos');
    queue('translator', 'Traduction des sous-titres', queues.q_translation, queues.stuck_translation, 'Au repos');
    health.push({
      key: 'insights', label: 'Résumés et chapitres', state: isOn(insightsOn) ? (queues.stuck_insights > 0 ? 'error' : 'ok') : 'off',
      message: !isOn(insightsOn) ? 'Désactivés (Paramètres)' : queues.stuck_insights > 0 ? `${queues.stuck_insights} tâche(s) bloquée(s)` : queues.q_insights > 0 ? `${queues.q_insights} en file d'attente` : 'Au repos',
    });
    health.push({
      key: 'search', label: 'Recherche', state: !search.enabled ? 'off' : search.lastError ? 'error' : 'ok',
      message: !search.enabled ? 'Recherche simple (Meilisearch non configuré)' : search.lastError || 'Index à jour',
    });
    health.push({ key: 'stripe', label: 'Paiement (Stripe)', state: billing ? 'ok' : 'off', message: billing ? 'Formules lues chez Stripe' : 'Non configuré ou injoignable' });
    const smtp = Boolean(await getSetting('smtp_host'));
    health.push({ key: 'smtp', label: 'E-mails (SMTP)', state: !smtp ? 'off' : (mail.failed || 0) > 0 ? 'warn' : 'ok', message: !smtp ? 'Non configuré' : (mail.failed || 0) > 0 ? `${mail.failed} échec(s) sur 30 jours` : `${mail.sent || 0} envoyé(s) sur 30 jours` });

    return {
      users, talks,
      subscribers: { paying, trialing, pastDue, cancelling, mrr },
      todo, failedTalks, health, signups,
    };
  });
}
