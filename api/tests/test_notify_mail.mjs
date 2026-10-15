// 21 : boucles d'e-mails (intervenants suivis, sélection de la semaine). Depuis api/ :
//   set -a; . /var/tmp/api-test.env; set +a; node tests/test_notify_mail.mjs
// (utilise la base de test ; les e-mails restent dans la file email_outbox.)
const { pool } = await import('../src/db.js');
const { runSpeakers, runWeekly, weeklySelection } = await import('../src/notifyMailer.js');
const { invalidateSettings } = await import('../src/settings.js');
const { compose } = await import('../src/mailer.js');
const { speakerSlug } = await import('../src/speakers.js');
let bad = 0;
const ok = (c, m) => { console.log((c ? 'OK   ' : 'FAIL ') + m); if (!c) bad++; };
const tag = Math.random().toString(36).slice(2, 8);
const set = async (k, v) => { await pool.query("INSERT INTO app_settings(key,value,is_secret) VALUES ($1,$2,false) ON CONFLICT (key) DO UPDATE SET value=$2", [k, v]); invalidateSettings(); };
// L'envoi doit sembler configuré (réglage lu par les boucles) ; les valeurs d'origine sont rétablies à la fin.
const saved = {};
for (const k of ['smtp_host', 'mail_from']) saved[k] = (await pool.query('SELECT value FROM app_settings WHERE key=$1', [k])).rows[0]?.value ?? null;
if (!saved.smtp_host) await set('smtp_host', 'smtp.invalid');
if (!saved.mail_from) await set('mail_from', 'Test <no-reply@test.local>');
await set('notify_speakers_enabled', 'true'); await set('weekly_enabled', 'false');
const mk = async (n, o = {}) => (await pool.query("INSERT INTO users(email,name,password_hash,locale,notify_speakers,notify_weekly) VALUES ($1,$2,'x',$3,$4,$5) RETURNING id",
  [`nm-${n}-${tag}@test.local`, n, o.locale || 'fr', o.speakers ?? true, o.weekly ?? false])).rows[0].id;
const admin = (await pool.query("SELECT id FROM users WHERE email='admin@test.local'")).rows[0].id;
const S1 = `Cheikh Alpha ${tag}`, S2 = `Cheikh Beta ${tag}`;
const talk = async (title, speaker, o = {}) => (await pool.query(
  "INSERT INTO talks(title,description,speaker,source,video_ref,organizer_id,publication,video_status,access,duration_seconds,show_adults,announced_at,publish_at) VALUES ($1,'d',$2,'youtube',$3,$4,$5,'ready','free',600,$6,$7,$8) RETURNING id, slug",
  [`${title} ${tag}`, speaker, 'v' + Math.random().toString(36).slice(2, 11), admin, o.pub || 'published', o.adults ?? true, o.announced ? new Date() : null, o.pub === 'scheduled' ? new Date(Date.now() + 3600e3) : null])).rows[0];
const follow = (u, s, name) => pool.query("INSERT INTO speaker_follows(user_id,speaker_slug,speaker_name) VALUES ($1,$2,$3)", [u, speakerSlug(s), name]);
const a = await mk('abonne'), b = await mk('muet', { speakers: false }), c = await mk('autre'), d = await mk('sans'), en = await mk('english', { locale: 'en' });
await follow(a, S1, S1); await follow(b, S1, S1); await follow(c, S2, S2); await follow(en, S1, S1);
// Les conférences déjà annoncées ou en attente d'autres tests ne doivent pas nous gêner : on les « annonce » d'abord.
await runSpeakers(console);
const t1 = await talk('Patience', S1), t2 = await talk('Gratitude', S1), t3 = await talk('Brouillon', S2, { pub: 'draft' });
const t4 = await talk('Hors catalogue', S1, { adults: false }), t5 = await talk('Ancienne', S1, { announced: true });
const mails = (u) => pool.query("SELECT kind, vars, locale FROM email_outbox WHERE user_id=$1 AND kind='speaker_new'", [u]).then((r) => r.rows);

const n1 = await runSpeakers(console);
const ma = await mails(a);
ok(ma.length === 1, "abonné : UN e-mail groupé pour deux nouvelles conférences");
ok(ma[0].vars.titles.includes(`Patience ${tag}`) && ma[0].vars.titles.includes(`Gratitude ${tag}`) && ma[0].vars.count === '2', 'titres et nombre');
ok(!ma[0].vars.titles.includes('Ancienne') && !ma[0].vars.titles.includes('Hors catalogue') && !ma[0].vars.titles.includes('Brouillon'), 'ni ancienne conférence, ni hors catalogue, ni brouillon');
ok(ma[0].vars.speakers === S1 && ma[0].vars.path === '/', "intervenant nommé, lien vers les conférences");
ok((await mails(b)).length === 0, 'alertes désactivées : rien');
ok((await mails(c)).length === 0 && (await mails(d)).length === 0, "intervenant sans nouveauté / personne suivie : rien");
ok((await mails(en)).length === 1 && (await mails(en))[0].locale === 'en', 'langue du compte respectée');
const ann = (await pool.query('SELECT id, announced_at IS NOT NULL AS a FROM talks WHERE id = ANY($1)', [[t1.id, t2.id, t3.id, t4.id]])).rows;
const A = Object.fromEntries(ann.map((r) => [r.id, r.a]));
ok(A[t1.id] && A[t2.id] && !A[t3.id] && !A[t4.id], 'annoncées : les visibles seulement ; le brouillon et le hors-catalogue attendent');
await runSpeakers(console);
ok((await mails(a)).length === 1, 'deuxième passage : aucun doublon');
// Le brouillon est publié : seul son abonné est prévenu, l'abonné de S1 n'est pas re-prévenu.
await pool.query("UPDATE talks SET publication='published' WHERE id=$1", [t3.id]);
await runSpeakers(console);
const mc = await mails(c);
ok(mc.length === 1 && mc[0].vars.titles.includes('Brouillon') && mc[0].vars.path === `/conferences/${t3.slug || t3.id}`, 'conférence publiée plus tard : son abonné est prévenu, lien direct');
ok((await mails(a)).length === 1, "l'abonné d'un autre intervenant n'est pas dérangé");
// Une conférence publiée en pleine « programmation » : visible seulement à l'heure dite.
const t6 = await talk('Programmée', S1, { pub: 'scheduled' });
await pool.query("UPDATE talks SET publish_at = now() + interval '1 hour' WHERE id=$1", [t6.id]);
await runSpeakers(console);
ok((await mails(a)).length === 1, "programmée dans le futur : pas d'annonce");
await pool.query("UPDATE talks SET publish_at = now() - interval '1 minute' WHERE id=$1", [t6.id]);
await runSpeakers(console);
ok((await mails(a)).length === 2, "heure de publication passée : annoncée");
// Interrupteur général
const t7 = await talk('Après coupure', S1);
await set('notify_speakers_enabled', 'false');
await runSpeakers(console);
ok((await mails(a)).length === 2, 'réglage désactivé : aucun envoi');
const still = (await pool.query('SELECT announced_at FROM talks WHERE id=$1', [t7.id])).rows[0].announced_at;
ok(still === null, "désactivé : rien n'est « annoncé » (rien n'est perdu à la réactivation)");
await set('notify_speakers_enabled', 'true');

// --- sélection de la semaine
const dow = (await pool.query("SELECT extract(isodow FROM now() AT TIME ZONE 'Europe/Paris')::int AS d")).rows[0].d;
await set('weekly_weekday', String(dow)); await set('weekly_hour', '0'); await set('weekly_enabled', 'true'); await set('weekly_collection', ''); await set('weekly_count', '5');
const e = await mk('hebdo', { weekly: true }), f = await mk('nonhebdo'), g = await mk('hebdo-en', { weekly: true, locale: 'en' });
await pool.query("UPDATE users SET weekly_last_week = date_trunc('week', now() AT TIME ZONE 'Europe/Paris')::date WHERE id=$1", [g]); // déjà servi cette semaine
const wk = (u) => pool.query("SELECT vars, dedupe_key FROM email_outbox WHERE user_id=$1 AND kind='weekly_selection'", [u]).then((r) => r.rows);
const sel = await weeklySelection();
ok(sel.path === '/' && sel.items.length >= 1 && sel.items.length <= 5, 'sans collection : nouveautés des 7 derniers jours (5 au plus)');
await runWeekly(console);
const we = await wk(e);
ok(we.length === 1 && we[0].vars.titles.includes('•') && we[0].vars.path === '/', 'membre inscrit : sa sélection');
ok((await wk(f)).length === 0, "membre non inscrit : jamais d'e-mail");
ok((await wk(g)).length === 0, 'déjà servi cette semaine : rien');
await runWeekly(console);
ok((await wk(e)).length === 1, 'deuxième passage dans la semaine : aucun doublon');
// Collection éditoriale
const col = (await pool.query("INSERT INTO collections(title,kind,published) VALUES ($1,'theme',true) RETURNING id", [`Sélection ${tag}`])).rows[0].id;
await pool.query("INSERT INTO collection_items(collection_id,talk_id,position) VALUES ($1,$2,0),($1,$3,1)", [col, t2.id, t1.id]);
await set('weekly_collection', col);
const h = await mk('hebdo-col', { weekly: true });
await runWeekly(console);
const wh = await wk(h);
ok(wh.length === 1 && wh[0].vars.path === `/collections/${col}` && wh[0].vars.titles.split('\n').length === 2 && wh[0].vars.titles.startsWith(`• Gratitude ${tag}`), 'avec collection : son contenu, dans son ordre, lien vers la collection');
await pool.query("UPDATE collections SET published=false WHERE id=$1", [col]);
const h2 = await mk('hebdo-nonpub', { weekly: true });
await runWeekly(console);
ok((await wk(h2))[0]?.vars.path === '/', 'collection dépubliée : retour aux nouveautés');
await set('weekly_weekday', String(dow % 7 + 1));
const h3 = await mk('hebdo-demain', { weekly: true });
await runWeekly(console);
ok((await wk(h3)).length === 0, "autre jour de la semaine : pas d'envoi");
await set('weekly_weekday', String(dow)); await set('weekly_enabled', 'false');
const h4 = await mk('hebdo-off', { weekly: true });
await runWeekly(console);
ok((await wk(h4)).length === 0, 'réglage désactivé : pas d\'envoi');

// --- mise en forme : lien et en-têtes de désinscription
const row = (await pool.query("SELECT user_id, kind, locale, vars FROM email_outbox WHERE user_id=$1 AND kind='speaker_new'", [en])).rows[0];
const mail = compose(row, { app: 'Mejliss TV', webUrl: 'https://tv.example' });
ok(/^<https:\/\/tv\.example\/api\/unsubscribe\/[0-9a-f-]{36}\.speakers\.[\w-]{32}>$/.test(mail.headers['List-Unsubscribe']) && mail.headers['List-Unsubscribe-Post'] === 'List-Unsubscribe=One-Click', 'en-têtes List-Unsubscribe (RFC 8058)');
ok(mail.html.includes('Unsubscribe in one click') && mail.html.includes('/account#emails') && mail.text.includes('/unsubscribe/'), 'anglais : lien de désinscription et gestion des e-mails');
const tr = compose({ ...row, kind: 'welcome', vars: { name: 'X' } }, { app: 'Mejliss TV', webUrl: 'https://tv.example' });
ok(!tr.headers && !tr.html.includes('unsubscribe'), 'e-mails de compte (paiement, bienvenue…) : pas de lien de désinscription');
const xss = compose({ ...row, vars: { titles: '• <img src=x onerror=alert(1)> — <b>Z</b>' } }, { app: 'Mejliss TV', webUrl: 'https://tv.example' });
ok(!xss.html.includes('<img src=x') && xss.html.includes('&lt;img'), 'titres échappés (aucun HTML injecté)');
const ar = compose({ ...row, locale: 'ar' }, { app: 'Mejliss TV', webUrl: 'https://tv.example' });
ok(ar.html.includes('dir="rtl"') && ar.html.includes('إلغاء الاشتراك'), 'arabe : sens de lecture et libellé');

// Ménage
await pool.query("DELETE FROM users WHERE email LIKE $1", [`nm-%-${tag}@test.local`]);
await pool.query("DELETE FROM collections WHERE id=$1", [col]);
await pool.query("DELETE FROM talks WHERE title LIKE $1", [`% ${tag}`]);
await pool.query("DELETE FROM app_settings WHERE key IN ('weekly_weekday','weekly_hour','weekly_enabled','weekly_collection','weekly_count')");
for (const k of ['smtp_host', 'mail_from']) if (saved[k] === null) await pool.query('DELETE FROM app_settings WHERE key=$1', [k]);
invalidateSettings();
await pool.end();
console.log(bad ? 'ÉCHEC' : 'TOUT OK');
process.exit(bad ? 1 : 0);
