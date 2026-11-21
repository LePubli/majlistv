// Lot 3b — réglages par extrait (nom, vitesse, opacité, couleur) : montage, plan et rendu réel avec FFmpeg.
// Lancer depuis api/ : node tests/test_clip_looks.mjs   (le worker a besoin des modules de api/ : ln -s ../api/node_modules ../worker/node_modules)
process.env.DATABASE_URL ||= 'postgres://x:x@127.0.0.1:1/x';
process.env.JWT_SECRET ||= 'test-test-test-test-test-test-test';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const { buildPlan, tempoFilters, lookFilters } = await import('../src/modules/editor/plan.js');
const { checkTimeline, editedDuration, isEdited } = await import('../src/modules/editor/timeline.js');
const { layout, mapItems } = await import('../src/modules/editor/dress.js');
const tm = await import('../src/modules/editor/timemap.js');
const ops = await import('../../web/modules/editor/ops.js');
const W = await import('../../worker/src/render.js');

let fails = 0;
const ok = (c, m) => { console.log(`${c ? 'OK  ' : 'FAIL'} ${m}`); if (!c) fails += 1; };
const ff = (args) => execFileSync('ffmpeg', ['-hide_banner', '-v', 'error', '-y', ...args]);
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'looks-'));
const P = (f) => path.join(dir, f);
const probe = (f) => JSON.parse(execFileSync('ffprobe', ['-v', 'error', '-print_format', 'json', '-show_format', '-show_streams', f]).toString());
// Luminance moyenne (0-255) de l'image au temps t.
const luma = (f, t) => Number(execFileSync('ffmpeg', ['-v', 'error', '-ss', String(t), '-i', f, '-frames:v', '1', '-vf', 'scale=64:36,format=gray', '-f', 'rawvideo', '-']).reduce((a, b) => a + b, 0)) / (64 * 36);
const chroma = (f, t) => { const b = execFileSync('ffmpeg', ['-v', 'error', '-ss', String(t), '-i', f, '-frames:v', '1', '-vf', 'scale=64:36,format=rgb24', '-f', 'rawvideo', '-']); let d = 0; for (let i = 0; i < b.length; i += 3) d += Math.max(b[i], b[i + 1], b[i + 2]) - Math.min(b[i], b[i + 1], b[i + 2]); return d / (b.length / 3); };

// --- 1. Montage : rétro-compatible et vérifié
const old = { v: 1, duration: 40, clips: [{ id: 'c1', in: 0, out: 10 }, { id: 'c2', in: 15, out: 30 }] };
const co = checkTimeline(old, 40);
ok(co.ok && JSON.stringify(co.timeline.clips) === JSON.stringify(old.clips), 'ancien montage : identique (aucun champ ajouté)');
const looks = { v: 1, duration: 40, clips: [{ id: 'c1', in: 0, out: 10, name: ' Intro ', speed: 2, opacity: 100, color: { b: 0, c: 0, s: 0 } }, { id: 'c2', in: 15, out: 30, speed: 0.5, opacity: 60, color: { b: 20, c: -10, s: -100 } }] };
const cl = checkTimeline(looks, 40);
ok(cl.ok && cl.timeline.clips[0].name === 'Intro' && cl.timeline.clips[0].speed === 2 && cl.timeline.clips[0].opacity === undefined && cl.timeline.clips[0].color === undefined, 'valeurs neutres effacées, nom nettoyé');
ok(cl.timeline.clips[1].speed === 0.5 && cl.timeline.clips[1].opacity === 60 && cl.timeline.clips[1].color.s === -100, 'réglages gardés');
ok(!checkTimeline({ ...old, clips: [{ id: 'c1', in: 0, out: 10, speed: 9 }] }, 40).ok, 'vitesse hors limites refusée');
ok(!checkTimeline({ ...old, clips: [{ id: 'c1', in: 0, out: 10, opacity: 140 }] }, 40).ok, 'opacité hors limites refusée');
ok(!checkTimeline({ ...old, clips: [{ id: 'c1', in: 0, out: 10, color: { b: 80 } }] }, 40).ok, 'luminosité hors limites refusée');
ok(editedDuration(cl.timeline) === 35, `durée du montage : 10 s ×2 + 15 s ×0,5 = ${editedDuration(cl.timeline)} s (35 attendues)`);
ok(isEdited({ v: 1, duration: 40, clips: [{ id: 'c1', in: 0, out: 40, speed: 2 }] }) && !isEdited({ v: 1, duration: 40, clips: [{ id: 'c1', in: 0, out: 40 }] }), 'une vitesse suffit à rendre le montage « modifié »');

// --- 2. Calculs de temps : API et site pareils
const L = layout(cl.timeline.clips); const Lw = ops.layout(cl.timeline.clips);
ok(L[0].end === 5 && L[1].start === 5 && L[1].end === 35 && Lw[1].end === 35, 'disposition : c1 dure 5 s, c2 de 5 à 35 s (API = site)');
const items = [{ s: 2, e: 4 }, { s: 20, e: 21 }];
const a = mapItems(cl.timeline.clips, items); const b = ops.mapItems(cl.timeline.clips, items);
ok(JSON.stringify(a.map((x) => [x.ts, x.te])) === JSON.stringify(b.map((x) => [x.ts, x.te])) && a[0].ts === 1 && a[0].te === 2 && a[1].ts === 15 && a[1].te === 17, 'sous-titres placés avec la vitesse (API = site)');
const loc = ops.locate(cl.timeline.clips, 10);
ok(Math.abs(loc.src - 17.5) < 1e-9, `lecture à 10 s du montage = 17,5 s de la source (${loc.src})`);
const map = tm.buildMap(cl.timeline);
ok(tm.mapPoint(map, 20).t === 15 && tm.mapPoint(map, 3).t === 1.5 && map.body === 35, 'carte du temps (publication) avec la vitesse');
const inv = tm.inverseMap(map);
ok(Math.abs(tm.mapPoint(inv, 15).t - 20) < 1e-6 && Math.abs(tm.mapPoint(inv, 1.5).t - 3) < 1e-6, 'carte inverse (restaurer l’original) avec la vitesse');

// --- 3. Opérations du site
const sp = ops.splitAt([{ id: 'c1', in: 0, out: 10, speed: 2, name: 'A' }], 2.5);
ok(sp.done && sp.clips[0].out === 5 && sp.clips[1].in === 5 && sp.clips[1].speed === 2 && sp.clips[1].name === 'A' && sp.clips.length === 2, 'couper à 2,5 s (×2) = 5 s de source ; les deux morceaux gardent leurs réglages');
const pc = ops.patchClip(old.clips, 'c1', { speed: 1.5, opacity: 50, color: { b: 10, c: 0, s: 0 }, name: 'Début' });
ok(pc.done && pc.clips[0].speed === 1.5 && pc.clips[0].opacity === 50 && pc.clips[0].color.b === 10 && pc.clips[0].name === 'Début' && pc.clips[1] === old.clips[1], 'régler un extrait');
const pn = ops.patchClip(pc.clips, 'c1', { speed: 1, opacity: 100, color: { b: 0, c: 0, s: 0 }, name: '' });
ok(JSON.stringify(pn.clips[0]) === JSON.stringify(old.clips[0]), 'valeurs neutres : l’extrait redevient « propre »');
ok(!ops.patchClip(old.clips, 'c1', { speed: 1 }).done, 'rien à changer : pas de nouvelle version');
const cr = ops.cutRange([{ id: 'c1', in: 0, out: 10, speed: 2 }], 4, 6);
ok(cr.clips.length === 2 && cr.clips.every((c) => c.speed === 2) && Math.abs(cr.removed - 1) < 1e-9, 'retirer un passage : réglages gardés, durée retirée comptée dans le montage (1 s)');
ok(ops.lookCss({ color: { b: 20, c: -10, s: -100 } }) === 'brightness(1.20) contrast(0.90) saturate(0.00)' && ops.lookCss({}) === 'none', 'filtre CSS de l’aperçu');

// --- 4. Plan FFmpeg
ok(tempoFilters(1).length === 0 && tempoFilters(2).join() === 'atempo=2' && tempoFilters(4).join() === 'atempo=2,atempo=2' && tempoFilters(0.25).join() === 'atempo=0.5,atempo=0.5' && tempoFilters(0.75).join() === 'atempo=0.75', 'atempo enchaîné pour 0,25 à 4');
ok(lookFilters({ color: null, opacity: 100 }).length === 0, 'extrait neutre : aucun filtre ajouté');

// --- 5. Rendu réel : 3 extraits de la source de synthèse
ff(['-f', 'lavfi', '-i', 'testsrc2=size=640x360:rate=25:duration=40', '-f', 'lavfi', '-i', 'sine=frequency=440:sample_rate=48000:duration=40',
  '-c:v', 'libx264', '-preset', 'ultrafast', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-b:a', '128k', '-shortest', P('source.mp4')]);
const tl = checkTimeline({ v: 1, duration: 40, clips: [
  { id: 'a', in: 0, out: 8, speed: 2 },                              // 4 s dans le montage
  { id: 'b', in: 10, out: 14, speed: 0.5 },                          // 8 s
  { id: 'c', in: 20, out: 24, opacity: 0, color: { b: 0, c: 0, s: 0 } }, // 4 s, noir
  { id: 'd', in: 24, out: 28, color: { b: 0, c: 0, s: -100 } },      // 4 s, sans couleur
  { id: 'e', in: 28, out: 32 },                                      // 4 s, normal
] }, 40).timeline;
const plan = buildPlan({ timeline: tl, preview: false, title: 'T' });
ok(plan.total === 24, `durée du montage prévue : ${plan.total} s (24 attendues)`);
ok(plan.summary.parts === 5, `les extraits d, e (même source, aspects différents) ne sont pas regroupés : ${plan.summary.parts} passages`);
const rd = path.join(dir, 'work'); fs.mkdirSync(rd);
const r = await W.renderFiles({ plan, files: { source: P('source.mp4'), curves: {} }, dir: rd, threads: 2, onProgress: () => {} });
const pr = probe(r.out);
ok(Math.abs(Number(pr.format.duration) - 24) < 0.3, `durée du fichier rendu ${Number(pr.format.duration).toFixed(2)} s (24 attendues)`);
const va = pr.streams.find((s) => s.codec_type === 'audio');
ok(Boolean(va) && Math.abs(Number(va.duration) - 24) < 0.3, `son de même durée (${Number(va.duration).toFixed(2)} s)`);
ok(luma(r.out, 14) < 20, `extrait à 0 % d’opacité : image noire (luminance ${luma(r.out, 14).toFixed(1)})`);
ok(luma(r.out, 2) > 40 && luma(r.out, 20) > 40, 'extraits normaux : image visible');
ok(chroma(r.out, 17) < 8 && chroma(r.out, 21) > 20, `saturation −100 : image en gris (couleur ${chroma(r.out, 17).toFixed(1)} contre ${chroma(r.out, 21).toFixed(1)})`);
// Vitesse ×2 sur la mire : à 1 s du montage l'image est celle de la 2e seconde de la source ; on compare au rendu d'un extrait normal.
ff(['-ss', '2', '-i', P('source.mp4'), '-frames:v', '1', '-vf', 'scale=64:36,format=gray', '-f', 'rawvideo', P('ref2.raw')]);
const refRaw = fs.readFileSync(P('ref2.raw'));
const gotRaw = execFileSync('ffmpeg', ['-v', 'error', '-ss', '1', '-i', r.out, '-frames:v', '1', '-vf', 'scale=64:36,format=gray', '-f', 'rawvideo', '-']);
let diff = 0; for (let i = 0; i < refRaw.length; i += 1) diff += Math.abs(refRaw[i] - gotRaw[i]); diff /= refRaw.length;
ok(diff < 12, `vitesse ×2 : à 1 s du montage on voit la 2e seconde de la source (écart ${diff.toFixed(1)})`);
// Fondu enchaîné avec vitesse.
const tl2 = checkTimeline({ v: 1, duration: 40, clips: [{ id: 'a', in: 0, out: 8, speed: 2 }, { id: 'b', in: 12, out: 20, speed: 2 }], dress: { transitions: { all: null, byClip: { b: { type: 'dissolve', len: 1 } } } } }, 40).timeline;
const plan2 = buildPlan({ timeline: tl2, preview: false, title: 'T' });
const r2 = await W.renderFiles({ plan: plan2, files: { source: P('source.mp4'), curves: {} }, dir: rd, threads: 2, onProgress: () => {} });
ok(plan2.total === 8 && Math.abs(Number(probe(r2.out).format.duration) - 8) < 0.3, `fondu enchaîné + vitesse : ${Number(probe(r2.out).format.duration).toFixed(2)} s (8 attendues)`);

console.log(fails ? `\n${fails} échec(s)` : '\nTout est bon');
process.exit(fails ? 1 : 0);
