// 30.3 : rappel hebdomadaire du bilan. Depuis api/ : set -a; . /var/tmp/api-test.env; set +a; node tests/test_selfcheck_mail.mjs
// (base de test ; SMTP factice : les e-mails restent dans la file email_outbox, rien ne part.)
process.env.SMTP_HOST = 'smtp.invalid'; process.env.MAIL_FROM = 'Test <no-reply@test.local>';
process.env.PRACTICE_KEY = 'cle-pratique-de-test-0123456789abcdef';
const { pool } = await import('../src/db.js');
const { runWeekly } = await import('../src/selfcheckMailer.js');
const { sealText } = await import('../src/practiceCrypto.js');
const { invalidateSettings } = await import('../src/settings.js');
const { renderEmail } = await import('../src/emails.js');
let bad = 0;
const ok = (c, m) => { console.log((c ? 'OK   ' : 'FAIL ') + m); if (!c) bad++; };
const tag = Math.random().toString(36).slice(2, 8);
const dow = (await pool.query("SELECT extract(isodow FROM now() AT TIME ZONE 'Europe/Paris')::int AS d, to_char(date_trunc('week', now() AT TIME ZONE 'Europe/Paris')::date,'YYYY-MM-DD') AS wk")).rows[0];
const other = dow.d === 3 ? 4 : 3; // un jour qui n'est pas aujourd'hui
const mk = async (name, { weekday = dow.d, email = true, consent = true } = {}) => (await pool.query(
  "INSERT INTO users(email, name, password_hash, role, locale, practice_weekday, practice_email, practice_consent_at) VALUES ($1,$2,'x','user','fr',$3,$4,$5) RETURNING id",
  [`sm-${name}-${tag}@test.local`, name, weekday, email, consent ? new Date() : null])).rows[0].id;
const sub = (u) => pool.query("INSERT INTO subscriptions(id,user_id,status,price_id,billing_interval,current_period_end,event_created,tier) VALUES ($1,$2,'active','p','month',now()+interval '20 days',1,'learning')", ['sub_' + Math.random().toString(36).slice(2, 10), u]);
const goal = (u, title = 'Mon défaut très privé') => pool.query("INSERT INTO self_goals(user_id,nature,title_enc) VALUES ($1,'defect',$2) RETURNING id", [u, sealText(title)]).then((r) => r.rows[0].id);
const commit = (u) => pool.query("INSERT INTO practice_commitments(user_id,text_enc,status) VALUES ($1,$2,'doing')", [u, sealText('Mon engagement très privé')]);

const a = await mk('actif'), b = await mk('desinscrit', { email: false }), c = await mk('autrejour', { weekday: other }), d = await mk('standard'),
  e = await mk('rien'), f = await mk('sansaccord', { consent: false }), g = await mk('dejafait'), h = await mk('engagementseul');
for (const u of [a, b, c, e, f, g, h]) await sub(u);
await goal(a); await commit(a); await goal(b); await goal(c); await goal(d); await goal(f);
const gg = await goal(g); await pool.query("INSERT INTO self_checkins(goal_id, week, status) VALUES ($1,$2::date,'progress')", [gg, dow.wk]);
await commit(h);
await pool.query("INSERT INTO app_settings(key,value,is_secret) VALUES ('practice_email_hour','0',false) ON CONFLICT (key) DO UPDATE SET value='0'");
await pool.query("INSERT INTO app_settings(key,value,is_secret) VALUES ('practice_email_enabled','true',false) ON CONFLICT (key) DO UPDATE SET value='true'");
invalidateSettings();
const mails = (u) => pool.query("SELECT kind, vars, dedupe_key FROM email_outbox WHERE user_id=$1 AND kind='selfcheck_weekly'", [u]).then((r) => r.rows);
await runWeekly(console);
const ma = await mails(a);
ok(ma.length === 1 && ma[0].vars.commitments === '1' && ma[0].vars.goals === '1' && ma[0].vars.path === '/learning#bilan', 'membre actif (1 engagement, 1 objectif sans bilan) : 1 e-mail avec des chiffres et le lien');
ok(!JSON.stringify(ma[0].vars).includes('privé') && !JSON.stringify(ma[0]).includes('défaut'), "l'e-mail ne contient jamais le texte des objectifs ni des engagements");
ok(ma[0].dedupe_key === `selfcheck:${a}:${dow.wk}`, 'clé anti-doublon par membre et par semaine');
ok((await mails(b)).length === 0, 'rappel désactivé : rien envoyé');
ok((await mails(c)).length === 0, "autre jour de la semaine que celui choisi : rien envoyé");
ok((await mails(d)).length === 0, 'abonné standard : rien envoyé');
ok((await mails(e)).length === 0, "rien à dire (ni objectif ni engagement) : pas d'e-mail");
ok((await mails(f)).length === 0, "sans accord au traitement : pas d'e-mail");
ok((await mails(g)).length === 0, 'bilan déjà fait pour tous les objectifs et aucun engagement : pas d\'e-mail');
const mh = await mails(h);
ok(mh.length === 1 && mh[0].vars.goals === '' && mh[0].vars.commitments === '1', "engagements seuls : e-mail sans ligne « objectifs »");
const week = (await pool.query('SELECT to_char(practice_last_week,\'YYYY-MM-DD\') w FROM users WHERE id=$1', [e])).rows[0].w;
ok(week === dow.wk, "même sans rien à dire, la semaine est marquée traitée (pas de recalcul avant lundi)");
await runWeekly(console);
ok((await mails(a)).length === 1 && (await mails(h)).length === 1, 'deuxième passage la même semaine : aucun doublon (même après redémarrage)');
// semaine suivante simulée
await pool.query('UPDATE users SET practice_last_week = practice_last_week - 7 WHERE id = $1', [a]);
await pool.query("DELETE FROM email_outbox WHERE user_id=$1", [a]);
await runWeekly(console);
ok((await mails(a)).length === 1, 'la semaine suivante : un nouvel e-mail');
// heure : avant l'heure réglée, rien ne part
const hnow = (await pool.query("SELECT extract(hour FROM now() AT TIME ZONE 'Europe/Paris')::int h")).rows[0].h;
await pool.query("UPDATE app_settings SET value=$1 WHERE key='practice_email_hour'", [String(Math.min(23, hnow + 1))]); invalidateSettings();
await pool.query('UPDATE users SET practice_last_week = NULL WHERE id = $1', [a]); await pool.query("DELETE FROM email_outbox WHERE user_id=$1", [a]);
await runWeekly(console);
ok(hnow >= 23 || (await mails(a)).length === 0, `avant l'heure réglée (${hnow + 1} h) : rien n'est mis en file${hnow >= 23 ? ' (non testable après 23 h)' : ''}`);
await pool.query('UPDATE users SET practice_last_week = NULL WHERE id = $1', [a]); await pool.query("DELETE FROM email_outbox WHERE user_id=$1", [a]);
// réglage coupé
await pool.query("UPDATE app_settings SET value='0' WHERE key='practice_email_hour'"); await pool.query("UPDATE app_settings SET value='false' WHERE key='practice_email_enabled'"); invalidateSettings();
await runWeekly(console);
ok((await mails(a)).length === 0, 'réglage du site coupé : rien n\'est mis en file');
await pool.query("UPDATE app_settings SET value='true' WHERE key='practice_email_enabled'"); invalidateSettings();
// modèles de l'e-mail : 3 langues, lignes facultatives
for (const loc of ['fr', 'en', 'ar']) {
  const m = renderEmail('selfcheck_weekly', loc, { name: 'Test', app: 'Mejliss TV', commitments: '2', goals: '', url: 'https://x/learning#bilan' });
  ok(m.subject.length > 3 && m.html.includes('2') && m.html.includes('https://x/learning#bilan'), `modèle ${loc} : objet, chiffre et lien`);
  ok(loc === 'ar' ? m.html.includes('dir="rtl"') : true, `modèle ${loc} : sens d'écriture`);
}
const m0 = renderEmail('selfcheck_weekly', 'fr', { name: 'T', app: 'A', commitments: '', goals: '3', url: 'u' });
ok(!m0.html.includes('Engagements en cours') && m0.html.includes('Objectifs dont le bilan'), 'ligne facultative retirée quand la valeur est vide');
for (const u of [a, b, c, d, e, f, g, h]) await pool.query('DELETE FROM users WHERE id=$1', [u]);
await pool.query("DELETE FROM app_settings WHERE key IN ('practice_email_hour','practice_email_enabled')"); // rend les réglages de test
await pool.end();
console.log(bad ? `${bad} échec(s)` : 'tout est bon'); process.exit(bad ? 1 : 0);
