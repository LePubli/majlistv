// Étape E6c — format (16:9, 9:16, 1:1) et qualité (360, 720, 1080) du rendu : tailles, plafond à la qualité de la source,
// plan (fond flouté ou recadrage, textes à la bonne échelle), et rendu réel par le moteur du worker (vrai FFmpeg).
// Lancer depuis api/ : node tests/test_format_e6c.mjs
process.env.DATABASE_URL ||= 'postgres://x:x@127.0.0.1:1/x';
process.env.JWT_SECRET ||= 'test-test-test-test-test-test-test';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const { buildPlan } = await import('../src/modules/editor/plan.js');
const { checkTimeline } = await import('../src/modules/editor/timeline.js');
const W = await import('../../worker/src/render.js');

let fails = 0;
const ok = (c, m) => { console.log(`${c ? 'OK  ' : 'FAIL'} ${m}`); if (!c) fails += 1; };
const J = (x) => JSON.stringify(x);
const size = (o) => J(W.outputSize(o));

// --- Tailles
ok(size({ preview: false, srcHeight: 1080 }) === J({ W: 1920, H: 1080 }) && size({ preview: false, srcHeight: 1080, format: '16:9', quality: 720 }) === J({ W: 1280, H: 720 }), '16:9 : 1080p par défaut, 720p si demandé');
ok(size({ preview: false, srcHeight: 1080, format: '9:16', quality: 1080 }) === J({ W: 1080, H: 1920 }) && size({ preview: false, srcHeight: 1080, format: '9:16', quality: 720 }) === J({ W: 720, H: 1280 }), '9:16 : 1080 × 1920 ou 720 × 1280');
ok(size({ preview: false, srcHeight: 1080, format: '1:1', quality: 1080 }) === J({ W: 1080, H: 1080 }) && size({ preview: false, srcHeight: 1080, format: '1:1', quality: 360 }) === J({ W: 360, H: 360 }), '1:1 : carré 1080 ou 360');
ok(size({ preview: false, srcHeight: 360, format: '16:9', quality: 1080 }) === J({ W: 640, H: 360 }) && size({ preview: false, srcHeight: 360, format: '9:16', quality: 1080 }) === J({ W: 360, H: 640 }), 'source 360p : jamais plus que 360p, même si 1080p est demandé');
ok(size({ preview: true, srcHeight: 1080, format: '1:1', quality: 1080 }) === J({ W: 360, H: 360 }) && size({ preview: true, srcHeight: 1080, format: '9:16' }) === J({ W: 360, H: 640 }), 'aperçu rapide : toujours 360p, dans le format choisi');
ok(size({ preview: false, srcHeight: 1080, vertical: true }) === J({ W: 1080, H: 1920 }) && size({ preview: false, srcHeight: 720 }) === J({ W: 1280, H: 720 }) && size({ preview: false, srcHeight: 480 }) === J({ W: 640, H: 360 }), 'sans format ni qualité : comme avant (extraits 9:16 et montages 16:9)');

// --- Plan
const raw = { v: 1, duration: 4, clips: [{ id: 'c1', in: 0, out: 4 }], dress: { items: [{ id: 't1', kind: 'title', text: 'MAJLIS', sub: '', start: 0, len: 4, x: 50, y: 20 }] } };
const tl = checkTimeline(raw, 4).timeline;
const p169 = buildPlan({ timeline: tl });
ok(p169.format === '16:9' && p169.fit === null && p169.quality === null && /PlayResX: 1920\nPlayResY: 1080/.test(p169.ass) && /pad=@W@:@H@/.test(p169.script.video), 'plan 16:9 : inchangé (bandes noires si besoin, textes en 1920 × 1080)');
const pBlur = buildPlan({ timeline: tl, format: '9:16', quality: 720 });
ok(pBlur.format === '9:16' && pBlur.fit === 'blur' && pBlur.quality === 720 && /boxblur=20:2/.test(pBlur.script.video) && /overlay=\(W-w\)\/2:\(H-h\)\/2/.test(pBlur.script.video), 'plan 9:16 « fond flouté » : image entière par-dessus la même image floutée');
ok(/PlayResX: 1080\nPlayResY: 1920/.test(pBlur.ass) && pBlur.ass.includes('\\pos(540,384)'), 'plan 9:16 : textes en 1080 × 1920, titre libre à 50 % / 20 % de l’image verticale');
const pCrop = buildPlan({ timeline: tl, format: '1:1', fit: 'crop' });
ok(pCrop.fit === 'crop' && /force_original_aspect_ratio=increase,crop=@W@:@H@/.test(pCrop.script.video) && !/boxblur/.test(pCrop.script.video) && /PlayResX: 1080\nPlayResY: 1080/.test(pCrop.ass), 'plan 1:1 « recadrer » : image remplie, recadrée au centre');
ok(buildPlan({ timeline: tl, format: '4:3' }).format === '16:9' && buildPlan({ timeline: tl, quality: 999 }).quality === null, 'format ou qualité inconnus : valeurs par défaut');
ok(buildPlan({ timeline: tl, preview: true, format: '9:16', quality: 1080 }).quality === 360, 'aperçu rapide : qualité 360 enregistrée dans le plan');

// --- Rendu réel (source 1920 × 1080 colorée)
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'e6cfmt-'));
const Pf = (f) => path.join(dir, f);
execFileSync('ffmpeg', ['-hide_banner', '-v', 'error', '-y', '-f', 'lavfi', '-i', 'testsrc2=size=1920x1080:rate=25:duration=4', '-f', 'lavfi', '-i', 'sine=frequency=440:sample_rate=48000:duration=4',
  '-c:v', 'libx264', '-preset', 'ultrafast', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-shortest', Pf('source.mp4')]);
const render = async (plan, name) => {
  const d = path.join(dir, name); fs.mkdirSync(d);
  const r = await W.renderFiles({ plan, files: { source: Pf('source.mp4'), curves: {} }, dir: d, threads: 2 });
  const v = JSON.parse(execFileSync('ffprobe', ['-v', 'error', '-print_format', 'json', '-show_streams', r.out]).toString()).streams.find((s) => s.codec_type === 'video');
  return { ...r, w: v.width, h: v.height };
};
const frame = (file, w, h) => execFileSync('ffmpeg', ['-hide_banner', '-v', 'error', '-ss', '2', '-i', file, '-frames:v', '1', '-f', 'rawvideo', '-pix_fmt', 'rgb24', '-'], { maxBuffer: 64 * 1024 * 1024 });
const lumaRow = (buf, w, y) => { let s = 0; for (let x = 0; x < w; x += 4) { const i = (y * w + x) * 3; s += (buf[i] + buf[i + 1] + buf[i + 2]) / 3; } return s / (w / 4); };

const v = await render(buildPlan({ timeline: tl, format: '9:16', quality: 720 }), 'v');
ok(v.w === 720 && v.h === 1280, `fichier 9:16 : ${v.w} × ${v.h}`);
const fb = frame(v.out, v.w, v.h);
ok(lumaRow(fb, v.w, 60) > 25 && lumaRow(fb, v.w, v.h - 60) > 25, `fond flouté : pas de bande noire en haut ni en bas (luminosité ${lumaRow(fb, v.w, 60).toFixed(0)} / ${lumaRow(fb, v.w, v.h - 60).toFixed(0)})`);
// titre blanc libre à 20 % de la hauteur : des pixels blancs autour de y = 256
let wy = 0; let wn = 0;
for (let y = 0; y < v.h; y += 2) for (let x = 0; x < v.w; x += 2) { const i = (y * v.w + x) * 3; if (fb[i] > 235 && fb[i + 1] > 235 && fb[i + 2] > 235) { wy += y; wn += 1; } }
ok(wn > 30 && Math.abs(wy / wn / v.h - 0.2) < 0.06, `titre placé à 20 % de la hauteur de l’image verticale (trouvé à ${(wy / Math.max(1, wn) / v.h * 100).toFixed(1)} %)`);
const sq = await render(buildPlan({ timeline: tl, format: '1:1', fit: 'crop', quality: 360 }), 'sq');
ok(sq.w === 360 && sq.h === 360, `fichier 1:1 recadré : ${sq.w} × ${sq.h}`);
const l = await render(buildPlan({ timeline: tl, quality: 720 }), 'l');
ok(l.w === 1280 && l.h === 720, `fichier 16:9 en 720p demandé sur une source 1080p : ${l.w} × ${l.h}`);
fs.rmSync(dir, { recursive: true, force: true });
console.log(fails ? `\n${fails} échec(s)` : '\nTout est OK');
process.exit(fails ? 1 : 0);
