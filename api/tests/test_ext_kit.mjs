// Lot X1 : moteur de gabarits, assemblages, kit (exemple valide, guide à jour et complet). Sans base de données :  node api/tests/test_ext_kit.mjs
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { compileTemplate, renderTemplate, expandComposed, TPL_TAGS } from '../src/extTemplate.js';
import { parseExtPack, COMPOSABLE, FIELD_KINDS, SETTING_TYPES } from '../src/extPack.js';
import { buildExtExampleZip, buildExtGuide, EXT_EXAMPLE } from '../src/extKit.js';
import { BLOCK_TYPES, EXT_TYPES, EXT_META, registerExtBlocks, cleanContent, kidsErrors } from '../src/blocks.js';
import { writeZip } from '../src/zip.js';
let n = 0; const ok = (c, m) => { assert.ok(c, m); n++; console.log('OK   ' + m); };
const HERE = path.join(import.meta.dirname, '..', 'ext-kit');

const F = [{ k: 'title', kind: 't', label: 'T' }, { k: 'body', kind: 'tl', label: 'B' }, { k: 'link', kind: 'url', label: 'L' }, { k: 'pic', kind: 'media', label: 'P' },
  { k: 'look', kind: 'sel', label: 'S', options: [['a', 'A'], ['b', 'B']], def: 'a' }, { k: 'n', kind: 'num', label: 'N', min: 0, max: 9, def: 3 },
  { k: 'items', kind: 'list', label: 'I', max: 5, item: 'It', fields: [{ k: 'q', kind: 't', label: 'Q' }] }];
const R = (src, props, extra = {}) => { const c = compileTemplate(src, F, { texts: new Set(['hi']), settings: new Set(['s1']), features: new Set(['f1']) }); assert.deepEqual(c.errors, [], src); return renderTemplate(c.ast, { props, fields: F, lang: 'fr', texts: { hi: { fr: 'Salut', ar: 'مرحبا' } }, settings: { s1: 'S<1>' }, features: { f1: true }, mediaUrl: (i) => `/m/${i}`, ...extra }); };
const bad = (src, frag) => { const c = compileTemplate(src, F, { texts: new Set(), settings: new Set(), features: new Set() }); assert.ok(c.errors.some((e) => e.includes(frag)), `${src} → ${c.errors}`); n++; console.log('OK   refusé : ' + frag); };

// rendu : échappement, langues, conditions, boucles
ok(R('<p>{{title}}</p>', { title: { fr: '<b>x</b> & "y"' } }) === '<p>&lt;b&gt;x&lt;/b&gt; &amp; &quot;y&quot;</p>', 'valeurs échappées');
ok(R('<p>{{title}}</p>', { title: { fr: 'Bonjour', ar: 'مرحبا' } }, { lang: 'ar' }) === '<p>مرحبا</p>', 'langue du visiteur');
ok(R('<p>{{title}}</p>', { title: { fr: 'Bonjour' } }, { lang: 'en' }) === '<p>Bonjour</p>', 'repli sur le français');
ok(R('<p>{{body|br}}</p>', { body: { fr: 'a\nb' } }) === '<p>a<br>b</p>', '|br');
ok(R('{{#if title}}oui{{else}}non{{/if}}', {}) === 'non' && R('{{#if title}}oui{{else}}non{{/if}}', { title: { fr: 'x' } }) === 'oui', '#if / else');
ok(R('{{#if !title}}vide{{/if}}', {}) === 'vide', '#if !champ');
ok(R('{{#if look=b}}B{{/if}}', { look: 'b' }) === 'B' && R('{{#if look=b}}B{{/if}}', { look: 'a' }) === '', '#if champ=valeur');
ok(R('{{#if feat:f1}}F{{/if}}{{#if !feat:f1}}G{{/if}}', {}) === 'F', 'fonction');
ok(R('{{#if s:s1}}{{s:s1}}{{/if}}', {}) === 'S&lt;1&gt;', 'réglage échappé');
ok(R('{{t:hi}}', {}) === 'Salut' && R('{{t:hi}}', {}, { lang: 'ar' }) === 'مرحبا', 'texte de l\'extension');
ok(R('<ul>{{#each items}}<li>{{@n}}:{{q}}</li>{{/each}}</ul>', { items: [{ q: { fr: 'x' } }, { q: { fr: 'y' } }] }) === '<ul><li>1:x</li><li>2:y</li></ul>', '#each et {{@n}}');
ok(R('<ul>{{#each items}}<li>{{q}}</li>{{/each}}</ul>', {}) === '<ul></ul>', '#each vide');
ok(R('<a href="{{link}}">x</a>', { link: '/pricing' }) === '<a href="/pricing">x</a>', 'lien interne');
ok(R('<a href="{{link}}">x</a>', { link: 'https://a.test' }) === '<a href="https://a.test" rel="noopener noreferrer">x</a>', 'lien externe : rel ajouté');
ok(R('<a href="{{link}}">x</a>', { link: 'javascript:alert(1)' }) === '<a>x</a>', 'adresse javascript: jamais rendue');
ok(R('<img src="{{pic}}" alt="">', { pic: '00000000-0000-4000-8000-000000000000' }) === '<img src="/m/00000000-0000-4000-8000-000000000000" alt="">', 'image de la bibliothèque');
ok(R('x<img src="{{pic}}" alt="">y', {}) === 'xy', 'image absente : rien');
ok(R('<div class="a b-{{look}}">z</div>', { look: 'b' }) === '<div class="a b-b">z</div>', 'class avec champ « choix »');
ok(R('<p>{{n}}</p>', { n: 4 }) === '<p>4</p>', 'nombre');
// refus
bad('<script>x</script>', 'script'); bad('<p onclick="x()">', 'onclick'); bad('<p style="x">', 'style'); bad('<p id="a">', 'id'); bad('<iframe></iframe>', 'iframe');
bad('<form></form>', 'form'); bad('<input>', 'input'); bad('<svg></svg>', 'svg'); bad('<a href="data:text/html,x">x</a>', 'href'); bad('<a href="//evil.test">x</a>', 'href');
bad('<a>x</a>', 'href'); bad('<img src="{{pic}}">', 'alt'); bad('<img alt="" src="x.png">', 'media'); bad('{{unknown}}', 'inconnu'); bad('{{title|br|x}}', 'non comprise');
bad('<p>{{pic}}</p>', 'image'); bad('<a href="{{title}}">x</a>', 'url'); bad('<div class="{{title}}">', 'sel'); bad('<p>', 'fermée'); bad('</p>', 'sans ouverture');
bad('{{#if title}}', 'jamais fermé'); bad('{{/if}}', 'sans'); bad('{{#each title}}x{{/each}}', 'liste'); bad('{{#each items}}{{#each items}}{{/each}}{{/each}}', 'imbriqué');
bad('{{#foo}}', 'inconnue'); bad('{{t:nope}}', 'absent'); bad('{{s:nope}}', 'absent'); bad('{{#if feat:nope}}x{{/if}}', 'absente'); bad('<p>a & b</p>', '&'); bad('<p>1 < 2</p>', '<');
bad('<p role="button">', 'role'); bad('<p width="a">', 'entier'); bad('<p>'.repeat(20) + '</p>'.repeat(20), 'profond'); bad('<p>x</p>'.repeat(700), 'complexe');
bad('x'.repeat(21 * 1024), 'long'); bad('{{@n}}', '@n');

// assemblages
const tree = [{ type: 'heading', props: { title: '$title' } }, { type: 'talks', props: { limit: '$n', level: '$look', source: 'latest' }, }];
const ex = expandComposed(tree, { title: { fr: 'T' }, n: 4 }, 'id');
ok(ex.length === 2 && ex[0].props.title.fr === 'T' && ex[1].props.limit === 4 && !('level' in ex[1].props) && ex[1].props.source === 'latest' && ex[0].id === 'id-0', 'assemblage : liaisons, valeurs fixes, champ vide ignoré');

// enregistrement des blocs d'extension dans le registre commun
const z = parseExtPack(buildExtExampleZip());
ok(z.ok, 'extension d\'exemple valide'); registerExtBlocks(z.payload.blocks);
ok(EXT_TYPES.has('x_exemple_bandeau') && BLOCK_TYPES.x_exemple_bandeau.fields.length === 5 && EXT_META.x_exemple_selection.kind === 'composed', 'blocs enregistrés (champs, genre)');
const page = (b) => cleanContent({ meta: {}, zones: { main: [b] } }, 'custom', true);
ok(Object.keys(page({ id: 'abcd', type: 'x_exemple_bandeau', props: { title: { fr: 'x' }, look: 'bold' } }).errors).length === 0, 'bloc d\'extension accepté par la validation du site');
ok(Object.keys(page({ id: 'abcd', type: 'x_exemple_bandeau', props: { look: 'zzz' } }).errors).length > 0, 'choix inconnu refusé par la validation du site');
ok(Object.keys(kidsErrors('/kids/histoires/essai', { zones: { main: [{ id: 'abcd', type: 'x_exemple_bandeau', props: {} }] } })).length === 1, 'jamais dans l\'espace Kids');
registerExtBlocks({});
ok(!EXT_TYPES.size && !BLOCK_TYPES.x_exemple_bandeau, 'désenregistrement : plus aucun bloc d\'extension');
ok(Object.keys(page({ id: 'abcd', type: 'x_exemple_bandeau', props: {} }).errors).length > 0, 'type inconnu quand l\'extension est inactive');
registerExtBlocks({ talks: { label: 'x', fields: [], ext: 'y' } });
ok(!EXT_TYPES.has('talks') && BLOCK_TYPES.talks.label !== 'x', 'un bloc d\'extension ne remplace jamais un bloc du site'); registerExtBlocks({});

// kit : exemple valide, dossier et guide à jour, guide complet
const zip = (dir) => writeZip((function w(d, rel = '') { return fs.readdirSync(d, { withFileTypes: true }).flatMap((e) => e.isDirectory() ? w(path.join(d, e.name), `${rel}${e.name}/`) : [{ name: rel + e.name, data: fs.readFileSync(path.join(d, e.name)) }]); })(dir));
ok(parseExtPack(zip(path.join(HERE, 'example'))).ok, 'dossier example/ valide');
for (const [name, data] of Object.entries(EXT_EXAMPLE)) assert.equal(fs.readFileSync(path.join(HERE, 'example', name), 'utf8'), data, `example/${name} périmé : node api/ext-kit/generate.mjs`);
n++; console.log('OK   example/ à jour');
const guide = buildExtGuide();
assert.equal(fs.readFileSync(path.join(HERE, 'GUIDE-EXTENSIONS-IA.md'), 'utf8'), guide, 'GUIDE-EXTENSIONS-IA.md périmé : node api/ext-kit/generate.mjs'); n++; console.log('OK   guide à jour');
for (const t of COMPOSABLE) assert.ok(guide.includes(`\`${t}\``), `guide : bloc ${t}`);
for (const k of FIELD_KINDS) assert.ok(guide.includes(`\`${k}\``), `guide : champ ${k}`);
for (const k of SETTING_TYPES) assert.ok(guide.includes(`\`${k}\``), `guide : réglage ${k}`);
for (const t of TPL_TAGS) assert.ok(guide.includes(`\`${t}\``), `guide : balise ${t}`);
n++; console.log('OK   le guide cite tous les blocs composables, types de champs, réglages et balises');
console.log(`\nOK — ${n} vérifications`);
