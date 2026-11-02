// Étape B4 — invitation des visiteurs : carte « Créez votre compte gratuit » (Coran, Ramadan, Apprendre, fin d'aperçu).
import assert from 'node:assert/strict';
import fs from 'node:fs';
const read = (p) => fs.readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');
const c = read('components/InviteCard.js');
assert.match(c, /if \(!ready \|\| user\) return null/, 'jamais pour un membre'); assert.match(c, /feat\('registration'\)/, 'inscription fermée : connexion seule');
assert.match(c, /\/register\?next=\$\{q\}/, 'retour à la page après inscription'); assert.match(c, /\/login\?next=\$\{q\}/, 'retour à la page après connexion');
assert.match(read('components/QuranPlan.js'), /<InviteCard context="quran" next="\/coran" \/>/, 'Coran');
assert.match(read('app/ramadan/page.js'), /<InviteCard context="ramadan" next="\/ramadan" \/>/, 'Ramadan');
assert.match(read('app/talks/[id]/TalkClient.js'), /<InviteCard context="preview" next="\/coran" compact \/>/, 'fin d’aperçu');
const lp = read('app/(module-learning)/learning/page.js');
assert.match(lp, /<InviteCard context="learn" next="\/learning" \/>/, 'Apprendre'); assert.doesNotMatch(lp, /router\.replace\('\/login'\)/, 'plus de renvoi forcé vers la connexion');
const i18n = read('lib/i18n.js');
for (const k of ['ivTitle', 'ivQuran', 'ivRamadan', 'ivLearn', 'ivLearnNote', 'ivPreview', 'ivB1', 'ivB2', 'ivB3', 'ivCreate']) assert.equal((i18n.match(new RegExp(`\\b${k}:`, 'g')) || []).length, 3, `${k} en fr/en/ar`);
console.log('web invite OK');
