// 22b-10 : logique pure de la diffusion (Chromecast / AirPlay) + cohérence de la configuration.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { canCast, castRequest, resumeSeconds, HLS_CONTENT_TYPE } from '../src/lib/cast';
import { APP_DICT } from '../src/lib/i18n';

const base = { uri: 'https://api.example.org/hls/x/master.m3u8?t=abc', embed: null, external: false, notReady: false };

test('canCast : seulement une vidéo https lue par le lecteur natif', () => {
  assert.equal(canCast(base), true);
  assert.equal(canCast({ ...base, uri: null }), false);
  assert.equal(canCast({ ...base, embed: { kind: 'youtube', id: 'abcdefghijk' } }), false);
  assert.equal(canCast({ ...base, external: true }), false);
  assert.equal(canCast({ ...base, notReady: true }), false);
  assert.equal(canCast({ ...base, uri: 'file:///data/user/0/x/video.mp4' }), false, 'fichier téléchargé : le téléviseur ne peut pas le lire');
  assert.equal(canCast({ ...base, uri: 'http://api.example.org/a.m3u8' }), false, 'http refusé');
});

test('castRequest : flux HLS, position, métadonnées', () => {
  const r = castRequest({ uri: base.uri, title: 'Titre', speaker: 'Intervenant', posterUrl: 'https://img.example.org/p.jpg', startSec: 125.9, durationSec: 3600 });
  assert.equal(r.mediaInfo.contentUrl, base.uri);
  assert.equal(r.mediaInfo.contentType, HLS_CONTENT_TYPE);
  assert.equal(r.mediaInfo.contentType, 'application/x-mpegURL');
  assert.equal(r.mediaInfo.streamType, 'BUFFERED');
  assert.equal(r.startTime, 125);
  assert.equal(r.autoplay, true);
  assert.equal(r.mediaInfo.streamDuration, 3600);
  assert.equal(r.mediaInfo.metadata.title, 'Titre');
  assert.equal(r.mediaInfo.metadata.subtitle, 'Intervenant');
  assert.deepEqual(r.mediaInfo.metadata.images, [{ url: 'https://img.example.org/p.jpg' }]);
});

test('castRequest : valeurs absentes ou invalides', () => {
  const r = castRequest({ uri: base.uri, title: 'T', startSec: NaN });
  assert.equal(r.startTime, 0);
  assert.equal('streamDuration' in r.mediaInfo, false);
  assert.equal('subtitle' in r.mediaInfo.metadata, false);
  assert.deepEqual(r.mediaInfo.metadata.images, []);
  assert.deepEqual(castRequest({ uri: base.uri, title: 'T', startSec: -5, posterUrl: 'http://x/p.jpg' }).mediaInfo.metadata.images, []);
  assert.equal(castRequest({ uri: base.uri, title: 'T', startSec: -5 }).startTime, 0);
});

test('resumeSeconds : reprise sur le téléphone', () => {
  assert.equal(resumeSeconds(300.5, 10, 3600), 300.5);
  assert.equal(resumeSeconds(null, 42, 3600), 42, 'pas de position du téléviseur : celle d\'avant');
  assert.equal(resumeSeconds(NaN, 42, 3600), 42);
  assert.equal(resumeSeconds(-3, 42, 3600), 42);
  assert.equal(resumeSeconds(9999, 0, 3600), 3599, 'jamais au-delà de la fin');
  assert.equal(resumeSeconds(50, 0, 0), 50, 'durée inconnue');
});

test('configuration : plugin Cast, récepteur par défaut, textes fr/en/ar', () => {
  const app = JSON.parse(readFileSync(join(__dirname, '..', 'app.json'), 'utf8')).expo;
  const plugin = app.plugins.find((p: unknown) => Array.isArray(p) && p[0] === 'react-native-google-cast');
  assert.ok(plugin, 'plugin react-native-google-cast déclaré');
  assert.equal(plugin[1].receiverAppId, 'CC1AD845', 'récepteur multimédia par défaut de Google');
  assert.ok(app.ios.infoPlist.NSBonjourServices.includes('_googlecast._tcp'));
  assert.ok(app.ios.infoPlist.NSLocalNetworkUsageDescription);
  const pkg = JSON.parse(readFileSync(join(__dirname, '..', 'package.json'), 'utf8'));
  assert.ok(pkg.dependencies['react-native-google-cast']);
  for (const l of ['fr', 'en', 'ar'] as const) {
    for (const k of ['cast.tile', 'cast.tileAirplay', 'cast.on'] as const) assert.ok(APP_DICT[l][k], `${l} ${k}`);
    assert.match(APP_DICT[l]['cast.on'], /\{device\}/);
  }
  const notes = JSON.parse(readFileSync(join(__dirname, '..', 'release-notes.json'), 'utf8'));
  assert.ok(notes.fr && notes.en && notes.ar);
});
