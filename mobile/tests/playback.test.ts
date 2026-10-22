// Choix de la source de lecture, vitesses, chapitre en cours, langues.
import test from 'node:test';
import assert from 'node:assert/strict';
import { currentChapter, nextSpeed, pickSource, platformName, SPEEDS } from '../src/lib/playback';
import { DICT, DIR, LOCALES, pickLocale, translate } from '../src/lib/i18n';
import { gradientFor } from '../src/lib/theme';
import type { Talk } from '../src/lib/types';

const base = { id: 'a1', title: 'T', speaker: 'S', access: 'free', description: '' } as const;
const API = 'https://api.test';

test('vidéo envoyée, abonné : HLS + audio seul, adresses complètes', () => {
  const s = pickSource({ ...base, source: 'upload', hlsPath: '/hls/a1/master.m3u8?t=tok', audioPath: '/hls/a1/audio/index.m3u8?t=tok' } as Talk, API);
  assert.equal(s.uri, 'https://api.test/hls/a1/master.m3u8?t=tok');
  assert.equal(s.audioUri, 'https://api.test/hls/a1/audio/index.m3u8?t=tok');
  assert.equal(s.external, false);
  assert.equal(s.notReady, false);
});

test('vidéo envoyée sans audio : audioUri vide ; pas encore convertie : notReady', () => {
  assert.equal(pickSource({ ...base, source: 'upload', hlsPath: '/hls/a1/master.m3u8?t=x' } as Talk, API).audioUri, null);
  assert.equal(pickSource({ ...base, source: 'upload' } as Talk, API).notReady, true);
  assert.equal(pickSource({ ...base, source: 'upload', videoUrl: 'https://s3/x.mp4' } as Talk, API).uri, 'https://s3/x.mp4');
});

test('archive.org : fichier public lu directement ; YouTube / Vimeo : externe', () => {
  assert.equal(pickSource({ ...base, source: 'archive', fileUrl: 'https://archive.org/download/x/y.mp4' } as Talk, API).uri, 'https://archive.org/download/x/y.mp4');
  const yt = pickSource({ ...base, source: 'youtube' } as Talk, API);
  assert.equal(yt.external, true);
  assert.equal(yt.uri, null);
  assert.equal(platformName('youtube'), 'YouTube');
  assert.equal(platformName('vimeo'), 'Vimeo');
});

test('YouTube / Vimeo avec identifiant valide : lecteur intégré ; identifiant douteux : repli', () => {
  const yt = pickSource({ ...base, source: 'youtube', video_ref: 'dQw4w9WgXcQ' } as Talk, API);
  assert.deepEqual(yt.embed, { kind: 'youtube', id: 'dQw4w9WgXcQ' });
  assert.equal(yt.external, false);
  assert.deepEqual(pickSource({ ...base, source: 'vimeo', video_ref: '76979871' } as Talk, API).embed, { kind: 'vimeo', id: '76979871' });
  const bad = pickSource({ ...base, source: 'youtube', video_ref: "x');evil()" } as Talk, API);
  assert.equal(bad.embed, null);
  assert.equal(bad.external, true);
});

test('vitesses : cycle complet et retour au début', () => {
  let s = 1;
  const seen: number[] = [];
  for (let i = 0; i < SPEEDS.length; i++) { s = nextSpeed(s); seen.push(s); }
  assert.deepEqual(seen, [1.25, 1.5, 2, 0.75, 1]);
  assert.equal(nextSpeed(3), 1.25); // valeur inconnue : repart de la liste
});

test('chapitre en cours', () => {
  const ch = [{ s: 0 }, { s: 60_000 }, { s: 300_000 }];
  assert.equal(currentChapter(ch, 0), 0);
  assert.equal(currentChapter(ch, 61_000), 1);
  assert.equal(currentChapter(ch, 999_999), 2);
  assert.equal(currentChapter([], 5), -1);
  assert.equal(currentChapter([{ s: 10_000 }], 5), -1);
});

test('langues : mêmes clés partout, mêmes variables {x}, sens d’écriture', () => {
  const keys = Object.keys(DICT.fr).sort();
  for (const l of ['en', 'ar'] as const) {
    assert.deepEqual(Object.keys(DICT[l]).sort(), keys, `clés de ${l}`);
    for (const k of keys) {
      const vars = (s: string) => (s.match(/\{\w+\}/g) || []).sort().join();
      assert.equal(vars(DICT[l][k as keyof typeof DICT.fr]), vars(DICT.fr[k as keyof typeof DICT.fr]), `variables de ${l}.${k}`);
      assert.ok(DICT[l][k as keyof typeof DICT.fr].trim().length > 0, `${l}.${k} vide`);
    }
  }
  assert.equal(DIR.ar, 'rtl');
  assert.equal(DIR.fr, 'ltr');
  assert.deepEqual(Object.keys(LOCALES), ['fr', 'en', 'ar']);
});

test('translate et pickLocale', () => {
  assert.equal(translate('fr', 'talk.resumeAt', { time: '26:04' }), 'Reprendre à 26:04');
  assert.equal(translate('en', 'talk.preview', { min: 2 }), '2-minute preview');
  assert.equal(pickLocale('ar-SA'), 'ar');
  assert.equal(pickLocale('fr_FR'), 'fr');
  assert.equal(pickLocale('de'), 'fr');
  assert.equal(pickLocale(undefined), 'fr');
});

test('dégradé de repli : stable pour une même conférence', () => {
  assert.deepEqual(gradientFor('abc'), gradientFor('abc'));
  assert.equal(gradientFor('abc').length, 2);
});
