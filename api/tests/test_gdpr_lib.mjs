// Étape 36 — Règles pures RGPD : masquage des secrets, arrêt des abonnements Stripe. Lancer : node tests/test_gdpr_lib.mjs
import assert from 'node:assert/strict';
import { redact, cancelSubscriptions, SENSITIVE_KEY, OWN_COLUMNS, STAFF_COLUMNS, USER_COLUMNS } from '../src/gdpr.js';

let n = 0;
const ok = (c, m) => { assert.ok(c, m); n++; console.log('OK   ' + m); };
const fails = async (fn, re) => { try { await fn(); } catch (e) { return re.test(e.message); } return false; };

const r = redact({ id: 1, title: 'ok', password_hash: 'x', share_token: 't', totp_secret: 's', token_hash: 'h', kids_pin_hash: 'p', code_hash: 'c', recovery_code: 'r', pin: '1234', stripe_customer_id: 'cus_1', mapping: 'm', pinned: true });
ok(r.id === 1 && r.title === 'ok' && r.stripe_customer_id === 'cus_1' && r.mapping === 'm' && r.pinned === true, 'données ordinaires conservées (même celles qui contiennent « pin » dans un mot)');
ok(!('password_hash' in r) && !('share_token' in r) && !('totp_secret' in r) && !('token_hash' in r) && !('kids_pin_hash' in r) && !('code_hash' in r) && !('recovery_code' in r) && !('pin' in r), 'secrets retirés');
ok(SENSITIVE_KEY.test('API_KEY') === false, 'une clé « key » seule n\'est pas confondue avec un secret (aucune colonne de ce nom)');
ok(!USER_COLUMNS.some((c) => SENSITIVE_KEY.test(c)), 'la fiche membre exportée ne contient aucune colonne secrète');
ok(OWN_COLUMNS.includes('user_id') && !STAFF_COLUMNS.includes('user_id') && STAFF_COLUMNS.every((c) => !OWN_COLUMNS.includes(c)), 'colonnes « propriétaires » et colonnes d\'équipe distinctes');

// Abonnements Stripe : tous arrêtés, déjà arrêtés tolérés, autre erreur = refus lisible.
const calls = [];
await cancelSubscriptions({ subscriptions: { cancel: async (id) => { calls.push(id); } } }, ['a', 'b']);
ok(calls.join() === 'a,b', 'chaque abonnement est arrêté');
await cancelSubscriptions({ subscriptions: { cancel: async () => { const e = new Error('No such subscription: sub_x'); e.code = 'resource_missing'; throw e; } } }, ['a']);
ok(true, 'abonnement déjà inexistant chez Stripe : toléré');
await cancelSubscriptions({ subscriptions: { cancel: async () => { throw new Error('This subscription has already been canceled'); } } }, ['a']);
ok(true, 'abonnement déjà arrêté : toléré');
ok(await fails(() => cancelSubscriptions({ subscriptions: { cancel: async () => { throw new Error('network down'); } } }, ['a']), /pas été supprimé/), 'autre erreur : refus lisible, compte non supprimé');
ok(await fails(() => cancelSubscriptions({ subscriptions: { cancel: async (id) => { if (id === 'b') throw new Error('boom'); } } }, ['a', 'b', 'c']), /pas été supprimé/), 'échec au milieu : on s\'arrête');
await cancelSubscriptions({ subscriptions: { cancel: async () => { throw new Error('x'); } } }, []);
ok(true, 'aucun abonnement : rien à faire');
console.log(`\n${n} vérifications réussies`);
