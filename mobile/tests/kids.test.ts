// 22b-9a : logique pure de l'espace enfant natif + cohérence des textes et des écrans.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  AVATARS, AVATAR_EMOJI, BANDS, KC, KID_RENEW_AFTER_MS, ageFilter, avatarEmoji, bandKey, exitMessage, isKidExpired, isTimeUp, leftMin, needsRenew,
  parseKidSession, progressBody, resolveShelves, rubricName, searchTerm, serializeKidSession, shelfTitle, validPin,
} from '../src/lib/kids';
import { APP_DICT, DICT, translate } from '../src/lib/i18n';
import { ApiError, createApi } from '../src/lib/api';
import type { KidCard, KidRubric, KidShelf } from '../src/lib/types';

const t = (k: string, v?: Record<string, string | number>) => translate('fr', k as never, v);
const card = (id: string, band: string, extra: Partial<KidCard> = {}): KidCard => ({ id, title: id, speaker: null, access: 'free', source: 'upload', kidsBands: [band], durationSeconds: 600, completed: false, positionMs: 0, rubricIds: [], stars: null, posterUrl: null, ...extra });

test('code parental : 4 à 6 chiffres', () => {
  for (const ok of ['1234', '12345', '123456', '0000']) assert.equal(validPin(ok), true, ok);
  for (const bad of ['', '123', '1234567', '12a4', ' 1234', '12.4']) assert.equal(validPin(bad), false, bad);
});

test('avatars et tranches d\'âge (mêmes que le serveur)', () => {
  assert.deepEqual([...AVATARS], ['lion', 'owl', 'fox', 'turtle', 'rabbit', 'bear', 'camel', 'star']);
  for (const a of AVATARS) assert.ok(AVATAR_EMOJI[a]);
  assert.equal(avatarEmoji('inconnu'), '⭐');
  assert.deepEqual([...BANDS], ['3-6', '7-10', '11-14']);
  assert.equal(t(bandKey('3-6')), '3-6 ans'.length ? t('kdBand36') : '');
  for (const b of BANDS) for (const l of ['fr', 'en', 'ar'] as const) assert.ok(DICT[l][bandKey(b)], `${l} ${b}`);
});

test('session enfant : lecture sûre, jamais de plantage', () => {
  const s = { token: 'abc', profile: { id: 'p1', name: 'Yacine', avatar: 'fox', band: '7-10' }, issuedAt: 1000 };
  assert.deepEqual(parseKidSession(serializeKidSession(s)), s);
  for (const bad of [null, '', 'pas du json', '{}', '{"token":"x"}', '{"token":"","profile":{"id":"a","name":"b"}}', '{"token":"x","profile":{"id":1,"name":"b"}}']) assert.equal(parseKidSession(bad), null, String(bad));
  assert.equal(parseKidSession('{"token":"x","profile":{"id":"a","name":"b"}}')?.profile.avatar, 'star', 'avatar par défaut');
});

test('renouvellement du jeton enfant (12 h côté serveur, renouvelé avant)', () => {
  const s = { token: 't', profile: { id: 'p', name: 'n', avatar: 'lion', band: '3-6' }, issuedAt: 0 };
  assert.equal(needsRenew(s, KID_RENEW_AFTER_MS - 1), false);
  assert.equal(needsRenew(s, KID_RENEW_AFTER_MS), true);
  assert.ok(KID_RENEW_AFTER_MS < 12 * 3600_000);
});

test('temps restant', () => {
  assert.equal(leftMin(null), null);
  assert.equal(leftMin({ limitMin: null, usedSec: 0, leftSec: null, timeUp: false }), null);
  assert.equal(leftMin({ limitMin: 30, usedSec: 100, leftSec: 1700, timeUp: false }), 29, 'arrondi au-dessus');
  assert.equal(leftMin({ limitMin: 30, usedSec: 1800, leftSec: 0, timeUp: true }), 0);
});

test('reprise : rien avant 5 s, durée facultative', () => {
  assert.equal(progressBody(4.9, 100), null);
  assert.deepEqual(progressBody(5, 100), { positionMs: 5000, durationMs: 100000 });
  assert.deepEqual(progressBody(61.26, 0), { positionMs: 61260, durationMs: 0 });
  assert.equal(progressBody(NaN, 10), null);
});

test('recherche : 2 lettres au moins', () => {
  assert.equal(searchTerm(' a '), null);
  assert.equal(searchTerm(' ab '), 'ab');
  assert.equal(searchTerm('x'.repeat(200))?.length, 80);
});

test('rangées : titres, résolution, filtre d\'âge', () => {
  const rubrics: KidRubric[] = [{ id: 7, slug: 'histoires', names: { fr: 'Histoires', en: 'Stories' }, emoji: '📖', position: 1 }];
  const ctx = { t, rubrics, locale: 'fr' };
  assert.equal(shelfTitle({ kind: 'resume', ids: [] }, ctx), t('kdContinue'));
  assert.equal(shelfTitle({ kind: 'new', ids: [] }, ctx), 'Nouveautés');
  assert.equal(shelfTitle({ kind: 'age', ids: [] }, ctx), 'Pour ton âge');
  assert.equal(shelfTitle({ kind: 'popular', ids: [] }, ctx), 'Les plus regardés');
  assert.equal(shelfTitle({ kind: 'because', ids: [], basedOn: { id: 'x', title: 'Le Prophète' } }, ctx), 'Parce que tu as aimé « Le Prophète »');
  assert.equal(shelfTitle({ kind: 'rubric', rubricId: 7, ids: [] }, ctx), '📖 Histoires');
  assert.equal(shelfTitle({ kind: 'rubric', rubricId: 7, ids: [] }, { ...ctx, locale: 'ar' }), '📖 Histoires', 'repli sur le français');
  assert.equal(shelfTitle({ kind: 'rubric', rubricId: 99, ids: [] }, ctx), '');
  assert.equal(rubricName(rubrics[0], 'en'), 'Stories');

  const talks = [card('a', '3-6'), card('b', '7-10'), card('c', '7-10')];
  const shelves: KidShelf[] = [{ kind: 'new', ids: ['a', 'b', 'zzz'] }, { kind: 'age', ids: ['zzz'] }, { kind: 'popular', ids: ['c'] }];
  const all = resolveShelves(shelves, talks, false, '7-10');
  assert.deepEqual(all.map((r) => [r.shelf.kind, r.items.map((x) => x.id)]), [['new', ['a', 'b']], ['popular', ['c']]], 'identifiants inconnus et rangées vides retirés');
  const mine = resolveShelves(shelves, talks, true, '7-10');
  assert.deepEqual(mine.map((r) => [r.shelf.kind, r.items.map((x) => x.id)]), [['new', ['b']], ['popular', ['c']]]);
  assert.deepEqual(ageFilter(talks, true, '3-6').map((x) => x.id), ['a']);
  assert.equal(ageFilter(talks, false, '3-6').length, 3);
});

test('messages de sortie (code parental)', () => {
  assert.equal(exitMessage(null, t), '');
  assert.equal(exitMessage({ code: 'bad_pin', data: { left: 3 } }, t), 'Ce n\'est pas le bon code. Il reste 3 essai(s).');
  assert.equal(exitMessage({ code: 'locked', message: 'Trop d\'essais : réessayez dans 7 min' }, t), 'Trop d\'essais. Réessaie dans 7 min.');
  assert.equal(exitMessage({ code: 'locked', message: '' }, t), 'Trop d\'essais. Réessaie dans 10 min.');
  assert.equal(exitMessage({ status: 0 }, t), t('errGeneric'));
  assert.equal(isKidExpired({ status: 401 }), true); assert.equal(isKidExpired({ code: 'kid_expired' }), true); assert.equal(isKidExpired({ status: 500 }), false);
  assert.equal(isTimeUp({ code: 'kid_time_up' }), true); assert.equal(isTimeUp(null), false);
});

test('ApiError garde le corps de la réponse (essais restants du code parental)', async () => {
  const fetchImpl = (async () => new Response(JSON.stringify({ error: 'Code incorrect', code: 'bad_pin', left: 2 }), { status: 403, headers: { 'content-type': 'application/json' } })) as typeof fetch;
  const api = createApi({ baseUrl: 'https://x.test', getToken: () => 'k', fetchImpl });
  await assert.rejects(() => api.post('/kids/exit', { code: '1' }), (e: unknown) => e instanceof ApiError && e.status === 403 && e.code === 'bad_pin' && e.data?.left === 2);
});

test('couleurs : bleu nuit et or vif de l\'espace Kids (inchangées)', () => {
  assert.equal(KC.bg, '#0A1038'); assert.equal(KC.accent, '#FFC83D'); assert.equal(KC.text, '#F6F7FF');
});

test('textes : toutes les clés utilisées existent en fr / en / ar', () => {
  const keys = ['kdWho', 'kdTitle', 'kdHello', 'kdPinFirst', 'kdPinNew', 'kdPinSave', 'kdPinTitle', 'kdPinHelp', 'kdExitTitle', 'kdExitHelp', 'kdExitBad', 'kdExitLocked', 'kdLeave', 'kdOk', 'kdCancel',
    'kdAdd', 'kdCreate', 'kdName', 'kdAvatar', 'kdBand', 'kdBandsHelp', 'kdDuplicate', 'kdLimitReached', 'kdLimitUpgrade', 'kdDeleteConfirm', 'kdNoProfile', 'kdNeedLogin', 'kdNeedSub', 'kdUnavailable',
    'kdContinue', 'kdEmpty', 'kdSeen', 'kdTimeLeft', 'kdTimeLow', 'kdTimeUpTitle', 'kdTimeUpText', 'kdAbout', 'kdNext', 'kdBack', 'kdUnavailableTalk', 'kdHide',
    'kcSearchLabel', 'kcSearchPh', 'kcAll', 'kcOnlyMyAge', 'kcNothing', 'kcResults', 'kcNew', 'kcAge', 'kcPopular', 'kcBecause',
    'kids.pinConfirm', 'kids.pinMismatch', 'kids.delete', 'kids.done', 'kids.subscribe', 'kids.enter', 'kids.lockHint'];
  for (const l of ['fr', 'en', 'ar'] as const) for (const k of keys) assert.ok((DICT[l] as Record<string, string>)[k], `${l} ${k}`);
  for (const l of ['fr', 'en', 'ar'] as const) for (const k of ['kids.pinConfirm', 'kids.lockHint']) assert.ok((APP_DICT[l] as Record<string, string>)[k]);
});

test('écrans de l\'espace enfant présents et déclarés', () => {
  const root = join(__dirname, '..', 'src', 'app');
  for (const f of ['kids/_layout.tsx', 'kids/index.tsx', 'kids/home.tsx', 'kids/exit.tsx', 'kids/watch/[id].tsx']) assert.ok(existsSync(join(root, f)), f);
  const layout = readFileSync(join(root, '_layout.tsx'), 'utf8');
  assert.match(layout, /<Stack\.Screen name="kids" \/>/); assert.match(layout, /<KidProvider>/); assert.match(layout, /<KidLock \/>/);
  const kl = readFileSync(join(root, 'kids', '_layout.tsx'), 'utf8');
  assert.match(kl, /hardwareBackPress/, 'bouton retour d\'Android verrouillé dans l\'espace enfant');
  // L'espace enfant n'embarque ni téléchargement, ni diffusion, ni incrustation.
  const watch = readFileSync(join(root, 'kids', 'watch', '[id].tsx'), 'utf8');
  assert.doesNotMatch(watch, /CastBridge|DownloadSheet|startPictureInPicture/); assert.match(watch, /allowsPictureInPicture=\{false\}/);
});
