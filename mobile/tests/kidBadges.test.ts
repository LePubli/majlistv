// Badges enfants dessinés : chaque badge du catalogue a son image dans l'application et son SVG sur le site.
import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { BADGE_CODES } from '../src/lib/kids';

test('chaque badge a un PNG dans assets/badges (256 px) et le même code que le site', () => {
  for (const c of BADGE_CODES) {
    const f = join(__dirname, '../assets/badges', `${c}.png`);
    assert.ok(existsSync(f), `${c}.png manquant`);
    const b = readFileSync(f);
    assert.equal(b.readUInt32BE(16), 256, `${c}.png : largeur`);
    assert.equal(b.readUInt32BE(20), 256, `${c}.png : hauteur`);
  }
  const src = readFileSync(join(__dirname, '../src/lib/kidBadges.ts'), 'utf8');
  for (const c of BADGE_CODES) assert.ok(src.includes(`${c}: require('../../assets/badges/${c}.png')`), `${c} non relié`);
});

test('chaque badge a son SVG sur le site (web/public/kids/badges)', () => {
  const dir = join(__dirname, '../../web/public/kids/badges');
  if (!existsSync(dir)) return; // dépôt réduit à mobile/
  for (const c of BADGE_CODES) assert.ok(existsSync(join(dir, `${c}.svg`)), `${c}.svg manquant`);
});
