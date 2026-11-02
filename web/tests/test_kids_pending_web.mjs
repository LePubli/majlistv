// Étape B5 — validations des enfants en attente : pastille dans les menus, bandeau de l'espace Kids, préférence e-mail, textes.
import assert from 'node:assert/strict';
import fs from 'node:fs';
const read = (p) => fs.readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');
const k = read('components/KidsPending.js');
assert.match(k, /\/me\/kids\/pending/, 'données : GET /me\/kids\/pending'); assert.match(k, /user && !kidMode && feat\('kids'\)/, 'parent connecté seulement, jamais en mode enfant');
assert.match(k, /n > 9 \? '9\+'/, 'pastille plafonnée à 9+'); assert.match(k, /visibilitychange/, 'rafraîchie au retour sur l’onglet');
const h = read('components/Header.js');
assert.equal((h.match(/\{it\.kids && <KidsPendingBadge \/>\}/g) || []).length, 2, 'en-tête et menu du téléphone');
assert.equal((read('components/MemberShell.js').match(/\{it\.key === 'kids' && <KidsPendingBadge \/>\}/g) || []).length, 2, 'barre latérale et barre du bas');
for (const f of ['components/KidsActions.js', 'components/KidsRamadan.js']) assert.match(read(f), /load\(\); refreshKidsPending\(\);/, `pastille mise à jour après validation (${f})`);
const p = read('components/KidsParent.js');
assert.match(p, /d\.pending\?\.total > 0 && \(\n\s*<section className="kp-banner"/, 'bandeau « en attente »'); assert.match(p, /openPending\(p\)/, 'bouton Valider : ouvre la validation de l’enfant');
assert.match(p, /\/me\/kids\/pending-prefs/, 'préférence e-mail'); assert.match(p, /kids:pending-refresh/, 'bandeau mis à jour après validation');
assert.match(read('app/unsubscribe/[token]/page.js'), /'kidspending' \? 'unKidsPending'/, 'désinscription en un clic : bon libellé');
const i18n = read('lib/i18n.js');
for (const key of ['kpBadge', 'kpTitle', 'kpCount', 'kpGo', 'kpEmail', 'unKidsPending']) assert.equal((i18n.match(new RegExp(`\\b${key}:`, 'g')) || []).length, 3, `${key} en fr/en/ar`);
console.log('web kids pending OK');
