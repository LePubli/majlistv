// Étape B6 — Apprendre en 4 onglets (Aujourd'hui, Coran et athkar, Conférences, Mes progrès) avec sous-onglets et phrase d'explication.
import assert from 'node:assert/strict';
import fs from 'node:fs';
const read = (p) => fs.readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');
const lp = read('app/(module-learning)/learning/page.js');
for (const [g, subs] of [['g_today', "'dash'"], ['g_quran', "'quran', 'athkar'"], ['g_talks', "'path', 'rev', 'cards'"], ['g_progress', "'commit', 'bilan', 'att'"]])
  assert.match(lp, new RegExp(`id: '${g}'[^\\n]*subs: \\[${subs}\\]`), `groupe ${g}`);
assert.match(lp, /<TabBar tabs=\{GROUPS\} current=\{group\.id\} onChange=\{goGroup\}/, '4 onglets principaux');
assert.match(lp, /subTabs\.length > 1 && <div className="lg-subtabs"><TabBar tabs=\{subTabs\}/, 'sous-onglets seulement s’il y a plusieurs sections');
assert.match(lp, /GROUPS\.find\(\(g\) => g\.subs\.includes\(tab\)\)/, 'anciennes adresses (?tab=athkar…) : bon groupe ouvert');
assert.match(lp, /\.filter\(\(g\) => g\.subs\.length\)/, 'groupe sans section active (fonctions coupées) masqué');
assert.match(lp, /localStorage\.setItem\(key, '1'\)/, 'phrase d’explication masquée après « Compris »'); assert.match(lp, /catch \{ setSeen\(false\); \}/, 'stockage indisponible : la page marche quand même');
const i18n = read('lib/i18n.js');
for (const k of ['lgGToday', 'lgGQuran', 'lgGTalks', 'lgGProgress', 'lgGTodayTx', 'lgGQuranTx', 'lgGTalksTx', 'lgGProgressTx', 'lgGotIt']) assert.equal((i18n.match(new RegExp(`\\b${k}:`, 'g')) || []).length, 3, `${k} en fr/en/ar`);
console.log('web learning groups OK');
