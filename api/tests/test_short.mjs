// Étape E5b — extraits courts 9:16 : sous-titres courts, passage, fichier de textes, plan et rendu réel (vrai FFmpeg, moteur du worker).
// Lancer depuis api/ : node tests/test_short.mjs
process.env.DATABASE_URL ||= 'postgres://x:x@127.0.0.1:1/x';
process.env.JWT_SECRET ||= 'test-test-test-test-test-test-test';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const S = await import('../src/modules/editor/short.js');
const { buildPlan } = await import('../src/modules/editor/plan.js');
const { checkTimeline } = await import('../src/modules/editor/timeline.js');
const W = await import('../../worker/src/render.js');

let fails = 0;
const ok = (c, m) => { console.log(`${c ? 'OK  ' : 'FAIL'} ${m}`); if (!c) fails += 1; };
const J = (x) => JSON.stringify(x);

// --- Passage
ok(S.checkPassage(10, 70, 600).ok, 'passage de 60 s accepté');
ok(!S.checkPassage(-1, 10, 600).ok && !S.checkPassage(5, 5.5, 600).ok && !S.checkPassage(0, 181, 600).ok && !S.checkPassage(590, 612, 600).ok && !S.checkPassage(NaN, 4, 600).ok, 'passage refusé : avant le début, trop court, plus de 3 min, après la fin, invalide');
ok(S.checkPassage(0, 180, 600).ok && S.checkPassage(0, 1, 600).ok, 'limites 1 s et 3 min acceptées');
ok(S.shortDefaults({}).cropX === 50 && S.shortDefaults({}).captions === true && S.shortDefaults({}).dub === false, 'réglages par défaut : cadre au centre, sous-titres, voix d’origine');
ok(!S.shortConfigSchema.safeParse({ cropX: 120 }).success && !S.shortConfigSchema.safeParse({ lang: 'fr;x' }).success, 'cadre hors 0-100 et langue invalide refusés');
const tl = S.shortTimeline(12, 40, 600, S.shortDefaults({}));
const chk = checkTimeline(tl, 600);
ok(chk.ok && chk.timeline.clips.length === 1 && chk.timeline.audio.loudness.target === -14 && chk.timeline.audio.dub.use === false, 'montage d’un extrait valide (un extrait, −14 LUFS, sans voix française)');

// --- Sous-titres courts
const mk = (txt, s0, step = 0.4) => txt.split(' ').map((w, i) => ({ s: s0 + i * step, e: s0 + i * step + step - 0.05, w }));
let words = [...mk('Bonjour à tous et bienvenue dans cette conférence sur la patience.', 10), ...mk('La patience est une lumière, dit-on souvent.', 16)];
let c = S.chunkCaptions(words, 10, 30);
ok(c.every((x) => x.text.split(' ').length <= 5 && x.text.length <= 34), `groupes de 5 mots et 34 caractères au plus (${c.map((x) => x.text.split(' ').length)})`);
ok(c.map((x) => x.text).join(' ') === words.map((w) => w.w).join(' '), 'aucun mot perdu ni ajouté, dans l’ordre');
ok(c.some((x) => x.text.endsWith('patience.')) && c.findIndex((x) => x.text.endsWith('patience.')) === c.findIndex((x) => x.text.startsWith('La patience')) - 1, 'une fin de phrase termine un groupe');
ok(c.every((x, i) => x.e > x.s && (i === 0 || x.s >= c[i - 1].e - 1e-6)), 'groupes dans l’ordre, sans chevauchement');
ok(c.every((x) => x.e - x.s >= 0.45), 'chaque groupe reste au moins 0,5 s');
c = S.chunkCaptions(words, 12, 16);
ok(c.length && c[0].s >= 12 && c.at(-1).e <= 16 && !c.some((x) => /^Bonjour/.test(x.text)), 'seuls les mots du passage, bornés au passage');
c = S.chunkCaptions([...mk('un deux trois', 0), ...mk('quatre cinq', 5)], 0, 10);
ok(c.length === 2 && c[0].text === 'un deux trois' && c[1].text === 'quatre cinq', 'une pause de plus de 0,8 s coupe le groupe');
c = S.chunkCaptions(mk('الصبر نور عظيم يضيء الطريق للسالكين', 0), 0, 10);
ok(c.length >= 2 && c.every((x) => x.text.split(' ').length <= 5), 'arabe : groupes courts');
ok(S.chunkCaptions([], 0, 10).length === 0 && S.chunkCaptions([{ s: 1, e: 2, w: ' ' }], 0, 10).length === 0, 'texte vide : aucun sous-titre');

// --- Fichier de textes 1080 × 1920
const ass = S.buildShortAss({ chunks: [{ s: 1, e: 2.5, text: 'Bonjour {à} tous' }], title: 'Ma {citation}\nsuite', total: 20 });
ok(/PlayResX: 1080/.test(ass) && /PlayResY: 1920/.test(ass) && /Style: ShortCap,DejaVu Sans,72/.test(ass), 'ASS : repère 1080 × 1920, police DejaVu');
ok(/Dialogue: 1,0:00:01.00,0:00:02.50,ShortCap,,0,0,0,,Bonjour \(à\) tous/.test(ass) && /ShortTitle,,0,0,0,,\{\\fad\(300,400\)\}Ma \(citation\)\\Nsuite/.test(ass), 'ASS : accolades neutralisées, retour à la ligne, fondu du titre');
ok(!/ShortTitle,,/.test(S.buildShortAss({ chunks: [], title: '  ', total: 10 }).split('[Events]')[1]), 'ASS : pas de titre vide');
// Registre n°33 : mot dit en or.
const kch = [{ s: 1, e: 3, text: 'UN DEUX', words: [{ s: 1, e: 1.5, w: 'UN' }, { s: 1.8, e: 2.4, w: 'DEUX' }] }];
const kass = S.buildShortAss({ chunks: kch, karaoke: true, total: 10 });
ok(/Dialogue: 1,0:00:01.00,0:00:01.80,ShortCap,,0,0,0,,\{\\c&H39A7E6&\}UN\{\\c&HFFFFFF&\} DEUX/.test(kass) && /Dialogue: 1,0:00:01.80,0:00:03.00,ShortCap,,0,0,0,,UN \{\\c&H39A7E6&\}DEUX\{\\c&HFFFFFF&\}/.test(kass), 'ASS karaoké : une ligne par mot, le mot dit en or');
ok(!/H39A7E6/.test(S.buildShortAss({ chunks: kch, karaoke: false })), 'karaoké coupé : texte simple');
ok(S.chunkCaptions(mk('un deux trois', 0), 0, 10)[0].words.length === 3, 'groupes : mots horodatés gardés');
ok(S.shortDefaults({}).karaoke === true, 'mot dit en couleur : activé par défaut');

// --- Plan
const raw = S.shortTimeline(2, 12, 20, S.shortDefaults({ cropX: 100 }));
const tlc = checkTimeline(raw, 20).timeline;
const caps = [{ s: 3, e: 5, text: 'UN DEUX TROIS' }, { s: 6, e: 8, text: 'QUATRE CINQ' }];
const plan = buildPlan({ timeline: tlc, preview: false, short: { cropX: 100, captions: caps, wantCaptions: true, titleText: 'MON TITRE' }, title: 'x' });
ok(plan.vertical === true && plan.outDur === 10 && plan.introLen === 0 && plan.outroLen === 0, 'plan vertical : 10 s, sans intro ni fin');
ok(/crop=w='trunc\(min\(iw,ih\*9\/16\)\/2\)\*2':h=ih:x='\(iw-ow\)\*1'/.test(plan.script.video) && !/pad=@W@/.test(plan.script.video), 'plan : cadre vertical collé à droite, pas de bandes noires');
ok(/Dialogue: 1,0:00:01.00,0:00:03.00,ShortCap,,0,0,0,,UN DEUX TROIS/.test(plan.ass) && /Dialogue: 1,0:00:04.00,0:00:06.00,ShortCap/.test(plan.ass) && /MON TITRE/.test(plan.ass), 'plan : sous-titres recalés sur l’extrait (3 s source → 1 s), titre');
const empty = buildPlan({ timeline: tlc, short: { cropX: 50, captions: [], wantCaptions: true, titleText: '' } });
ok(empty.warnings.some((w) => /Sous-titres demandés/.test(w)), 'plan : avertissement si le passage n’a pas de texte');
ok(buildPlan({ timeline: tlc }).vertical === false, 'plan d’un montage normal : pas vertical');
const kplan = buildPlan({ timeline: tlc, short: { cropX: 100, captions: [{ s: 3, e: 5, text: 'UN DEUX', words: [{ s: 3, e: 3.5, w: 'UN' }, { s: 4, e: 4.6, w: 'DEUX' }] }], wantCaptions: true, titleText: '', karaoke: true } });
ok(/0:00:01.00,0:00:02.00,ShortCap,,0,0,0,,\{\\c&H39A7E6&\}UN/.test(kplan.ass) && /0:00:02.00,0:00:03.00,ShortCap,,0,0,0,,UN \{\\c&H39A7E6&\}DEUX/.test(kplan.ass), 'plan karaoké : mots recalés sur l’extrait (3 s source → 1 s)');

// --- Tailles de sortie
ok(J(W.outputSize({ preview: true, srcHeight: 1080, vertical: true })) === J({ W: 360, H: 640 }), 'aperçu vertical 360 × 640');
ok(J(W.outputSize({ preview: false, srcHeight: 1080, vertical: true })) === J({ W: 1080, H: 1920 }) && J(W.outputSize({ preview: false, srcHeight: 720, vertical: true })) === J({ W: 720, H: 1280 }) && J(W.outputSize({ preview: false, srcHeight: 360, vertical: true })) === J({ W: 360, H: 640 }), 'rendu final vertical : 1080 × 1920, 720 × 1280 ou 360 × 640 selon la source');
ok(J(W.outputSize({ preview: true, srcHeight: 1080 })) === J({ W: 640, H: 360 }), 'montage normal inchangé (640 × 360)');

// --- Rendu réel : source moitié rouge (gauche) moitié bleue (droite), 1280 × 720.
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'e5bshort-'));
const P = (f) => path.join(dir, f);
const ff = (args) => execFileSync('ffmpeg', ['-hide_banner', '-v', 'error', '-y', ...args]);
ff(['-f', 'lavfi', '-i', 'color=c=red:s=640x720:r=25:d=20', '-f', 'lavfi', '-i', 'color=c=blue:s=640x720:r=25:d=20', '-f', 'lavfi', '-i', 'sine=frequency=440:sample_rate=48000:duration=20',
  '-filter_complex', '[0:v][1:v]hstack=inputs=2[v]', '-map', '[v]', '-map', '2:a', '-c:v', 'libx264', '-preset', 'ultrafast', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-shortest', P('source.mp4')]);
const pixel = (file, t, x, y) => { // (r, g, b) d'un point
  const b = execFileSync('ffmpeg', ['-hide_banner', '-v', 'error', '-ss', String(t), '-i', file, '-frames:v', '1', '-vf', `format=rgb24,crop=1:1:${x}:${y}`, '-f', 'rawvideo', '-pix_fmt', 'rgb24', '-']);
  return [b[0], b[1], b[2]];
};
const lightCount = (file, t, y0, h, light) => { // nombre de pixels clairs (texte blanc) ou dorés (titre) dans une bande
  const b = execFileSync('ffmpeg', ['-hide_banner', '-v', 'error', '-ss', String(t), '-i', file, '-frames:v', '1', '-vf', `crop=iw:${h}:0:${y0}`, '-f', 'rawvideo', '-pix_fmt', 'rgb24', '-'], { maxBuffer: 1 << 28 });
  let n = 0;
  for (let i = 0; i < b.length; i += 3) { const [r, g, bl] = [b[i], b[i + 1], b[i + 2]]; if (light ? (r > 200 && g > 200 && bl > 200) : (r > 200 && g > 130 && g < 200 && bl < 110)) n += 1; }
  return n;
};
const render = async (cropX, preview) => {
  const p = buildPlan({ timeline: tlc, preview, short: { cropX, captions: caps, wantCaptions: true, titleText: 'MON TITRE' } });
  const d = path.join(dir, `w${cropX}${preview ? 'p' : 'f'}`); fs.mkdirSync(d);
  return { p, ...(await W.renderFiles({ plan: p, files: { source: P('source.mp4'), curves: {} }, dir: d, threads: 2 })) };
};
const left = await render(0, false); const right = await render(100, false); const mid = await render(50, false);
const pr = JSON.parse(execFileSync('ffprobe', ['-v', 'error', '-print_format', 'json', '-show_format', '-show_streams', left.out]).toString());
const vs = pr.streams.find((s) => s.codec_type === 'video'); const as = pr.streams.find((s) => s.codec_type === 'audio');
ok(vs.width === 720 && vs.height === 1280 && vs.codec_name === 'h264' && as?.codec_name === 'aac' && Math.abs(Number(pr.format.duration) - 10) < 0.3, `fichier ${vs.width}x${vs.height} H.264 + AAC, ${Number(pr.format.duration).toFixed(1)} s`);
const [lr, lg, lb] = pixel(left.out, 5, 360, 700); const [rr, rg, rb] = pixel(right.out, 5, 360, 700);
ok(lr > 200 && lb < 60, `cadre à gauche : image rouge (${lr},${lg},${lb})`);
ok(rb > 200 && rr < 60, `cadre à droite : image bleue (${rr},${rg},${rb})`);
const m1 = pixel(mid.out, 5, 20, 700); const m2 = pixel(mid.out, 5, 700, 700);
ok(m1[0] > 200 && m2[2] > 200, `cadre au centre : rouge à gauche, bleu à droite (${m1}, ${m2})`);
// Sous-titres (bande du bas, au-dessus de la zone des réseaux) et titre (haut), présents seulement pendant leur minute.
const capBand = [1280 * 0.60, 1280 * 0.18]; const titleBand = [1280 * 0.10, 1280 * 0.12];
const w1 = lightCount(left.out, 2, ...capBand, true); const w0 = lightCount(left.out, 0.6, ...capBand, true); const w3 = lightCount(left.out, 9.2, ...capBand, true);
ok(w1 > 300 && w0 < 30 && w3 < 30, `sous-titre blanc visible à 2 s (${w1} pixels), absent avant (${w0}) et après (${w3})`);
const t1 = lightCount(left.out, 1.5, ...titleBand, false); const t6 = lightCount(left.out, 6, ...titleBand, false);
ok(t1 > 300 && t6 < 30, `titre doré visible à 1,5 s (${t1} pixels), disparu à 6 s (${t6})`);
// Rendu réel du mot dit en or (fond bleu) : doré pendant « UN », puis pendant « DEUX », jamais tout blanc pendant le groupe.
{
  const kp = buildPlan({ timeline: tlc, short: { cropX: 100, captions: [{ s: 3, e: 7, text: 'UN DEUX', words: [{ s: 3, e: 4.5, w: 'UN' }, { s: 5, e: 6.5, w: 'DEUX' }] }], wantCaptions: true, titleText: '', karaoke: true } });
  const kd = path.join(dir, 'wkar'); fs.mkdirSync(kd);
  const kr = await W.renderFiles({ plan: kp, files: { source: P('source.mp4'), curves: {} }, dir: kd, threads: 2 });
  const g1 = lightCount(kr.out, 1.7, ...capBand, false); const g2 = lightCount(kr.out, 3.7, ...capBand, false);
  const w1k = lightCount(kr.out, 1.7, ...capBand, true); const w2k = lightCount(kr.out, 3.7, ...capBand, true);
  ok(g1 > 200 && g2 > 200 && w1k > 200 && w2k > 200, `rendu : un mot en or et l’autre en blanc, à 1,7 s (or ${g1}, blanc ${w1k}) et à 3,7 s (or ${g2}, blanc ${w2k})`);
}
const prev = await render(50, true);
const pv = JSON.parse(execFileSync('ffprobe', ['-v', 'error', '-print_format', 'json', '-show_streams', prev.out]).toString()).streams.find((s) => s.codec_type === 'video');
ok(pv.width === 360 && pv.height === 640, `aperçu rapide ${pv.width}x${pv.height}`);

console.log(fails ? `\nÉCHECS : ${fails}` : '\nTout est bon');
process.exit(fails ? 1 : 0);
