// Étape E4a — plan de rendu (API) + moteur du worker, avec le vrai FFmpeg, sur des médias de synthèse.
// Lancer depuis api/ : node tests/test_render_plan.mjs
// Vérifie : durée (intro + montage + fin), taille, fondu au noir au raccord, logo, textes, baisse de la voix d'origine sous la voix
// française, baisse de la musique sous la voix, niveau sonore homogène (LUFS), enveloppes identiques à l'aperçu du site.
process.env.DATABASE_URL ||= 'postgres://x:x@127.0.0.1:1/x';
process.env.JWT_SECRET ||= 'test-test-test-test-test-test-test';
import { execFileSync, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const { buildPlan, envelope, envelopePoints, sampleCurve, MAX_PARTS } = await import('../src/modules/editor/plan.js');
const { checkTimeline } = await import('../src/modules/editor/timeline.js');
const W = await import('../../worker/src/render.js');
const ops = await import('../../web/modules/editor/ops.js');

let fails = 0;
const ok = (c, m) => { console.log(`${c ? 'OK  ' : 'FAIL'} ${m}`); if (!c) fails += 1; };
const ff = (args) => execFileSync('ffmpeg', ['-hide_banner', '-v', 'error', '-y', ...args]);
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'e4plan-'));
const P = (f) => path.join(dir, f);

// --- Médias de synthèse : source 1280x720 (mire + 440 Hz), voix française (1000 Hz dans [5,10] et [20,25]), musique 220 Hz, logo rouge.
ff(['-f', 'lavfi', '-i', 'testsrc2=size=1280x720:rate=25:duration=40', '-f', 'lavfi', '-i', 'sine=frequency=440:sample_rate=48000:duration=40',
  '-c:v', 'libx264', '-preset', 'ultrafast', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-b:a', '128k', '-shortest', P('source.mp4')]);
ff(['-f', 'lavfi', '-i', "aevalsrc='if(between(t,5,10)+between(t,20,25),0.5*sin(2*PI*1000*t),0)':s=48000:d=40", '-c:a', 'aac', '-b:a', '96k', P('dub.m4a')]);
ff(['-f', 'lavfi', '-i', 'sine=frequency=220:sample_rate=44100:duration=12', '-c:a', 'libmp3lame', '-b:a', '128k', P('music.mp3')]);
ff(['-f', 'lavfi', '-i', 'color=c=red:s=200x100:d=1', '-frames:v', '1', P('logo.png')]);

const MUS = '11111111-1111-4111-8111-111111111111';
const raw = {
  v: 1, duration: 40,
  clips: [{ id: 'c1', in: 0, out: 10 }, { id: 'c2', in: 15, out: 30 }, { id: 'c3', in: 30, out: 35 }],
  audio: {
    orig: { gainDb: 0, mute: false, joinFadeMs: 30, denoise: 'off' },
    dub: { use: true, gainDb: 0, duck: 15, fade: 0.5 },
    music: [{ id: 'm1', asset: MUS, start: 2, len: 26, offset: 1, gainDb: -6, fadeIn: 1, fadeOut: 1, loop: true, duck: true, duckDb: -12 }],
    loudness: { on: true, target: -16 },
  },
  dress: {
    items: [{ id: 't1', kind: 'title', text: '{titre}', sub: 'Sous-titre', start: 1, len: 3 }, { id: 't2', kind: 'banner', text: '{intervenant}', sub: 'بسم الله', start: 12, len: 4 }],
    logo: { on: true, asset: 'channel', pos: 'tr', size: 12, opacity: 100, from: 0, to: null },
    intro: { on: true, len: 2, title: '{titre}', sub: 'Intro' },
    outro: { on: true, len: 2, title: 'Merci', sub: '' },
    transitions: { all: null, byClip: { c2: { type: 'dip', len: 1 } } },
    subs: { burn: true, scale: 100, pos: 'bottom', box: true },
  },
};
const chk = checkTimeline(raw, 40, { assets: new Map([[MUS, 12]]) });
ok(chk.ok, `montage valide${chk.ok ? '' : ` (${chk.error})`}`);
const cues = [{ s: 1, e: 4, text: 'Première phrase' }, { s: 16, e: 19, text: 'Deuxième phrase' }];
const dub = { segments: [{ s: 5, e: 10, keep: false }, { s: 20, e: 25, keep: false }, { s: 26, e: 28, keep: true }], voiceKey: 'dub/key.m4a', duck: 15 };
const plan = buildPlan({ timeline: chk.timeline, vars: { titre: 'La patience', intervenant: 'Cheikh Test' }, cues, dub, music: { [MUS]: { key: 'm.mp3' } }, logo: { key: 'logo.png' }, preview: false, title: 'La patience' });
ok(plan.total === 30 && plan.outDur === 34 && plan.introLen === 2 && plan.outroLen === 2, `durées : montage ${plan.total} s, fichier ${plan.outDur} s`);
ok(plan.summary.parts === 2, `extraits regroupés : 3 extraits → ${plan.summary.parts} passages (c2 et c3 se suivent sans transition)`);
ok(plan.inputs.filter((i) => i.ref === 'source').length === 4 && plan.inputs.filter((i) => i.ref === 'dub').length === 2, 'une entrée par passage (image, son, voix française)');
ok(plan.curves.length === 2 && plan.curves[0].env === 'orig' && Math.abs(plan.curves[0].depth - 0.85) < 1e-9, 'courbes : voix d’origine (85 % de baisse) et musique');
ok(/fade=t=out:st=9\.5:d=0\.5:color=black/.test(plan.script.video) && /fade=t=in:st=0:d=0\.5:color=black/.test(plan.script.video), 'fondu au noir : 0,5 s avant et 0,5 s après le raccord');
ok(plan.ass.includes('La patience') && plan.ass.includes('Cheikh Test') && plan.ass.includes('بسم الله') && plan.ass.includes('Merci'), 'textes : variables remplacées, arabe, écrans');
ok(plan.ass.includes('Dialogue: 0,0:00:03.00,0:00:06.00,SubsBox'), 'sous-titre recalé et décalé de la durée de l’intro (1 s source → 3 s fichier)');

// Enveloppes : mêmes valeurs que l'aperçu du site (ops.js), à 1/1000 près, en tout point.
const spans = [{ ts: 1, te: 2 }, { ts: 2.3, te: 3 }, { ts: 5, te: 5.1 }, { ts: 8, te: 9 }];
for (const fade of [0.3, 0.5, 2]) {
  const pts = envelopePoints(spans, fade, 12);
  let worst = 0;
  for (let t = 0; t <= 12; t += 0.0137) worst = Math.max(worst, Math.abs(sampleCurve(pts, t) - ops.envelope(t, spans, fade)), Math.abs(envelope(t, spans, fade) - ops.envelope(t, spans, fade)));
  ok(worst < 0.002, `enveloppe (rampe ${fade} s) identique à l’aperçu : écart ${worst.toFixed(5)} avec ${pts.length} points`);
}
const ras = W.rasterizeCurve([[0, 0], [1, 1], [2, 0]], 0.85, 3);
ok(ras.length === 3000 && Math.abs(ras[500] - (1 - 0.5 * 0.85)) < 1e-3 && Math.abs(ras[1000] - 0.15) < 1e-3 && ras[2500] === 1, 'courbe échantillonnée à 1000 Hz (g = 1 - e × profondeur)');
ok(W.outputSize({ preview: false, srcHeight: 720 }).W === 1280 && W.outputSize({ preview: false, srcHeight: 1080 }).H === 1080 && W.outputSize({ preview: false, srcHeight: 480 }).H === 360 && W.outputSize({ preview: true, srcHeight: 1080 }).W === 640, 'taille de l’image selon la source');
ok(W.outputFps(29.97) === 30 && W.outputFps(50) === 30 && W.outputFps(NaN) === 25, 'cadence 24-30 images/s');
ok(W.fillScript('@W@x@H@ @LW@ @BARY@ @X@', plan, { W: 1920, H: 1080 }) === `1920x1080 230 ${Math.round(1080 * (0.52 + 78 / 1080))} @X@`, 'valeurs @…@ remplacées (logo 12 % de 1920 = 230 px)');

// Trop d'extraits.
const many = { v: 1, duration: 400, clips: Array.from({ length: MAX_PARTS + 1 }, (_, i) => ({ id: `k${i}`, in: i * 3, out: i * 3 + 1 })) };
try { buildPlan({ timeline: checkTimeline(many, 400).timeline }); ok(false, 'trop d’extraits refusé'); } catch (e) { ok(/Trop d’extraits/.test(e.message), 'trop d’extraits : message clair'); }

// --- Rendu réel.
const rd = path.join(dir, 'work'); fs.mkdirSync(rd);
const files = { source: P('source.mp4'), dub: P('dub.m4a'), logo: P('logo.png'), music: { [MUS]: P('music.mp3') }, curves: {} };
const stages = new Set();
const t0 = Date.now();
const r = await W.renderFiles({ plan, files, dir: rd, threads: 2, onProgress: (s) => stages.add(s) });
const sec = (Date.now() - t0) / 1000;
ok(stages.has('measure') && stages.has('encode'), `étapes : ${[...stages].join(', ')} ; ${sec.toFixed(1)} s de calcul pour ${plan.outDur} s`);
const pr = JSON.parse(execFileSync('ffprobe', ['-v', 'error', '-print_format', 'json', '-show_format', '-show_streams', r.out]).toString());
const vs = pr.streams.find((s) => s.codec_type === 'video'); const as = pr.streams.find((s) => s.codec_type === 'audio');
ok(Math.abs(Number(pr.format.duration) - 34) < 0.3, `durée du fichier ${Number(pr.format.duration).toFixed(2)} s (34 attendues)`);
ok(vs.codec_name === 'h264' && vs.width === 1280 && vs.height === 720 && as.codec_name === 'aac', `H.264 ${vs.width}x${vs.height} + AAC`);
ok(r.measured && Number.isFinite(r.measured.I), `niveau mesuré en première passe : ${r.measured?.I} LUFS`);

// Image : luminance moyenne et pixels rouges (logo) à un instant.
const frame = (t, crop) => execFileSync('ffmpeg', ['-v', 'error', '-ss', String(t), '-i', r.out, '-frames:v', '1', '-vf', `${crop ? `crop=${crop},` : ''}scale=64:36,format=rgb24`, '-f', 'rawvideo', '-']);
const mean = (b) => b.reduce((s, x) => s + x, 0) / b.length;
const redShare = (b) => { let n = 0; for (let i = 0; i < b.length; i += 3) if (b[i] > 180 && b[i + 1] < 60 && b[i + 2] < 60) n += 1; return n / (b.length / 3); };
ok(mean(frame(1)) < 40, `écran d’ouverture sombre (luminance ${mean(frame(1)).toFixed(1)})`);
ok(mean(frame(2 + 10)) < 20 && mean(frame(2 + 8)) > 60, `fondu au noir au raccord (raccord ${mean(frame(12)).toFixed(1)}, 2 s avant ${mean(frame(10)).toFixed(1)})`);
ok(redShare(frame(2 + 5, '140:60:1106:35')) > 0.9, `logo en haut à droite pendant le montage (${(redShare(frame(7, '140:60:1106:35')) * 100).toFixed(0)} % de rouge)`);
ok(redShare(frame(33, '150:70:565:140')) > 0.9, 'logo centré sur l’écran de fin');
const shot = path.join(dir, 'titre.png'); ff(['-ss', '4', '-i', r.out, '-frames:v', '1', shot]);
const bannerShot = path.join(dir, 'bandeau.png'); ff(['-ss', '15', '-i', r.out, '-frames:v', '1', bannerShot]);

// Son : niveau d'une fréquence (filtre passe-bande) sur une fenêtre du fichier rendu, en dB.
// Niveau (dB) d'une fréquence entre a et b secondes du fichier rendu (4 filtres passe-bande en série).
const rmsOf = (f, a, b) => {
  const res = require_spawn(['-v', 'info', '-ss', String(a), '-t', String(b - a), '-i', r.out, '-vn', '-af', `${Array(4).fill(`bandpass=f=${f}:width_type=q:w=12`).join(',')},astats=measure_perchannel=none:measure_overall=RMS_level`, '-f', 'null', '-']);
  const m = [...res.matchAll(/RMS level dB:\s*(-?[\d.]+|-inf)/g)].pop();
  return m ? Number(m[1]) : NaN;
};
function require_spawn(args) { return spawnSync('ffmpeg', args, { encoding: 'utf8' }).stderr; } // journal de FFmpeg (stderr)
// Montage : c1 [0,10] source → [0,10] ; voix française source [5,10] → montage [5,10] → fichier [7,12].
const origFree = rmsOf(440, 2 + 2.5, 2 + 4);   // pas de voix française
const origDucked = rmsOf(440, 2 + 6, 2 + 9);   // voix française : la voix d'origine descend à 15 % (-16,5 dB)
ok(origFree - origDucked > 13 && origFree - origDucked < 20, `voix d’origine baissée sous la voix française : ${(origFree - origDucked).toFixed(1)} dB (16,5 attendus)`);
const dubOn = rmsOf(1000, 2 + 6, 2 + 9); const dubOff = rmsOf(1000, 2 + 2.5, 2 + 4);
ok(dubOn - dubOff > 30, `voix française présente dans ses passages seulement (${dubOn.toFixed(1)} / ${dubOff.toFixed(1)} dB)`);
// c2 [15,30] source → montage [10,25] ; voix française source [20,25] → montage [15,20] → fichier [17,22].
const dub2 = rmsOf(1000, 2 + 16, 2 + 19);
ok(dub2 - dubOff > 30, `voix française recalée après la coupe (${dub2.toFixed(1)} dB entre 18 et 21 s)`);
const musFree = rmsOf(220, 2 + 3.2, 2 + 4.5); const musDucked = rmsOf(220, 2 + 6, 2 + 9);
ok(musFree - musDucked > 9 && musFree - musDucked < 15, `musique baissée sous la voix : ${(musFree - musDucked).toFixed(1)} dB (12 attendus)`);
ok(rmsOf(220, 2 + 28.5, 2 + 29.8) < musFree - 30, 'musique arrêtée après sa fin (montage 28 s)');
const lufs = (() => { const e = require_spawn(['-v', 'info', '-i', r.out, '-vn', '-af', 'ebur128', '-f', 'null', '-']); const m = [...e.matchAll(/I:\s+(-?[\d.]+)\s+LUFS/g)].pop(); return m ? Number(m[1]) : NaN; })();
ok(Math.abs(lufs - -16) < 1.5, `niveau sonore homogène : ${lufs} LUFS (cible -16)`);

// Aperçu rapide : 640x360, passe unique.
const pplan = buildPlan({ timeline: chk.timeline, vars: { titre: 'T', intervenant: 'X' }, cues, dub: null, music: { [MUS]: { key: 'm' } }, logo: null, preview: true });
const rd2 = path.join(dir, 'work2'); fs.mkdirSync(rd2);
const r2 = await W.renderFiles({ plan: pplan, files: { ...files, curves: {} }, dir: rd2, threads: 2 });
const p2 = JSON.parse(execFileSync('ffprobe', ['-v', 'error', '-print_format', 'json', '-show_streams', '-show_format', r2.out]).toString());
ok(p2.streams[0].width === 640 && Math.abs(Number(p2.format.duration) - 34) < 0.3 && !r2.measured, 'aperçu rapide : 640x360, sans voix française ni logo, passe unique');
ok(pplan.warnings.some((w) => /Logo/.test(w)), 'avertissement : logo choisi mais introuvable');

// Source sans piste son : le son d'origine devient du silence.
ff(['-f', 'lavfi', '-i', 'testsrc2=size=640x360:rate=30:duration=40', '-c:v', 'libx264', '-preset', 'ultrafast', '-pix_fmt', 'yuv420p', P('mute.mp4')]);
const rd3 = path.join(dir, 'work3'); fs.mkdirSync(rd3);
const r3 = await W.renderFiles({ plan: pplan, files: { ...files, source: P('mute.mp4'), curves: {} }, dir: rd3 });
ok(r3.info.hasAudio === false && r3.W === 640, 'source sans son : rendu quand même');

// --- Registre n°13 : fondu enchaîné (dissolve) — durée gardée, pas de voile noir, images bien calées après le raccord.
const xraw = { v: 1, duration: 40, clips: [{ id: 'd1', in: 0, out: 10 }, { id: 'd2', in: 15, out: 25 }, { id: 'd3', in: 25.2, out: 30 }],
  dress: { transitions: { all: null, byClip: { d2: { type: 'dissolve', len: 1 }, d3: { type: 'dissolve', len: 3 } } } } };
const xchk = checkTimeline(xraw, 40); ok(xchk.ok, `fondu enchaîné accepté${xchk.ok ? '' : ` (${xchk.error})`}`);
const xplan = buildPlan({ timeline: xchk.timeline, preview: true });
ok(/xfade=transition=fade:duration=1:offset=9\.5/.test(xplan.script.video), 'fondu enchaîné : 1 s centré sur le raccord (début à 9,5 s)');
ok(/xfade=transition=fade:duration=3:offset=18\.5/.test(xplan.script.video), 'deuxième fondu de 3 s (prolongements de 1,5 s de part et d’autre)');
const shortRoom = buildPlan({ timeline: checkTimeline({ v: 1, duration: 40, clips: [{ id: 'e1', in: 5, out: 10 }, { id: 'e2', in: 0.2, out: 4 }],
  dress: { transitions: { all: { type: 'dissolve', len: 1 }, byClip: {} } } }, 40).timeline, preview: true });
ok(/xfade=transition=fade:duration=0\.4:offset=4\.8/.test(shortRoom.script.video), 'pas assez d’image avant le 2e extrait (0,2 s de source) : fondu raccourci à 0,4 s');
ok(!/fade=t=(in|out)[^,]*color=black/.test(xplan.script.video), 'pas de fondu au noir');
ok(xplan.inputs.filter((i) => i.ref === 'source' && i.use === 'v').length === 3, 'un passage par extrait');
const xd = path.join(dir, 'workx'); fs.mkdirSync(xd);
const xr = await W.renderFiles({ plan: xplan, files: { source: P('source.mp4'), curves: {} }, dir: xd, threads: 2 });
const xpr = JSON.parse(execFileSync('ffprobe', ['-v', 'error', '-print_format', 'json', '-show_format', xr.out]).toString());
ok(Math.abs(Number(xpr.format.duration) - 24.8) < 0.3, `fondu enchaîné : durée gardée ${Number(xpr.format.duration).toFixed(2)} s (24,8 attendues)`);
const xf = (t, file) => execFileSync('ffmpeg', ['-v', 'error', '-ss', String(t), '-i', file, '-frames:v', '1', '-vf', 'scale=64:36,format=rgb24', '-f', 'rawvideo', '-']);
const diff = (a, b) => { let d = 0; for (let i = 0; i < a.length; i += 1) d += Math.abs(a[i] - b[i]); return d / a.length; };
ok(mean(xf(10, xr.out)) > 60, `au raccord : image mélangée, pas noire (luminance ${mean(xf(10, xr.out)).toFixed(1)})`);
ok(diff(xf(13, xr.out), xf(18, P('source.mp4'))) < 12, `après le raccord : image calée sur la source (écart ${diff(xf(13, xr.out), xf(18, P('source.mp4'))).toFixed(1)})`);
ok(diff(xf(5, xr.out), xf(5, P('source.mp4'))) < 12, 'avant le raccord : image calée');
const mix = xf(10, xr.out), a10 = xf(10, P('source.mp4')), b15 = xf(15, P('source.mp4'));
const dAB = diff(a10, b15);
ok(dAB > 3 && diff(mix, a10) < 0.85 * dAB && diff(mix, b15) < 0.85 * dAB, `au milieu du fondu : mélange des deux images (${diff(mix, a10).toFixed(1)} / ${diff(mix, b15).toFixed(1)}, écart entre elles ${dAB.toFixed(1)})`);

fs.copyFileSync(shot, '/tmp/e4-render-titre.png'); fs.copyFileSync(bannerShot, '/tmp/e4-render-bandeau.png');
console.log(fails ? `\nÉCHECS : ${fails}` : '\nTout est bon');
process.exit(fails ? 1 : 0);
