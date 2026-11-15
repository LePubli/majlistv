// Chaînes TV en direct dans l'application : en tête de l'écran « En direct », lecteur YouTube vérifié, textes.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { DICT } from '../src/lib/i18n';

const read = (p: string) => readFileSync(join(__dirname, '..', p), 'utf8');

test('écran « TV en direct » (indépendant des événements), lecteur YouTube vérifié', () => {
  const c = read('src/components/LiveChannels.tsx');
  assert.match(c, /api\.get<\{ channels: LiveChannel\[\] \}>\('\/live'\)/);
  assert.match(c, /validEmbedId\('youtube', c\.video\.ref\)/);
  assert.match(c, /<ExternalVideo key=\{c\.id\} kind="youtube"/);
  assert.doesNotMatch(read('src/app/events/index.tsx'), /LiveChannels/);
  assert.match(read('src/app/live.tsx'), /<LiveChannels empty=/);
  // Étape N1 (15/11) : « En direct » est dans le Catalogue, plus dans le menu ☰.
  const dr = read('src/components/MenuDrawer.tsx');
  assert.doesNotMatch(dr, /nav\('\/live'\)/);
  assert.doesNotMatch(dr, /nav\('\/events'\)/);
  assert.match(read('src/lib/menus.ts'), /live: \{ pathname: '\/live', icon: 'tv', feat: 'livetv' \}/);
  for (const l of ['fr', 'en', 'ar'] as const) for (const k of ['lv.nav', 'lv.intro', 'lv.hubIntro', 'lv.title', 'lv.live', 'lv.notLive']) assert.ok((DICT[l] as Record<string, string>)[k], `${k} (${l})`);
});

test('étape N1 : « En direct » dans le Catalogue (TV + événements)', () => {
  const cat = read('src/app/(tabs)/talks.tsx');
  assert.match(cat, /const liveHref = feat\('livetv'\) \? '\/live' : feat\('events'\) \? '\/events' : null;/);
  assert.match(cat, /onPress=\{\(\) => router\.push\(liveHref\)\}/);
  assert.match(cat, /chevron-left' : 'chevron-right'/, 'flèche dans le bon sens en arabe');
  const live = read('src/app/live.tsx');
  assert.match(live, /<ScreenHeader title=\{t\('lv\.live'\)\} \/>/);
  assert.match(live, /\{events \? \(\s*<EventsBand gutter=\{0\} empty=/);
  const band = read('src/components/HomeBands.tsx');
  assert.match(band, /export function EventsBand\(\{ gutter = GUTTER, empty = null \}/);
  assert.match(band, /if \(!on\) return null;\n  if \(items\.length === 0\) return list\.loading && !list\.data \? null : <>\{empty\}<\/>;/);
  // l'arabe ne confond plus la TV et les événements
  assert.notEqual(DICT.ar['lv.nav' as keyof typeof DICT.ar], DICT.ar['evn.nav' as keyof typeof DICT.ar]);
});
