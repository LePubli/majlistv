// Audit 11/2026 — Studio : « Sous-titres » et « Corrections de sous-titres » réunis en une rubrique à deux onglets.
// Les adresses ne changent pas (/studio/subtitles, /studio/corrections) ; le menu n'a plus qu'une ligne « Sous-titres ».
// node web/tests/test_subtitle_tabs_web.mjs
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const web = fileURLToPath(new URL('..', import.meta.url));
const read = (p) => fs.readFileSync(join(web, p), 'utf8');
const i18n = read('lib/i18n.js');
for (const k of ['sdSubTabMine', 'sdSubTabCor', 'sdSubTabWaiting', 'sdSubs', 'corTitle']) assert.equal((i18n.match(new RegExp(`^    ${k}: `, 'gm')) || []).length, 3, `texte ${k} dans les 3 langues`);

// Les deux pages existent toujours, chacune à son adresse, et portent les onglets.
const subs = read('app/studio/subtitles/page.js');
const cor = read('app/studio/(module-corrections)/corrections/page.js');
assert.match(subs, /<SubtitleTabs \/>/, 'onglets sur « Par contenu »');
assert.match(cor, /<SubtitleTabs pending=\{data \? data\.counts\.pending : undefined\} \/>/, 'onglets sur « Corrections », avec le nombre déjà connu');
assert.match(cor, /tabbed \? t\('sdSubs'\) : t\('corTitle'\)/, 'titre « Sous-titres » pour l\'organisateur, titre d\'origine pour le modérateur');

// Le composant : deux liens, visible seulement pour organisateur / administrateur quand le module est utilisable.
const tabs = read('components/SubtitleTabs.js');
assert.match(tabs, /\['\/studio\/subtitles', t\('sdSubTabMine'\)/); assert.match(tabs, /\['\/studio\/corrections', t\('sdSubTabCor'\)/);
assert.match(tabs, /hasWebModule\('corrections'\) && modUsable\('corrections'\)/, 'module coupé → pas d\'onglets');
assert.match(tabs, /aria-current=\{cur \? 'page' : undefined\}/, 'onglet courant annoncé');
const { subtitleTabsOn } = await import('data:text/javascript,' + encodeURIComponent(tabs.match(/export const subtitleTabsOn = [^\n]+/)[0]));
assert.equal(subtitleTabsOn('organizer', true), true); assert.equal(subtitleTabsOn('admin', true), true);
assert.equal(subtitleTabsOn('moderator', true), false, 'modérateur : écran des corrections seul');
assert.equal(subtitleTabsOn('admin', false), false); assert.equal(subtitleTabsOn(undefined, true), false);

// Menu du Studio : plus de ligne « Corrections », « Sous-titres » allumé sur les deux adresses.
const sd = read('components/StudioShell.js');
assert.match(sd, /if \(STUDIO_TAB_OF\[l\.href\]\) continue;/, 'entrée de module devenue onglet : hors du menu');
const section = sd.match(/export function studioSection\(path\) \{[\s\S]*?\n\}/)[0].replace('export ', '').replace('UUID.test(path)', 'false');
const studioSection = new Function(`${section}; return studioSection;`)();
assert.equal(studioSection('/studio/subtitles'), 'subtitles'); assert.equal(studioSection('/studio/corrections'), 'subtitles');
assert.equal(studioSection('/studio/dubbing'), 'dubbing'); assert.equal(studioSection('/studio'), 'dash');
// Le module garde sa fiche (droits, activation) : seule la ligne de menu disparaît.
assert.match(read('modules/corrections/module.js'), /href: '\/studio\/corrections'/);
// Styles dans la feuille du Studio (pas dans la feuille publique).
assert.match(read('app/back.css'), /\.sd-tabs a\.on/); assert.doesNotMatch(read('app/globals.css'), /\.sd-tabs/);
console.log('OK — Sous-titres : deux onglets, une ligne de menu');
