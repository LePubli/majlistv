// Amélioration 6.9 : recherche de l'administration (écrans, textes FR/EN/AR de la suppression en lot). node tests/test_admin_search.mjs
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { matchScreens, norm } from '../lib/adminSearch.js';
const r = (p) => readFileSync(new URL(p, import.meta.url), 'utf8');
const screens = [{ href: '/admin?tab=ads', label: 'Publicités', group: 'Catalogue' }, { href: '/admin?tab=users', label: 'Utilisateurs', group: 'Pilotage' }, { href: '/admin?tab=audit', label: 'Journal des actions', group: 'Sécurité' }];
assert.equal(norm('  Évènement '), '  evenement ');
assert.deepEqual(matchScreens(screens, 'pub').map((s) => s.href), ['/admin?tab=ads'], 'pub -> Publicités');
assert.deepEqual(matchScreens(screens, 'PUBLICITES').map((s) => s.href), ['/admin?tab=ads'], 'sans accent ni majuscule');
assert.deepEqual(matchScreens(screens, 'securite').map((s) => s.href), ['/admin?tab=audit'], 'recherche aussi par groupe');
assert.equal(matchScreens(screens, '').length, 3, 'saisie vide = tous les écrans');
assert.equal(matchScreens(screens, 'zzz').length, 0, 'aucun résultat');
const i18n = r('../lib/i18n.js');
for (const k of ['bkRemove', 'bkDeleteConfirm', 'bkDeleted', 'bkNotDeleted']) assert.equal(i18n.split(`${k}:`).length - 1, 3, `texte ${k} manquant en fr / en / ar`);
assert.ok(r('../components/AdminShell.js').includes('AdminPalette'), 'palette montée dans l\'administration');
assert.ok(r('../app/studio/contents/page.js').includes('/talks/bulk-delete'), 'suppression en lot dans Studio');
assert.ok(r('../app/admin/page.js').includes('/admin/users/bulk-role'), 'rôle en lot dans Utilisateurs');
console.log('OK  admin search');
