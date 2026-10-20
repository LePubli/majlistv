// Étape E5d — cadre vertical qui bouge : trajectoire, corrections à la main, expression FFmpeg, plan et rendu réel (vrai FFmpeg, moteur du worker).
// Lancer depuis api/ : node tests/test_follow.mjs
process.env.DATABASE_URL ||= 'postgres://x:x@127.0.0.1:1/x';
process.env.JWT_SECRET ||= 'test-test-test-test-test-test-test';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const F = await import('../src/modules/editor/follow.js');
const S = await import('../src/modules/editor/short.js');
const { buildPlan } = await import('../src/modules/editor/plan.js');
const { checkTimeline } = await import('../src/modules/editor/timeline.js');
const W = await import('../../worker/src/render.js');

let fails = 0;
const ok = (c, m) => { console.log(`${c ? 'OK  ' : 'FAIL'} ${m}`); if (!c) fails += 1; };
const J = (x) => JSON.stringify(x);
const near = (a, b, e = 0.6) => Math.abs(a - b) <= e;

// --- Valeur d'une trajectoire
const P = [{ t: 0, x: 0 }, { t: 10, x: 100 }];
ok(F.pathAt(P, 5) === 50 && F.pathAt(P, -3) === 0 && F.pathAt(P, 99) === 100 && F.pathAt([], 1) === 50, 'pathAt : ligne droite, bords, vide → 50');

// --- Corrections à la main
let r = F.checkManual([{ from: 8, to: 12, x: 30 }], 5, 15);
ok(r.ok && J(r.manual) === J([{ from: 8, to: 12, x: 30 }]), 'correction valide gardée');
r = F.checkManual([{ from: 3, to: 7, x: 30 }], 5, 15);
ok(r.ok && r.manual[0].from === 5 && r.manual[0].to === 7, 'correction qui dépasse le début du passage : coupée');
r = F.checkManual([{ from: 0, to: 4, x: 30 }, { from: 20, to: 30, x: 10 }], 5, 15);
ok(r.ok && r.manual.length === 0, 'correction entièrement hors du passage : écartée');
ok(!F.checkManual([{ from: 8, to: 12, x: 30 }, { from: 11, to: 13, x: 60 }], 5, 15).ok, 'deux corrections qui se chevauchent : refusées');
ok(!F.checkManual([{ from: 9, to: 9.2, x: 30 }], 5, 15).ok, 'correction de moins de 0,5 s : refusée');
ok(!F.checkManual([{ from: 9, to: 8, x: 30 }], 5, 15).ok, 'fin avant le début : refusée');
ok(F.checkManual([{ from: 14.8, to: 20, x: 30 }], 5, 15).ok && F.checkManual([{ from: 14.8, to: 20, x: 30 }], 5, 15).manual.length === 0, 'il reste moins de 0,5 s dans le passage : écartée sans erreur');
ok(!F.manualSchema.safeParse([{ from: 1, to: 3, x: 120 }]).success && !F.manualSchema.safeParse(Array.from({ length: 21 }, (_, i) => ({ from: i * 2, to: i * 2 + 1, x: 10 }))).success, 'schéma : position > 100 refusée ; plus de 20 corrections refusées');
ok(F.manualSchema.parse(undefined).length === 0, 'schéma : par défaut aucune correction');

// --- Trajectoire finale
let pth = F.buildPath({ follow: false, cropX: 40, from: 5, to: 15 });
ok(J(pth) === J([{ t: 5, x: 40 }, { t: 15, x: 40 }]) && F.isConstant(pth), 'sans suivi : cadre fixe à cropX');
pth = F.buildPath({ follow: true, keys: [{ t: 0, x: 0 }, { t: 20, x: 100 }], cropX: 40, from: 5, to: 15 });
ok(near(pth[0].x, 25) && near(pth.at(-1).x, 75) && pth[0].t === 5 && pth.at(-1).t === 15, 'suivi : points clés de la conférence ramenés au passage (25 % → 75 %)');
pth = F.buildPath({ follow: true, keys: null, cropX: 40, from: 5, to: 15 });
ok(F.isConstant(pth) && pth[0].x === 40, 'suivi demandé mais pas encore calculé : cadre fixe');
pth = F.buildPath({ follow: true, keys: [{ t: 0, x: 0 }, { t: 20, x: 100 }], cropX: 40, manual: [{ from: 8, to: 10, x: 90 }], from: 5, to: 15 });
ok(near(F.pathAt(pth, 9), 90, 0.01) && near(F.pathAt(pth, 8), 90, 0.01) && near(F.pathAt(pth, 10), 90, 0.01), 'correction à la main : cadre à 90 % pendant 8–10 s');
ok(near(F.pathAt(pth, 7.6), 38, 1) && near(F.pathAt(pth, 7.8), 64, 1), 'glissement de 0,4 s avant la correction (38 % → 90 %)');
ok(near(F.pathAt(pth, 12), 60, 0.6) && near(F.pathAt(pth, 14), 70, 0.6), 'après la correction : on reprend la trajectoire automatique');
ok(pth.every((p, i) => i === 0 || p.t > pth[i - 1].t), 'temps strictement croissants');
const fx = F.buildPath({ follow: false, cropX: 50, manual: [{ from: 5, to: 7, x: 0 }], from: 5, to: 15 });
ok(near(F.pathAt(fx, 5.5), 0, 0.01) && near(F.pathAt(fx, 12), 50, 0.01), 'correction sur un cadre fixe (sans suivi) : possible');
ok(F.buildPath({ follow: true, keys: [], cropX: 70, from: 0, to: 4 }).length === 2, 'points clés vides : cadre fixe');
const many = F.buildPath({ follow: true, keys: Array.from({ length: 60 }, (_, i) => ({ t: i, x: (i * 37) % 100 })), cropX: 50, manual: [{ from: 10, to: 12, x: 50 }, { from: 30, to: 31, x: 0 }], from: 0, to: 59 });
ok(many.length >= 60 && many.every((p) => p.x >= 0 && p.x <= 100), 'trajectoire à 60 points + 2 corrections : toujours entre 0 et 100');

// --- Expression FFmpeg
const ex = F.xExpression([{ t: 5, x: 0 }, { t: 10, x: 100 }], 5);
ok(/^\(iw-ow\)\*\(0\+100\*clip\(\(t\+5-5\)\/5,0,1\)\)\/100$/.test(ex), `expression : ${ex}`);
const cf = F.cropFilterPath([{ t: 5, x: 0 }, { t: 10, x: 100 }], 5);
ok(/^crop=w='trunc\(min\(iw,ih\*9\/16\)\/2\)\*2':h=ih:x='.*':y=0,scale=@W@:@H@:force_original_aspect_ratio=increase,crop=@W@:@H@$/.test(cf), 'filtre : même forme que le cadre fixe, x entre apostrophes (virgules protégées)');
const long = F.xExpression(many, 0);
ok(long.length < 8000, `expression de ${many.length} points : ${long.length} caractères (< 8000)`);

// --- Plan
const raw = S.shortTimeline(5, 15, 20, S.shortDefaults({ cropX: 50 }));
const tlc = checkTimeline(raw, 20).timeline;
const moving = F.buildPath({ follow: true, keys: [{ t: 0, x: 0 }, { t: 20, x: 100 }], cropX: 50, from: 5, to: 15 });
const plan = buildPlan({ timeline: tlc, preview: false, short: { cropX: 50, path: moving, captions: [], wantCaptions: false, titleText: '', notes: ['Note de test'] } });
ok(/crop=w='trunc\(min\(iw,ih\*9\/16\)\/2\)\*2':h=ih:x='\(iw-ow\)\*\(25\+/.test(plan.script.video), 'plan : le cadrage utilise la trajectoire');
ok(plan.warnings.includes('Note de test'), 'plan : les notes de l’extrait deviennent des avertissements');
const planFixed = buildPlan({ timeline: tlc, preview: false, short: { cropX: 100, path: F.buildPath({ follow: false, cropX: 100, from: 5, to: 15 }), captions: [], wantCaptions: false, titleText: '' } });
ok(/x='\(iw-ow\)\*1'/.test(planFixed.script.video), 'plan : trajectoire constante = ancien cadre fixe (identique à l’étape E5b)');
const planOld = buildPlan({ timeline: tlc, preview: false, short: { cropX: 30, captions: [], wantCaptions: false, titleText: '' } });
ok(/x='\(iw-ow\)\*0\.3'/.test(planOld.script.video), 'plan : sans trajectoire, comportement d’avant (compatibilité)');

// --- Rendu réel : source 1280 × 720 dont la couleur rouge croît de gauche à droite : le rouge au centre de l'image verticale dit où est le cadre.
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'e5dfollow-'));
const Pf = (f) => path.join(dir, f);
execFileSync('ffmpeg', ['-hide_banner', '-v', 'error', '-y', '-f', 'lavfi', '-i', 'color=c=black:s=1280x720:r=25:d=20,geq=r=\'255*X/W\':g=0:b=0',
  '-f', 'lavfi', '-i', 'sine=frequency=440:sample_rate=48000:duration=20', '-c:v', 'libx264', '-preset', 'ultrafast', '-pix_fmt', 'yuv444p', '-c:a', 'aac', '-shortest', Pf('source.mp4')]);
const redAt = (file, t) => {
  const b = execFileSync('ffmpeg', ['-hide_banner', '-v', 'error', '-ss', String(t), '-i', file, '-frames:v', '1', '-vf', 'format=rgb24,crop=4:4:in_w/2-2:in_h/2-2', '-f', 'rawvideo', '-pix_fmt', 'rgb24', '-']);
  let r2 = 0; for (let i = 0; i < b.length; i += 3) r2 += b[i]; return r2 / (b.length / 3);
};
// centre du cadre en part de la largeur de la source = (x/100 * (1280-404) + 202) / 1280 ; rouge attendu = 255 × cela.
const expectRed = (x) => 255 * ((x / 100) * (1280 - 404) + 202) / 1280;
const render = async (short, name) => {
  const p = buildPlan({ timeline: tlc, preview: false, short: { captions: [], wantCaptions: false, titleText: '', ...short } });
  const d = path.join(dir, name); fs.mkdirSync(d);
  return W.renderFiles({ plan: p, files: { source: Pf('source.mp4'), curves: {} }, dir: d, threads: 2 });
};
const mv = await render({ cropX: 50, path: F.buildPath({ follow: true, keys: [{ t: 5, x: 0 }, { t: 15, x: 100 }], cropX: 50, from: 5, to: 15 }) }, 'mv');
const reds = [1, 3, 5, 7, 9].map((t) => redAt(mv.out, t));
ok(reds.every((v, i) => near(v, expectRed([10, 30, 50, 70, 90][i]), 9)), `rendu : le cadre avance de gauche à droite (rouge au centre : ${reds.map((v) => v.toFixed(0)).join(' → ')} ; attendu ${[10, 30, 50, 70, 90].map((x) => expectRed(x).toFixed(0)).join(' → ')})`);
const man = await render({ cropX: 50, path: F.buildPath({ follow: true, keys: [{ t: 5, x: 0 }, { t: 15, x: 100 }], cropX: 50, manual: [{ from: 8, to: 11, x: 0 }], from: 5, to: 15 }) }, 'man');
const rm = [1, 4, 5.5, 7.4, 9.5].map((t) => redAt(man.out, t));
ok(near(rm[1], expectRed(0), 9) && near(rm[2], expectRed(0), 9) && rm[3] > rm[2] + 40 && near(rm[4], expectRed(90), 12), `rendu avec correction : cadre ramené à gauche à 3–6 s du rendu, puis reprise (${rm.map((v) => v.toFixed(0)).join(' → ')})`);
const fixed = await render({ cropX: 100, path: F.buildPath({ follow: false, cropX: 100, from: 5, to: 15 }) }, 'fixed');
ok(near(redAt(fixed.out, 1), expectRed(100), 6) && near(redAt(fixed.out, 9), expectRed(100), 6), 'rendu cadre fixe à droite : inchangé');
const pr = JSON.parse(execFileSync('ffprobe', ['-v', 'error', '-print_format', 'json', '-show_format', '-show_streams', mv.out]).toString());
const vs = pr.streams.find((s) => s.codec_type === 'video');
ok(vs.width === 720 && vs.height === 1280 && Math.abs(Number(pr.format.duration) - 10) < 0.3, `fichier ${vs.width}x${vs.height}, ${Number(pr.format.duration).toFixed(1)} s`);
const pvp = buildPlan({ timeline: tlc, preview: true, short: { cropX: 50, path: moving, captions: [], wantCaptions: false, titleText: '' } });
const d2 = path.join(dir, 'pv'); fs.mkdirSync(d2);
const pv = await W.renderFiles({ plan: pvp, files: { source: Pf('source.mp4'), curves: {} }, dir: d2, threads: 2 });
const pvs = JSON.parse(execFileSync('ffprobe', ['-v', 'error', '-print_format', 'json', '-show_streams', pv.out]).toString()).streams.find((s) => s.codec_type === 'video');
ok(pvs.width === 360 && pvs.height === 640, `aperçu rapide ${pvs.width}x${pvs.height} avec cadre qui bouge`);
fs.rmSync(dir, { recursive: true, force: true });

console.log(fails ? `\nÉCHECS : ${fails}` : '\nTout est bon');
process.exit(fails ? 1 : 0);
