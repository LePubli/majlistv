// 24.5 : e-mail quotidien des révisions. Depuis api/ : set -a; . /tmp/claude-0/api.env; set +a; node tests/test_revision_mail.mjs
// (utilise la base de test ; SMTP factice : les e-mails restent dans la file email_outbox, rien ne part.)
process.env.SMTP_HOST = 'smtp.invalid'; process.env.MAIL_FROM = 'Test <no-reply@test.local>';
const { pool } = await import('../src/db.js');
const { runDaily } = await import('../src/revisionMailer.js');
let bad = 0;
const ok = (c, m) => { console.log((c ? 'OK   ' : 'FAIL ') + m); if (!c) bad++; };
const tag = Math.random().toString(36).slice(2, 8);
const mk = async (name, role = 'user') => (await pool.query("INSERT INTO users(email, name, password_hash, role, locale) VALUES ($1,$2,'x',$3,'fr') RETURNING id", [`rm-${name}-${tag}@test.local`, name, role])).rows[0].id;
const sub = (u) => pool.query("INSERT INTO subscriptions(id,user_id,status,price_id,billing_interval,current_period_end,event_created,tier) VALUES ($1,$2,'active','p','month',now()+interval '20 days',1,'learning')", ['sub_' + Math.random().toString(36).slice(2, 10), u]);
const admin = (await pool.query("SELECT id FROM users WHERE email='admin@test.local'")).rows[0].id;
const talk = async (title) => {
  const t = (await pool.query("INSERT INTO talks(title,description,speaker,source,video_ref,organizer_id,publication,video_status,access,duration_seconds) VALUES ($1,'d','S','youtube',$2,$3,'published','ready','free',600) RETURNING id", [title + ' ' + tag, 'v' + Math.random().toString(36).slice(2, 11), admin])).rows[0].id;
  await pool.query("INSERT INTO quiz_questions(talk_id,lang,question,options,correct_index,explanation,origin,status) VALUES ($1,'fr','Q ?','[\"a\",\"b\",\"c\"]',0,'e','manual','approved')", [t]);
  return t;
};
const due = (u, t) => pool.query("INSERT INTO revision_items(user_id,talk_id,stage,anchor_on,due_on) VALUES ($1,$2,0,current_date-1,current_date)", [u, t]);
const a = await mk('apprenant'), b = await mk('desinscrit'), c = await mk('rien'), d = await mk('standard');
await sub(a); await sub(b); await sub(c);
const t1 = await talk('Patience'), t2 = await talk('Gratitude');
await due(a, t1); await due(a, t2); await due(b, t1); await due(d, t1);
await pool.query("INSERT INTO quiz_attempts(user_id,talk_id,score,total,percent,passed,answers) VALUES ($1,$2,1,1,100,true,'[]')", [a, t1]);
await pool.query("INSERT INTO reminders(talk_id,lang,text,origin,attribution,status) VALUES ($1,'fr','La patience est lumière.','manual','Source test','approved')", [t1]);
await pool.query("INSERT INTO learning_prefs(user_id, daily_email) VALUES ($1,false)", [b]);
await pool.query("INSERT INTO app_settings(key,value,is_secret) VALUES ('revision_email_hour','0',false) ON CONFLICT (key) DO UPDATE SET value='0'");
await pool.query("INSERT INTO app_settings(key,value,is_secret) VALUES ('revision_email_enabled','true',false) ON CONFLICT (key) DO UPDATE SET value='true'");
const { invalidateSettings } = await import('../src/settings.js');
invalidateSettings();
const mails = (u) => pool.query("SELECT kind, vars, dedupe_key FROM email_outbox WHERE user_id=$1 AND kind='revision_daily'", [u]).then((r) => r.rows);
const before = await pool.query("SELECT count(*)::int n FROM email_outbox WHERE kind='revision_daily'");
await runDaily(console);
const ma = await mails(a);
ok(ma.length === 1 && ma[0].vars.count === 2, 'membre Apprentissage avec 2 révisions : 1 e-mail');
ok(ma[0].vars.titles.includes('Patience') && ma[0].vars.titles.includes('Gratitude'), 'titres des conférences à réviser');
// Le rappel du jour est tiré parmi TOUS les rappels validés (la base de test peut contenir le corpus de citations) :
// on vérifie qu'il s'agit bien d'un rappel validé, joint avec sa source.
const picked = ma[0].vars.reminder ? (await pool.query("SELECT text, attribution FROM reminders WHERE status='approved' AND text = $1 LIMIT 1", [ma[0].vars.reminder])).rows[0] : null;
ok(Boolean(picked) && (ma[0].vars.reminder !== 'La patience est lumière.' || ma[0].vars.source.includes('Source test')) && (!picked?.attribution || ma[0].vars.source.includes(picked.attribution)), 'rappel du jour joint (validé, avec sa source)');
ok(ma[0].vars.path === '/learning', 'lien vers Mon apprentissage');
ok((await mails(b)).length === 0, 'e-mail désactivé : rien envoyé');
ok((await mails(c)).length === 0, "rien à réviser : pas d'e-mail");
ok((await mails(d)).length === 0, 'abonné standard : pas d\'e-mail');
await runDaily(console);
ok((await mails(a)).length === 1, 'jamais deux e-mails le même jour');
const last = (await pool.query('SELECT last_emailed_on = current_date AS today FROM learning_prefs WHERE user_id=$1', [a])).rows[0];
ok(last && last.today, 'dernier envoi enregistré');
await pool.query("UPDATE learning_prefs SET last_emailed_on = current_date - 1 WHERE user_id=$1", [a]);
await pool.query("INSERT INTO app_settings(key,value,is_secret) VALUES ('revision_email_enabled','false',false) ON CONFLICT (key) DO UPDATE SET value='false'");
invalidateSettings();
await runDaily(console);
ok((await mails(a)).length === 1, 'réglage désactivé : aucun envoi');
await pool.query("DELETE FROM app_settings WHERE key IN ('revision_email_hour','revision_email_enabled')");
await pool.query("DELETE FROM users WHERE id = ANY($1::uuid[])", [[a, b, c, d]]);
await pool.query("DELETE FROM talks WHERE id = ANY($1::uuid[])", [[t1, t2]]);
await pool.end();
console.log(bad ? 'ÉCHEC' : 'TOUT OK');
process.exit(bad ? 1 : 0);
