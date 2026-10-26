// Animation du logo au lancement (étape 26) : calendrier cohérent, relais avec la publicité.
import test from 'node:test';
import assert from 'node:assert/strict';
import { MAX_MS, PLAN, REDUCED_PLAN, SKIP_FADE_MS, endOf, type Step } from '../src/lib/intro';
import { endIntro, introEndedAt, introOver, onIntroEnd, resetLaunch } from '../src/lib/launch';

const steps = (Object.entries(PLAN) as [string, number | Step][]).filter(([, s]) => typeof s !== 'number') as [string, Step][];

test('calendrier : chaque étape est dans la durée totale, durées positives', () => {
  for (const [name, s] of steps) { assert.ok(s.at >= 0 && s.dur > 0, name); assert.ok(endOf(s) <= PLAN.total, `${name} dépasse la durée totale`); }
  assert.equal(Math.max(...steps.map(([, s]) => endOf(s))), PLAN.total, 'la dernière étape termine à la durée totale');
});

test('calendrier : l’ordre de la séquence (tracé → remplissage → nom → slogan → zoom → fondu)', () => {
  assert.ok(PLAN.trace.at < PLAN.fill.at);
  assert.ok(PLAN.fill.at < PLAN.name.at && PLAN.name.at < PLAN.tagline.at);
  assert.ok(endOf(PLAN.tagline) <= PLAN.zoom.at, 'le slogan est lu en entier avant le zoom');
  assert.ok(PLAN.zoom.at >= endOf(PLAN.fill) && PLAN.fade.at >= PLAN.zoom.at);
  assert.ok(PLAN.glowOut.at === endOf(PLAN.glowIn) || PLAN.glowOut.at >= endOf(PLAN.glowIn), 'halo : la descente suit la montée (même valeur animée)');
  assert.ok(endOf(PLAN.outlineOut) <= PLAN.zoom.at);
});

test('durées raisonnables : courte, jamais plus que le garde-fou, version réduite plus courte', () => {
  assert.ok(PLAN.total >= 2000 && PLAN.total <= 3500);
  assert.ok(PLAN.total < MAX_MS);
  assert.ok(REDUCED_PLAN.total < PLAN.total && REDUCED_PLAN.hold + REDUCED_PLAN.fade === REDUCED_PLAN.total);
  assert.ok(SKIP_FADE_MS <= 300);
});

test('relais de lancement : la publicité attend la fin de l’animation, une seule fois', () => {
  resetLaunch();
  assert.equal(introOver(), false);
  let calls = 0;
  const off = onIntroEnd(() => { calls++; });
  endIntro(1000); endIntro(2000); // deuxième appel sans effet
  assert.equal(calls, 1); assert.equal(introOver(), true); assert.equal(introEndedAt(), 1000);
  onIntroEnd(() => { calls++; }); // déjà terminée : appel immédiat
  assert.equal(calls, 2);
  off();
  resetLaunch();
  // attente annulée : plus d'appel
  let n = 0; const cancel = onIntroEnd(() => { n++; }); cancel(); endIntro();
  assert.equal(n, 0);
  // un abonné défaillant ne bloque pas les autres
  resetLaunch(); let ok = false; onIntroEnd(() => { throw new Error('x'); }); onIntroEnd(() => { ok = true; }); endIntro();
  assert.equal(ok, true);
  resetLaunch();
});
