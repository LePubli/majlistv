// Reprise de lecture : cadence d'envoi, pas de doublon, pas d'envoi pour un aperçu, reprise de départ, durées.
import test from 'node:test';
import assert from 'node:assert/strict';
import { ProgressTracker, resumeStartMs } from '../src/lib/progress';
import { formatClock, formatDuration, percent } from '../src/lib/format';

function setup(opts: { enabled?: boolean; fail?: boolean } = {}) {
  let t = 1_000_000;
  const sent: { positionMs: number; durationMs: number }[] = [];
  const tr = new ProgressTracker(async (p) => { if (opts.fail) throw new Error('réseau'); sent.push(p); }, { intervalMs: 10000, enabled: opts.enabled, now: () => t });
  return { tr, sent, tick: (ms: number) => { t += ms; } };
}
const settle = () => new Promise((r) => setTimeout(r, 5));

test('envoie au plus toutes les 10 s pendant la lecture', async () => {
  const { tr, sent, tick } = setup();
  tr.update(12_000, 60_000, true); await settle();           // premier envoi
  tick(3000); tr.update(15_000, 60_000, true); await settle(); // trop tôt
  tick(8000); tr.update(23_000, 60_000, true); await settle(); // 11 s après le premier : envoi
  assert.deepEqual(sent.map((s) => s.positionMs), [12_000, 23_000]);
  assert.equal(sent[0].durationMs, 60_000);
});

test('à la pause : envoi immédiat de la dernière position, une seule fois', async () => {
  const { tr, sent, tick } = setup();
  tr.update(20_000, 60_000, true); await settle();
  tick(2000); tr.update(22_000, 60_000, true); await settle(); // pas envoyé (trop tôt)
  await tr.flush();
  await tr.flush(); // doublon ignoré
  assert.deepEqual(sent.map((s) => s.positionMs), [20_000, 22_000]);
});

test('désactivé (visiteur, aperçu) : rien n’est envoyé', async () => {
  const { tr, sent } = setup({ enabled: false });
  tr.update(30_000, 60_000, true); await tr.flush(); await settle();
  assert.equal(sent.length, 0);
  tr.setEnabled(true); await tr.flush();
  assert.equal(sent.length, 1);
});

test('premières secondes non enregistrées ; position inchangée non renvoyée', async () => {
  const { tr, sent } = setup();
  tr.update(400, 60_000, false); await tr.flush();
  assert.equal(sent.length, 0);
  tr.update(7000, 60_000, false); await tr.flush(); await tr.flush();
  assert.equal(sent.length, 1);
});

test('erreur réseau : pas de plantage, nouvel essai au prochain envoi', async () => {
  const { tr, sent } = setup({ fail: true });
  tr.update(20_000, 60_000, false);
  await tr.flush(); // échoue en silence
  assert.equal(sent.length, 0);
});

test('durée inconnue (0) : conserve la dernière durée connue', async () => {
  const { tr, sent } = setup();
  tr.update(10_000, 90_000, false); await tr.flush();
  tr.update(20_000, 0, false); await tr.flush();
  assert.deepEqual(sent.map((s) => s.durationMs), [90_000, 90_000]);
});

test('resumeStartMs : ignore < 5 s et les 10 dernières secondes', () => {
  assert.equal(resumeStartMs(undefined, 600), 0);
  assert.equal(resumeStartMs(4000, 600), 0);
  assert.equal(resumeStartMs(1_563_000, 2520), 1_563_000);
  assert.equal(resumeStartMs(2_515_000, 2520), 0);
  assert.equal(resumeStartMs(50_000, null), 50_000);
});

test('formatClock / formatDuration / percent', () => {
  assert.equal(formatClock(1564), '26:04');
  assert.equal(formatClock(3725), '1:02:05');
  assert.equal(formatClock(-5), '0:00');
  assert.equal(formatClock(NaN), '0:00');
  assert.equal(formatDuration(2520), '42 min');
  assert.equal(formatDuration(3900), '1 h 05');
  assert.equal(formatDuration(7200), '2 h');
  assert.equal(formatDuration(20), '1 min');
  assert.equal(formatDuration(null), '');
  assert.equal(percent(1_563_000, 2_520_000), 62);
  assert.equal(percent(5, 0), 0);
  assert.equal(percent(9_999_999, 100), 100);
});
