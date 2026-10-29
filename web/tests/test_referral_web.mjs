// Étape 43 : textes du parrainage présents dans les 3 langues, composants reliés, lien d'inscription pris en compte.
import fs from 'node:fs';
import assert from 'node:assert/strict';

const i18n = fs.readFileSync(new URL('../lib/i18n.js', import.meta.url), 'utf8');
const KEYS = ['refTab', 'refInvited', 'refTitle', 'refIntro', 'refLink', 'refCode', 'refCopy', 'refCopied', 'refWhatsapp', 'refShareText', 'refInvited2', 'refRewarded', 'refPending',
  'refEarned', 'refCap', 'refYou', 'refRules', 'refAdmin', 'refAdmTitle', 'refAdmReferrer', 'refAdmReferee', 'refAdmStatus', 'refAdmDate', 'refAdmNone', 'refAdmCapped',
  'refStPending', 'refStRewarded', 'refMonth', 'refMonths', 'trialNoCardNote'];
for (const lang of ['fr', 'en', 'ar']) {
  const line = i18n.split('\n').find((l) => l.startsWith(`  ${lang}: {`));
  assert.ok(line, `langue ${lang}`);
  for (const k of KEYS) assert.ok(new RegExp(`(^|[ ,{])${k}:`).test(line), `${lang} : clé ${k}`);
}
const read = (p) => fs.readFileSync(new URL(p, import.meta.url), 'utf8');
assert.match(read('../components/AuthForm.js'), /\/me\/referral\/claim/, "l'inscription rattache le filleul");
assert.match(read('../app/account/page.js'), /MyReferral/, 'onglet Parrainage dans Mon compte');
assert.match(read('../app/admin/page.js'), /ReferralAdmin/, 'écran Admin → Parrainages');
assert.match(read('../app/admin/page.js'), /referral: 'Parrainages'/, 'titre de l\'écran Parrainages (sinon le tableau de bord s\'affiche)');
assert.match(read('../components/AdminShell.js'), /'referral'/, 'menu Admin');
assert.match(read('../components/MyReferral.js'), /\/register\?ref=/, 'lien de parrainage');
console.log('web referral OK');
