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
  const dr = read('src/components/MenuDrawer.tsx');
  assert.match(dr, /\{ key: 'live', label: t\('lv\.nav'\), icon: 'tv', go: nav\('\/live'\), on: feat\('livetv'\) \}/);
  assert.match(dr, /\{ key: 'events', label: t\('evn\.nav'\), icon: 'bell', go: nav\('\/events'\), on: feat\('events'\) \}/);
  assert.match(read('src/lib/menus.ts'), /live: \{ pathname: '\/live', icon: 'tv', feat: 'livetv' \}/);
  for (const l of ['fr', 'en', 'ar'] as const) for (const k of ['lv.nav', 'lv.intro', 'lv.title', 'lv.live', 'lv.notLive']) assert.ok((DICT[l] as Record<string, string>)[k], `${k} (${l})`);
});
