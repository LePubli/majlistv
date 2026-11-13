// Chaînes TV en direct : section en tête de la page « En direct », gestion dans le Studio, textes, module.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const web = fileURLToPath(new URL('..', import.meta.url));
const read = (p) => fs.readFileSync(join(web, p), 'utf8');
const c = read('components/LiveChannels.js');
assert.match(c, /https:\/\/www\.youtube-nocookie\.com\/embed\/\$\{ref\}\?rel=0&playsinline=1/, 'lecteur YouTube officiel (sans cookies)');
assert.match(c, /\^\[\\w-\]\{11\}\$/, 'identifiant vérifié avant intégration');
assert.match(c, /call\('\/live'\)/); assert.match(c, /setInterval\(load, 5 \* 60000\)/, 'liste relue toutes les 5 minutes');
assert.match(c, /if \(!feat\('livetv'\) \|\| !list \|\| list\.length === 0\) return null;/);
const ev = read('app/events/page.js');
assert.match(ev, /<LiveChannels \/>/); assert.match(ev, /if \(!feat\('events'\) && !feat\('livetv'\)\)/);
const st = read('app/studio/(module-events)/live/page.js');
for (const p of ["'/studio/live'", '/studio/live/${c.id}/check', "method: 'DELETE'", "{ enabled: !c.enabled }"]) assert.ok(st.includes(p), p);
assert.match(read('modules/events/module.js'), /features: \['events', 'livetv'\]/);
assert.match(read('lib/modules.js'), /'events', 'livetv',/);
assert.match(read('components/MemberShell.js'), /on: feat\('events'\) \|\| feat\('livetv'\)/);
const i18n = read('lib/i18n.js');
for (const k of ['lvTitle', 'lvLive', 'lvNotLive', 'lvAdminTitle', 'lvAdminHelp', 'lvAdminOff', 'lvName', 'lvUrl', 'lvAdd', 'lvEmpty', 'lvChecking', 'lvCheck', 'lvDel', 'lvDelAsk', 'lvSeePage'])
  assert.equal((i18n.match(new RegExp(`^    ${k}: `, 'gm')) || []).length, 3, k);
assert.match(read('app/globals.css'), /\.lv-player \{[^}]*aspect-ratio: 16 \/ 9/);
console.log('test_live_channels_web : OK');
