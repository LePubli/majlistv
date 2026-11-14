// TV en direct : page à part (/live), gestion dans le Studio, menus, textes ; indépendante du module « Événements en direct » (14/11).
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
assert.match(c, /if \(!feat\('livetv'\) \|\| !list\) return null;\n  if \(list\.length === 0\) return empty;/);
const ev = read('app/events/page.js');
assert.doesNotMatch(ev, /LiveChannels/, 'la page des événements ne porte plus la TV en direct');
const pg = read('app/live/page.js');
assert.match(pg, /if \(!feat\('livetv'\)\)/); assert.match(pg, /<LiveChannels\s+empty=/); assert.match(pg, /href="\/studio\/live"/);
assert.ok(!fs.existsSync(join(web, 'app/studio/(module-events)/live')), 'la gestion n’est plus dans le module');
const st = read('app/studio/live/page.js');
for (const p of ["'/studio/live'", '/studio/live/${c.id}/check', "method: 'DELETE'", "{ enabled: !c.enabled }"]) assert.ok(st.includes(p), p);
assert.match(read('modules/events/module.js'), /features: \['events'\],/);
assert.doesNotMatch(read('lib/modules.js'), /'livetv'/, 'livetv n’appartient à aucun module');
assert.match(read('lib/features.js'), /\[\/\^\\\/\(live\|studio\\\/live\)\(\\\/\|\$\)\/, 'livetv'\]/);
assert.match(read('components/StudioShell.js'), /if \(isAdmin && feat\('livetv'\)\) groups\.find\(\(g\) => g\.key === 'publish'\)\.items\.push\(\['\/studio\/live'/);
const ms = read('components/MemberShell.js');
assert.match(ms, /events: \{ key: 'events', href: '\/events', label: t\('evnNav'\), icon: ICONS\.bell, on: feat\('events'\) \}/);
assert.match(ms, /livetv: \{ key: 'livetv', href: '\/live', label: t\('lvNav'\), icon: ICONS\.tv, on: feat\('livetv'\) \}/);
assert.match(read('components/Header.js'), /livetv: \{ key: 'livetv', href: '\/live'/);
const nav = read('lib/navcfg.js');
assert.match(nav, /\['catalogue', 'Catalogue'\], \['livetv', 'TV en direct'\]/); assert.match(nav, /\['livetv', 'TV en direct'\], \['events', 'Événements en direct'\]/);
assert.match(read('lib/menusCfg.js'), /\['live', 'TV en direct'\]/);
const i18n = read('lib/i18n.js');
for (const k of ['lvNav', 'lvPageIntro', 'lvNoChannel', 'lvAddHint', 'lvTitle', 'lvLive', 'lvNotLive', 'lvAdminTitle', 'lvAdminHelp', 'lvAdminOff', 'lvName', 'lvUrl', 'lvAdd', 'lvEmpty', 'lvChecking', 'lvCheck', 'lvDel', 'lvDelAsk', 'lvSeePage'])
  assert.equal((i18n.match(new RegExp(`^    ${k}: `, 'gm')) || []).length, 3, k);
assert.match(read('app/globals.css'), /\.lv-player \{[^}]*aspect-ratio: 16 \/ 9/);
console.log('test_live_channels_web : OK');
