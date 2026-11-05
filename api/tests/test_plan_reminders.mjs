// Planning, étape 3 : rappels (récapitulatif du matin, veille d'échéance, série à sauver). Depuis api/ avec l'environnement de test :
//   DATABASE_URL=… JWT_SECRET=… SETTINGS_KEY=… PRACTICE_KEY=… node tests/test_plan_reminders.mjs
// Base de test ; SMTP factice (les e-mails restent dans email_outbox) ; les notifications sont simulées.
process.env.SMTP_HOST = 'smtp.invalid'; process.env.MAIL_FROM = 'Test <no-reply@test.local>';
const { pool } = await import('../src/db.js');
const { runPlanReminders } = await import('../src/planReminders.js');
const { sealText } = await import('../src/practiceCrypto.js');
const { renderEmail } = await import('../src/emails.js');
const { pushText } = await import('../src/push.js');
const { addDays, parisToday } = await import('../src/learningStreak.js');
let bad = 0;
const ok = (c, m) => { console.log((c ? 'OK   ' : 'FAIL ') + m); if (!c) bad++; };
const tag = Math.random().toString(36).slice(2, 8);
const today = await parisToday();
// Paris est à UTC+1 en novembre ; on fabrique un instant dont l'heure de Paris est celle voulue, le jour étant celui d'aujourd'hui.
const at = (h) => new Date(`${today}T${String(h - 1).padStart(2, '0')}:30:00Z`);
const mk = async (name, locale = 'fr') => (await pool.query("INSERT INTO users(email, name, password_hash, role, locale) VALUES ($1,$2,'x','user',$3) RETURNING id", [`pr-${name}-${tag}@test.local`, name, locale])).rows[0].id;
const sub = (u) => pool.query("INSERT INTO subscriptions(id,user_id,status,price_id,billing_interval,current_period_end,event_created,tier) VALUES ($1,$2,'active','p','month',now()+interval '20 days',1,'learning')", ['sub_' + Math.random().toString(36).slice(2, 10), u]);
const prefs = (u, o = {}) => pool.query(
  `INSERT INTO learning_plan_prefs(user_id, push, email, morning, deadline, streak, morning_hour) VALUES ($1,$2,$3,$4,$5,$6,$7)`,
  [u, o.push ?? false, o.email ?? false, o.morning ?? true, o.deadline ?? true, o.streak ?? false, o.hour ?? 8]);
const item = (u, day, kind = 'custom', note = 'Relire mes notes') => pool.query("INSERT INTO learning_plan_items(user_id, day, kind, note) VALUES ($1,$2,$3,$4)", [u, day, kind, note]);
const mails = (u, kind) => pool.query('SELECT kind, vars, dedupe_key FROM email_outbox WHERE user_id=$1 AND kind=$2', [u, kind]).then((r) => r.rows);
const pushes = []; const send = async (uid, kind, vars) => { pushes.push({ uid, kind, vars }); return 1; };
const run = (h) => runPlanReminders(console, at(h), { send, pushOn: true, mailOn: true });
const mine = (u) => pushes.filter((p) => p.uid === u);

const a = await mk('both'), b = await mk('nochannel'), c = await mk('standard'), d = await mk('empty'), e = await mk('pushonly'), f = await mk('arabe', 'ar'), g = await mk('deadline'), h = await mk('streak');
for (const u of [a, b, d, e, f, g, h]) await sub(u);
await prefs(a, { push: true, email: true }); await prefs(b, {}); await prefs(c, { push: true, email: true }); await prefs(d, { push: true, email: true }); await prefs(e, { push: true }); await prefs(f, { email: true }); await prefs(g, { push: true, email: true, morning: false }); await prefs(h, { push: true, email: true, morning: false, deadline: false, streak: true });
for (const u of [a, b, c, e, f]) await item(u, today, 'custom', 'Texte perso très privé');
await item(a, today, 'cards'); await item(a, today, 'quran');
// échéance demain pour g
const dl = (await pool.query("INSERT INTO learning_deadlines(user_id, title, due_on, pace) VALUES ($1,'Examen secret',$2,'normal') RETURNING id", [g, addDays(today, 1)])).rows[0].id;
// série à sauver pour h : actif hier et avant-hier, pas aujourd'hui
for (const n of [1, 2]) await pool.query("INSERT INTO quiz_attempts(user_id, talk_id, score, total, percent, passed, created_at) SELECT $1, id, 1, 1, 100, true, now() - ($2 || ' days')::interval FROM talks LIMIT 1", [h, String(n)]).catch(() => {});

// avant l'heure : rien
await run(6);
ok(pushes.length === 0 && (await mails(a, 'plan_daily')).length === 0, "avant l'heure choisie (8 h) : rien n'est envoyé");
// matin
await run(8);
ok((await mails(a, 'plan_daily')).length === 1 && mine(a).some((p) => p.kind === 'plan_daily' && p.vars.count === 3), 'membre « notification + e-mail » : un e-mail et une notification, 3 choses à faire (note, cartes, Coran)');
const ma = (await mails(a, 'plan_daily'))[0];
ok(ma.vars.goal.includes('Objectif de la semaine') && ma.vars.items.includes('3 séance(s)'), "l'e-mail rappelle l'objectif de la semaine et les séances du jour");
ok(!JSON.stringify(ma).includes('très privé') && !JSON.stringify(pushes).includes('très privé'), 'jamais le texte personnel dans un e-mail ni une notification');
ok(ma.dedupe_key === `plan:daily:${a}:${today}`, 'clé anti-doublon par membre et par jour');
ok((await mails(b, 'plan_daily')).length === 0 && mine(b).length === 0, 'aucun canal choisi : rien envoyé');
ok((await mails(c, 'plan_daily')).length === 0 && mine(c).length === 0, 'abonné standard : rien envoyé');
ok((await mails(d, 'plan_daily')).length === 0 && mine(d).length === 0, "rien à faire ce jour-là : pas de rappel");
ok(mine(e).length === 1 && (await mails(e, 'plan_daily')).length === 0, 'notification seulement : pas d’e-mail');
ok((await mails(f, 'plan_daily')).length === 1 && mine(f).length === 0, 'e-mail seulement : pas de notification');
const before = pushes.length;
await run(9);
ok(pushes.length === before && (await mails(a, 'plan_daily')).length === 1, 'un seul récapitulatif par jour (relancer ne double pas)');
// veille d'échéance
const mg = await mails(g, 'plan_deadline');
ok(mg.length === 1 && mg[0].vars.title === 'Examen secret' && mine(g).some((p) => p.kind === 'plan_deadline'), "veille d'échéance : e-mail + notification");
ok(mg[0].dedupe_key === `plan:deadline:${dl}:${today}`, "clé anti-doublon par échéance et par jour");
ok((await mails(g, 'plan_daily')).length === 0, 'récapitulatif du matin désactivé : pas de récapitulatif');
// série à sauver (le soir)
const row = (await pool.query('SELECT 1 FROM quiz_attempts WHERE user_id=$1', [h])).rowCount;
await run(19);
if (row) ok((await mails(h, 'plan_streak')).length === 1 && mine(h).some((p) => p.kind === 'plan_streak'), 'série à sauver : e-mail + notification le soir');
else console.log('note : aucun quiz disponible dans la base pour fabriquer une série ; test « série » sauté');
await run(21);
ok((await mails(h, 'plan_streak')).length <= 1, 'pas de second rappel de série');
// modèles : les trois langues existent
for (const kind of ['plan_daily', 'plan_deadline', 'plan_streak']) for (const l of ['fr', 'en', 'ar']) {
  const m = renderEmail(kind, l, { name: 'X', count: 3, items: '• a', goal: 'g', title: 'T', done: 1, total: 4, left: 3, n: 5, url: 'https://x.test/l', webUrl: 'https://x.test' });
  ok(m.subject && m.html && m.text, `modèle ${kind} (${l})`);
}
for (const kind of ['plan_daily', 'plan_deadline', 'plan_streak']) for (const l of ['fr', 'en', 'ar']) ok(pushText(kind, l, { count: 2, title: 'T', left: 1, n: 4 }).title.length > 0, `notification ${kind} (${l})`);
await pool.query("DELETE FROM users WHERE email LIKE $1", [`pr-%-${tag}@test.local`]);
console.log(bad ? `\n${bad} échec(s)` : '\nTout est bon');
await pool.end(); process.exit(bad ? 1 : 0);
