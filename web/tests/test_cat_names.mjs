// Noms de catégories traduits : remplacement par la langue du visiteur, repli sur le français, administration épargnée.
import { localizeCatNames } from '../lib/catNames.js';
let fail = 0;
const ok = (c, m) => { console.log((c ? 'OK   ' : 'FAIL ') + m); if (!c) fail++; };
const card = () => ({ id: 1, category: 'Le Coran › Tajwid', categoryTr: { en: 'The Quran › Tajwid', ar: 'القرآن › التجويد' } });

ok(localizeCatNames(card(), 'en', '/talks').category === 'The Quran › Tajwid', 'anglais : carte traduite');
ok(localizeCatNames(card(), 'ar', '/talks').category === 'القرآن › التجويد', 'arabe : carte traduite');
ok(localizeCatNames(card(), 'fr', '/talks').category === 'Le Coran › Tajwid', 'français : inchangé');
ok(localizeCatNames({ category: 'Seul' , categoryTr: {} }, 'en', '/talks').category === 'Seul', 'sans traduction : le français reste');
ok(localizeCatNames({ category: 'Seul', categoryTr: { en: '  ' } }, 'en', '/talks').category === 'Seul', 'traduction vide : le français reste');
ok(localizeCatNames({ category: 'Seul' }, 'en', '/talks').category === 'Seul', 'aucune clé Tr : inchangé');
const home = { rows: [{ items: [card(), card()] }], hero: card() };
localizeCatNames(home, 'en', '/home');
ok(home.rows[0].items.every((x) => x.category.startsWith('The Quran')) && home.hero.category.startsWith('The Quran'), 'listes et objets imbriqués');
const tree = [{ name: 'Le Coran', fullName: 'Le Coran', nameTr: { en: 'The Quran' }, fullNameTr: { en: 'The Quran' } }];
localizeCatNames(tree, 'en', '/categories');
ok(tree[0].name === 'The Quran' && tree[0].fullName === 'The Quran', '/categories : name et fullName');
for (const path of ['/categories?catalogue=all', '/categories/stats', '/admin/x', '/studio/x', '/me/talks']) {
  ok(localizeCatNames(card(), 'en', path).category === 'Le Coran › Tajwid', 'administration épargnée : ' + path);
}
ok(localizeCatNames(null, 'en', '/x') === null && localizeCatNames('x', 'en', '/x') === 'x', 'valeurs simples acceptées');
process.exit(fail ? 1 : 0);
