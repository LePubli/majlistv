// Mode d'alerte de prière : silencieux / vibreur / adhan.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ALERT_MODES, DEFAULT_ALERT_MODE, channelFor, contentSound, pickAdhan, playSoundInForeground, readAlertMode } from '../src/lib/prayerAlert';
import { APP_DICT } from '../src/lib/i18n';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

test('readAlertMode : valeur gardée, sinon adhan (comportement actuel)', () => {
  assert.equal(DEFAULT_ALERT_MODE, 'adhan');
  for (const m of ALERT_MODES) assert.equal(readAlertMode(m), m);
  for (const bad of [null, undefined, '', 'loud', '1']) assert.equal(readAlertMode(bad as never), 'adhan');
});
test('channelFor : un canal par mode ; fichier d’adhan → nouveau canal', () => {
  assert.equal(channelFor('silent'), 'prayer_silent');
  assert.equal(channelFor('vibrate'), 'prayer_vibrate');
  assert.equal(channelFor('adhan', null), 'prayer_adhan');
  assert.equal(channelFor('adhan', { id: 'makkah', file: 'makkah.mp3' }), 'prayer_adhan_makkah');
});
test('contentSound : aucun son en silencieux/vibreur ; adhan = fichier ou son par défaut', () => {
  assert.equal(contentSound('silent'), false);
  assert.equal(contentSound('vibrate'), false);
  assert.equal(contentSound('adhan', null), true);
  assert.equal(contentSound('adhan', { id: 'makkah', file: 'makkah.mp3' }), 'makkah.mp3');
});
test('playSoundInForeground : seules les prières silencieuses/vibreur sont muettes', () => {
  assert.equal(playSoundInForeground({ kind: 'prayer', mode: 'silent' }), false);
  assert.equal(playSoundInForeground({ kind: 'prayer', mode: 'vibrate' }), false);
  assert.equal(playSoundInForeground({ kind: 'prayer', mode: 'adhan' }), true);
  assert.equal(playSoundInForeground({ kind: 'prayer' }), true); // ancien rappel déjà programmé
  assert.equal(playSoundInForeground({ kind: 'news' }), true);
  assert.equal(playSoundInForeground(null), true);
});
test('pickAdhan : celui choisi, sinon le premier, sinon rien', () => {
  const l = [{ id: 'a', file: 'a.mp3' }, { id: 'b', file: 'b.mp3' }];
  assert.equal(pickAdhan(l, 'b')?.id, 'b');
  assert.equal(pickAdhan(l, 'inconnu')?.id, 'a');
  assert.equal(pickAdhan(l, null)?.id, 'a');
  assert.equal(pickAdhan([], 'a'), null);
});
test('textes du mode en FR / EN / AR', () => {
  for (const l of ['fr', 'en', 'ar'] as const) for (const k of ['np.mode', 'np.modeSilent', 'np.modeVibrate', 'np.modeAdhan', 'np.modeHelp', 'np.modeIos', 'np.adhanChoose', 'np.adhanPreview', 'np.adhanStop']) {
    assert.ok((APP_DICT as Record<string, Record<string, string>>)[l]?.[k], `${l} ${k}`);
  }
});

// 13/11 : « Adhan même en silencieux ou vibreur » (Android) : canaux à part, sur le volume du réveil.
test('adhan même en silencieux : canaux « alarm » à part', () => {
  assert.equal(channelFor('adhan', { id: 'adhan-2', file: 'adhan_2.mp3' }, true), 'prayer_adhan_alarm_adhan-2');
  assert.equal(channelFor('adhan', null, true), 'prayer_adhan_alarm');
  assert.equal(channelFor('adhan', { id: 'adhan-2', file: 'adhan_2.mp3' }), 'prayer_adhan_adhan-2', 'sans l’option : canal d’origine');
  assert.equal(channelFor('vibrate', null, true), 'prayer_vibrate', 'option sans effet hors mode adhan');
  const n = readFileSync(join(__dirname, '..', 'src/lib/notifications.ts'), 'utf8');
  assert.match(n, /usage: Notifications\.AndroidAudioUsage\.ALARM/);
  assert.match(n, /channelFor\(mode, adhan, Platform\.OS === 'android' && !!o\.alarm\)/);
  const ui = readFileSync(join(__dirname, '..', 'src/components/PrayerSettingsPanel.tsx'), 'utf8');
  assert.match(ui, /prayer\.mode === 'adhan' && Platform\.OS === 'android' \?/);
});
