// Connexion d'une télé : page /tv (code, confirmation, refus), textes.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
const web = fileURLToPath(new URL('..', import.meta.url));
const read = (p) => fs.readFileSync(join(web, p), 'utf8');
const p = read('app/tv/page.js');
assert.match(p, /call\(`\/auth\/tv\/code\/\$\{code\}`\)/); assert.match(p, /call\('\/auth\/tv\/approve', \{ method: 'POST', body: JSON\.stringify\(\{ code, allow \}\) \}\)/);
assert.match(p, /\/login\?next=\$\{encodeURIComponent\(`\/tv/, 'connexion puis retour à la page avec le code');
assert.match(p, /toUpperCase\(\)\.replace\(\/\[\^A-Z0-9\]\/g, ''\)\.slice\(0, 8\)/);
const i18n = read('lib/i18n.js');
for (const k of ['tvTitle', 'tvNeedLogin', 'tvHelp', 'tvCode', 'tvAs', 'tvConfirm', 'tvConfirmDevice', 'tvAllow', 'tvDeny', 'tvAllowed', 'tvDenied']) assert.equal((i18n.match(new RegExp(`^    ${k}: `, 'gm')) || []).length, 3, k);
console.log('test_tv_link_web : OK');
