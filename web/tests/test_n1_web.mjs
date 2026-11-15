// Étape N1 (15/11) — menu principal à cinq destinations, « En direct » (TV + événements) dans le Catalogue,
// barre du bas du téléphone avec « Compte » comme l'application.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const web = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => fs.readFileSync(join(web, p), 'utf8');
const i18n = read('lib/i18n.js');
const has3 = (k) => assert.equal((i18n.match(new RegExp(`^    ${k}: `, 'gm')) || []).length, 3, `${k} en fr, en et ar`);

// Menus d'origine
import { MENUS } from '../lib/navcfg.js';
const visible = (list) => list.filter(([, , hid]) => !hid).map(([k]) => k);
assert.deepEqual(visible(MENUS.main.builtin), ['home', 'catalogue', 'learning', 'pratique', 'library', 'kids'], 'menu du haut : 5 destinations + Kids');
assert.ok(MENUS.main.builtin.some(([k, , hid]) => k === 'livetv' && hid === true), 'TV en direct encore proposée (masquée) dans Admin → Menus');
assert.deepEqual(visible(MENUS.bar.builtin), ['home', 'catalogue', 'learning', 'pratique', 'account'], 'barre du bas = celle de l’application');
assert.ok(MENUS.bar.builtin.some(([k, , hid]) => k === 'library' && hid === true), 'bibliothèque encore proposée dans Admin → Menus');
assert.ok(visible(MENUS.side.builtin.catalogue).includes('livetv'), 'menu latéral : TV en direct reste dans le groupe Catalogue');
assert.equal(read('lib/navcfg.js'), fs.readFileSync(join(web, '../api/src/navcfg.js'), 'utf8'), 'navcfg identique côté API');

// Barre du bas : libellé court, « Connexion » pour un visiteur
const ms = read('components/MemberShell.js');
assert.match(ms, /account: user \? \{ \.\.\.D\.account, label: t\('msAccShort'\) \} : \{ \.\.\.D\.account, href: '\/login', label: t\('login'\) \}/);
has3('msAccShort');

// Onglet « En direct » du Catalogue
const st = read('components/SectionTabs.js');
assert.match(st, /catalogue: \[[^\]]*'\/live', '\/events'\]/, '/live et /events dans la rubrique Catalogue');
assert.match(st, /\[feat\('livetv'\) \? '\/live' : '\/events', t\('stLive'\), feat\('livetv'\) \|\| feat\('events'\), \['\/live', '\/events'\]\]/);
assert.match(st, /const on = path === href \|\| Boolean\(also\?\.includes\(path\)\);/, 'onglet allumé sur /live et /events');
assert.doesNotMatch(st, /\['\/events', t\('stLive'\), feat\('events'\)\]/, 'ancien onglet retiré');

// Page « En direct » : TV puis événements
const pg = read('app/live/page.js');
assert.match(pg, /<h1>\{t\('stLive'\)\}<\/h1>/);
assert.match(pg, /\{events \? t\('lvHubIntro'\) : t\('lvPageIntro'\)\}/);
assert.match(pg, /\{events && <EventsBand empty=\{<p className="lv-ev-more"><Link className="link u" href="\/events">\{t\('evnMore'\)\}<\/Link><\/p>\} \/>\}/);
const band = read('components/EventsBand.js');
assert.match(band, /export default function EventsBand\(\{ empty = null \}\)/);
assert.match(band, /if \(!on\) return null;\n  if \(list\.length === 0\) return empty;/);
assert.match(read('app/page.js'), /<EventsBand \/>/, 'accueil inchangé : rien quand aucun événement');
for (const k of ['lvHubIntro', 'evnMore', 'stLive']) has3(k);

// L'arabe ne confond plus « TV en direct » et « Événements en direct »
const ar = i18n.slice(i18n.lastIndexOf('    lvNav: '));
const lvAr = /    lvNav: "([^"]+)"/.exec(ar)[1];
const evAr = [...i18n.matchAll(/^    evnNav: "([^"]+)"/gm)][2][1];
assert.notEqual(lvAr, evAr);

assert.match(read('app/globals.css'), /\.lv-ev-more \{/);
console.log('test_n1_web : OK');
