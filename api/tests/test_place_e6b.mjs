// Étape E6b — positions libres dans le rendu complet (plan de l'API + moteur du worker, vrai FFmpeg) : titre, bandeau, sous-titres
// et logo placés à la main apparaissent au bon endroit dans le fichier rendu ; un montage sans position garde le comportement d'avant.
// Lancer depuis api/ : node tests/test_place_e6b.mjs
process.env.DATABASE_URL ||= 'postgres://x:x@127.0.0.1:1/x';
process.env.JWT_SECRET ||= 'test-test-test-test-test-test-test';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const D = await import('../src/modules/editor/dress.js');
const { buildPlan } = await import('../src/modules/editor/plan.js');
const { checkTimeline } = await import('../src/modules/editor/timeline.js');
const W = await import('../../worker/src/render.js');

let fails = 0;
const ok = (c, m) => { console.log(`${c ? 'OK  ' : 'FAIL'} ${m}`); if (!c) fails += 1; };
const near = (a, b, e) => Math.abs(a - b) <= e;

// --- Fonctions pures
const d = D.dressDefaults({ items: [{ id: 'a', kind: 'title', text: 'T', start: 0, len: 3, x: 25, y: 30 }, { id: 'b', kind: 'banner', text: 'N', start: 0, len: 3, x: 10, y: 80 }, { id: 'c', kind: 'title', text: 'P', start: 0, len: 3 }],
  subs: { burn: true, y: 20 }, logo: { on: true, x: 80, y: 5 } });
const ev = D.dressEvents(d, { total: 5, cues: [{ ts: 0, te: 2, text: 'S' }] });
ok(ev[0].body.includes('\\an5\\pos(480,324)'), 'titre libre : repère au centre, \\pos en pixels de 1920 × 1080');
ok(ev[1].body.includes('\\an4\\pos(192,864)'), 'bandeau libre : bord gauche, milieu en hauteur');
ok(!ev[2].body.includes('\\pos') && ev[2].body.startsWith('{\\fad(300,300)}{\\an5}'), 'titre sans position : inchangé (prédéfini)');
ok(ev[3].body.includes('\\an5\\pos(960,216)'), 'sous-titres libres : centrés, hauteur demandée');
ok(JSON.stringify(D.logoXY(d.logo, '@LM@')) === JSON.stringify(["'min(W*0.8,W-w)'", "'min(H*0.05,H-h)'"]), 'logo libre : coin haut-gauche, gardé dans l’image');
ok(JSON.stringify(D.logoXY({ pos: 'bl' }, '@LM@')) === JSON.stringify(['@LM@', 'H-h-@LM@']), 'logo sans position : coin prédéfini (inchangé)');
const bad = D.checkDress({ items: [{ id: 'a', kind: 'title', text: 'T', start: 0, len: 3, x: 101, y: 3 }] });
ok(!bad.ok && /entre 0 et 100/.test(bad.error), 'validation : position au-delà de 100 % refusée');

// --- Rendu réel : source noire, titre blanc et logo rouge placés à la main
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'e6bplace-'));
const Pf = (f) => path.join(dir, f);
execFileSync('ffmpeg', ['-hide_banner', '-v', 'error', '-y', '-f', 'lavfi', '-i', 'color=c=black:s=1280x720:r=25:d=6', '-f', 'lavfi', '-i', 'sine=frequency=440:sample_rate=48000:duration=6',
  '-c:v', 'libx264', '-preset', 'ultrafast', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-shortest', Pf('source.mp4')]);
execFileSync('ffmpeg', ['-hide_banner', '-v', 'error', '-y', '-f', 'lavfi', '-i', 'color=c=red:s=200x200', '-frames:v', '1', Pf('logo.png')]);
const raw = { v: 1, duration: 6, clips: [{ id: 'c1', in: 0, out: 6 }],
  dress: { items: [{ id: 't1', kind: 'title', text: 'MAJLIS', sub: '', start: 0, len: 6, x: 70, y: 25 }], logo: { on: true, asset: 'channel', size: 10, opacity: 100, x: 10, y: 60 } } };
const tl = checkTimeline(raw, 6).timeline;
const plan = buildPlan({ timeline: tl, preview: false, logo: { key: 'logo' } });
ok(/overlay=x='min\(W\*0\.1,W-w\)':y='min\(H\*0\.6,H-h\)'/.test(plan.script.video), 'plan : logo placé par expression FFmpeg protégée (apostrophes)');
const out = await W.renderFiles({ plan, files: { source: Pf('source.mp4'), logo: Pf('logo.png'), curves: {} }, dir, threads: 2 });
const pr = JSON.parse(execFileSync('ffprobe', ['-v', 'error', '-print_format', 'json', '-show_streams', out.out]).toString()).streams.find((s) => s.codec_type === 'video');
const w = pr.width; const h = pr.height;
const raw3 = execFileSync('ffmpeg', ['-hide_banner', '-v', 'error', '-ss', '3', '-i', out.out, '-frames:v', '1', '-f', 'rawvideo', '-pix_fmt', 'rgb24', '-'], { maxBuffer: 64 * 1024 * 1024 });
const at = (x, y) => { const i = (y * w + x) * 3; return [raw3[i], raw3[i + 1], raw3[i + 2]]; };
let wx = 0; let wy = 0; let wn = 0; let rx = w; let ry = h; let rn = 0;
for (let y = 0; y < h; y += 2) {
  for (let x = 0; x < w; x += 2) {
    const [r, g, b] = at(x, y);
    if (r > 200 && g > 200 && b > 200) { wx += x; wy += y; wn += 1; }
    if (r > 180 && g < 80 && b < 80) { rx = Math.min(rx, x); ry = Math.min(ry, y); rn += 1; }
  }
}
ok(wn > 50 && near(wx / wn / w, 0.70, 0.04) && near(wy / wn / h, 0.25, 0.05), `fichier rendu ${w}×${h} : titre centré à ${(wx / wn / w * 100).toFixed(1)} % / ${(wy / wn / h * 100).toFixed(1)} % (demandé 70 / 25)`);
ok(rn > 50 && near(rx / w, 0.10, 0.01) && near(ry / h, 0.60, 0.015), `fichier rendu : logo au coin ${(rx / w * 100).toFixed(1)} % / ${(ry / h * 100).toFixed(1)} % (demandé 10 / 60)`);
fs.rmSync(dir, { recursive: true, force: true });
console.log(fails ? `\n${fails} échec(s)` : '\nTout est OK');
process.exit(fails ? 1 : 0);
