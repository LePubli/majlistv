// Chaînes TV en direct dans l'application : en tête de l'écran « En direct », lecteur YouTube vérifié, textes.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { DICT } from '../src/lib/i18n';

const read = (p: string) => readFileSync(join(__dirname, '..', p), 'utf8');

test('écran « En direct » : chaînes en tête, lecteur YouTube vérifié', () => {
  const c = read('src/components/LiveChannels.tsx');
  assert.match(c, /api\.get<\{ channels: LiveChannel\[\] \}>\('\/live'\)/);
  assert.match(c, /validEmbedId\('youtube', c\.video\.ref\)/);
  assert.match(c, /<ExternalVideo key=\{c\.id\} kind="youtube"/);
  const s = read('src/app/events/index.tsx');
  assert.match(s, /<LiveChannels \/>/);
  assert.match(read('src/components/MenuDrawer.tsx'), /on: feat\('events'\) \|\| feat\('livetv'\)/);
  for (const l of ['fr', 'en', 'ar'] as const) for (const k of ['lv.title', 'lv.live', 'lv.notLive']) assert.ok((DICT[l] as Record<string, string>)[k], `${k} (${l})`);
});
