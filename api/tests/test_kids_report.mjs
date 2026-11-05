// 26.3 : rapport hebdomadaire envoyé aux parents. Prérequis : PG de test (env de l'API chargé).
import { pool } from '../src/db.js';
import { runWeekly, childLine, learnedLine, childBlock } from '../src/kidsReportMailer.js';
const ok = (c, m) => { console.log((c ? 'OK   ' : 'FAIL ') + m); if (!c) process.exit(1); };
const tag = Math.random().toString(36).slice(2, 7);
const mkParent = async (name, { sub = true, report = true } = {}) => {
  const { rows } = await pool.query("insert into users(email,password_hash,name,role,locale,kids_report_email) values ($1,'x',$2,'user','fr',$3) returning id", [`kr-${name}-${tag}@test.local`, 'Parent ' + name, report]);
  const id = rows[0].id;
  if (sub) await pool.query("insert into subscriptions(id,user_id,status,price_id,billing_interval,current_period_end,event_created,tier) values ($1,$2,'active','p','month',now()+interval '20 days',1,'standard')", ['sub_kr' + name + tag, id]);
  const k = (await pool.query("insert into kid_profiles(user_id,name,band) values ($1,$2,'3-6') returning id", [id, 'Enfant' + name])).rows[0].id;
  return { id, k, email: `kr-${name}-${tag}@test.local` };
};
const active = await mkParent('a'); const idle = await mkParent('b'); const off = await mkParent('c', { report: false }); const nosub = await mkParent('d', { sub: false });
for (const p of [active, off, nosub]) await pool.query("insert into kid_usage(profile_id,day,seconds) values ($1,(now() at time zone 'Europe/Paris')::date,900)", [p.k]);
const mails = async (p) => (await pool.query("select vars from email_outbox where to_email=$1 and kind='kids_report'", [p.email])).rows;

await runWeekly(null, { force: true });
const m = await mails(active);
ok(m.length === 1 && m[0].vars.summary.includes('Enfanta — 15 min'), 'parent avec enfant actif : un e-mail, une ligne par enfant');
ok(m[0].vars.days === 7 && m[0].vars.path === '/kids', "période de 7 jours, lien vers l'espace Kids");
ok((await mails(idle)).length === 0, 'aucune activité : pas d\'e-mail (inutile de déranger)');
ok((await mails(off)).length === 0, 'rapport désactivé par le parent : pas d\'e-mail');
ok((await mails(nosub)).length === 0, "plus d'abonnement : pas d'e-mail");
await runWeekly(null, { force: true });
ok((await mails(active)).length === 1, 'relance le même jour : jamais deux e-mails');
const last = (await pool.query('select kids_report_last::text d from users where id=$1', [active.id])).rows[0].d;
ok(!!last, 'date du dernier envoi enregistrée');
await pool.query("update users set kids_report_last = kids_report_last - 7 where id=$1", [active.id]);
// Le lendemain d'une semaine plus tard : le dédoublonnage par clé est lié au jour, donc un nouvel e-mail part bien
await pool.query("delete from email_outbox where to_email=$1 and kind='kids_report'", [active.email]);
await runWeekly(null, { force: true });
ok((await mails(active)).length === 1, 'semaine suivante : un nouvel e-mail');

// Rédaction des lignes
const base = { name: 'Yacine', active: true, minutes: 42, watched: 3, quizzes: 2, avgPercent: 80, starsGained: 5, stars: 12, badges: ['a', 'b'] };
ok(childLine(base, 'fr') === 'Yacine — 42 min · 3 vidéos terminées · 2 quiz (moyenne 80 %) · +5 étoiles (total 12) · 2 badges', 'ligne française');
ok(childLine({ ...base, watched: 1, badges: [] }, 'en') === 'Yacine — 42 min · 1 video finished · 2 quizzes (average 80%) · +5 stars (total 12)', 'ligne anglaise');
ok(childLine({ ...base, active: false }, 'fr') === 'Yacine — pas d\'activité', 'enfant inactif');
ok(childLine(base, 'ar').includes('42 دقيقة'), 'ligne arabe');
// 8.1 : ce qui a été appris
const withL = { ...base, learned: ['La patience', 'Le bon voisin'] };
ok(learnedLine(withL, 'fr') === '↳ Appris cette semaine : « La patience », « Le bon voisin »', 'appris : ligne française');
ok(learnedLine(withL, 'en').startsWith('↳ Learned this week: « La patience »'), 'appris : ligne anglaise');
ok(learnedLine(withL, 'ar').includes('تعلّم هذا الأسبوع'), 'appris : ligne arabe');
ok(learnedLine(base, 'fr') === '' && learnedLine({ ...base, learned: [] }, 'fr') === '', 'rien appris : pas de ligne');
ok(learnedLine({ ...base, learned: ['x'.repeat(200)] }, 'fr').length < 110, 'titre trop long raccourci');
ok(learnedLine({ ...base, learned: ['a', 'b', 'c', 'd', 'e'] }, 'fr').split('«').length === 5, 'quatre titres au plus');
ok(childBlock(withL, 'fr').split('\n').length === 2 && childBlock({ ...withL, active: false }, 'fr') === 'Yacine — pas d\'activité', 'bloc : 2 lignes ; enfant inactif : 1 ligne');
// De vraies données : vidéo terminée + quiz réussi + quiz raté
const org = (await pool.query("select id from users where email='admin@test.local'")).rows[0].id;
const mkTalk = async (title) => (await pool.query("insert into talks(title,description,speaker,source,video_ref,organizer_id,publication,video_status,access,duration_seconds,kids_band) values ($1,'d','C','youtube','abc',$2,'published','ready','free',300,'3-6') returning id", [title, org])).rows[0].id;
const t1 = await mkTalk('Vidéo terminée ' + tag), t2 = await mkTalk('Quiz réussi ' + tag), t3 = await mkTalk('Quiz raté ' + tag);
const L = await mkParent('e');
await pool.query("insert into kid_usage(profile_id,day,seconds) values ($1,(now() at time zone 'Europe/Paris')::date,600)", [L.k]);
await pool.query("insert into kid_progress(profile_id,talk_id,completed) values ($1,$2,true)", [L.k, t1]);
await pool.query("insert into kid_quiz_attempts(profile_id,talk_id,score,total,percent,stars) values ($1,$2,4,5,80,2), ($1,$3,1,5,20,1)", [L.k, t2, t3]);
await pool.query("delete from email_outbox where to_email=$1", [L.email]);
await runWeekly(null, { force: true });
const me = await mails(L);
ok(me.length === 1 && me[0].vars.summary.includes('Vidéo terminée ' + tag) && me[0].vars.summary.includes('Quiz réussi ' + tag), "e-mail réel : vidéo terminée et quiz réussi dans « appris »");
ok(!me[0].vars.summary.includes('Quiz raté ' + tag) && me[0].vars.retry.includes('Quiz raté ' + tag), 'quiz raté : pas dans « appris », mais dans « à reprendre en douceur »');
for (const t of [t1, t2, t3]) await pool.query('delete from talks where id=$1', [t]);
await pool.query('delete from users where id=$1', [L.id]);
await pool.end();
