// Mode d'alerte de prière : silencieux / vibreur / adhan.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ALERT_MODES, DEFAULT_ALERT_MODE, channelFor, contentSound, playSoundInForeground, readAlertMode } from '../src/lib/prayerAlert';
import { APP_DICT } from '../src/lib/i18n';

test('readAlertMode : valeur gardée, sinon adhan (comportement actuel)', () => {
  assert.equal(DEFAULT_ALERT_MODE, 'adhan');
  for (const m of ALERT_MODES) assert.equal(readAlertMode(m), m);
  for (const bad of [null, undefined, '', 'loud', '1']) assert.equal(readAlertMode(bad as never), 'adhan');
});
test('channelFor : un canal par mode ; fichier d’adhan → nouveau canal', () => {
  assert.equal(channelFor('silent'), 'prayer_silent');
  assert.equal(channelFor('vibrate'), 'prayer_vibrate');
  assert.equal(channelFor('adhan', null), 'prayer_adhan');
  assert.equal(channelFor('adhan', 'adhan.mp3'), 'prayer_adhan_s');
});
test('contentSound : aucun son en silencieux/vibreur ; adhan = fichier ou son par défaut', () => {
  assert.equal(contentSound('silent'), false);
  assert.equal(contentSound('vibrate'), false);
  assert.equal(contentSound('adhan', null), true);
  assert.equal(contentSound('adhan', 'adhan.mp3'), 'adhan.mp3');
});
test('playSoundInForeground : seules les prières silencieuses/vibreur sont muettes', () => {
  assert.equal(playSoundInForeground({ kind: 'prayer', mode: 'silent' }), false);
  assert.equal(playSoundInForeground({ kind: 'prayer', mode: 'vibrate' }), false);
  assert.equal(playSoundInForeground({ kind: 'prayer', mode: 'adhan' }), true);
  assert.equal(playSoundInForeground({ kind: 'prayer' }), true); // ancien rappel déjà programmé
  assert.equal(playSoundInForeground({ kind: 'news' }), true);
  assert.equal(playSoundInForeground(null), true);
});
test('textes du mode en FR / EN / AR', () => {
  for (const l of ['fr', 'en', 'ar'] as const) for (const k of ['np.mode', 'np.modeSilent', 'np.modeVibrate', 'np.modeAdhan', 'np.modeHelp', 'np.modeIos']) {
    assert.ok((APP_DICT as Record<string, Record<string, string>>)[l]?.[k], `${l} ${k}`);
  }
});
