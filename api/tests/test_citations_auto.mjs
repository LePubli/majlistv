// 24.6 : réapprovisionnement automatique des citations (stock minimum). Prérequis : PG de test, corpus importé (test_citations.py).
import { pool } from '../src/db.js';
import { autoTopUp } from '../src/modules/citations/routes.js';
import { saveSettings, invalidateSettings } from '../src/settings.js';
const ok = (c, m) => { console.log((c ? 'OK   ' : 'FAIL ') + m); if (!c) process.exit(1); };
const jobs = async () => (await pool.query("select count(*)::int n from citation_jobs where status in ('pending','processing')")).rows[0].n;
const set = async (v) => { await saveSettings(v, null); invalidateSettings(); };
await pool.query("update citation_jobs set status='ready' where status in ('pending','processing')");
await pool.query("update reminders set status='approved', approved_at=now() where origin='corpus'");
await pool.query(`insert into reminders(talk_id, lang, text, text_ar, origin, attribution, status, approved_at, corpus_id)
                  select null, 'fr', text_fr, text_ar, 'corpus', label, 'approved', now(), id from corpus_items c
                   where not exists (select 1 from reminders r where r.corpus_id = c.id) order by id limit 8`);
await set({ citations_auto: 'false', citations_min_stock: '500' });
await autoTopUp(); ok((await jobs()) === 0, 'génération automatique désactivée : rien demandé');
await set({ citations_auto: 'true', citations_min_stock: '5' });
await autoTopUp(); ok((await jobs()) === 0, 'stock suffisant : rien demandé');
await set({ citations_min_stock: '500' });
await autoTopUp(); ok((await jobs()) === 1, 'stock insuffisant : une demande créée');
const w = (await pool.query("select wanted from citation_jobs order by id desc limit 1")).rows[0].wanted;
ok(w <= 15, `demande plafonnée au réglage « par génération » (${w})`);
await autoTopUp(); ok((await jobs()) === 1, 'pas de seconde demande tant que la première est en cours');
await pool.query("update citation_jobs set status='failed', updated_at=now()");
await autoTopUp(); ok((await jobs()) === 0, 'après un échec récent : pas d\'acharnement');
await pool.query("update citation_jobs set status='ready'");
await set({ citations_auto: null, citations_min_stock: null });
console.log('TOUT OK'); await pool.end();
