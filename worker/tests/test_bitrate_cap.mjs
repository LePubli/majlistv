// Débit des qualités plafonné par celui de la source (registre n°57). Usage : node worker/tests/test_bitrate_cap.mjs (ffmpeg requis)
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readdirSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { buildArgs, probe, transcode, videoKbpsFor, sourceVideoKbps, RENDITIONS } from '../src/transcode.js';

const ok = (c, m) => { console.log((c ? 'OK   ' : 'FAIL ') + m); if (!c) process.exit(1); };
const [q360, q720, q1080] = RENDITIONS;

// Règle : cas de la conférence de 48 min (1080p, ≈ 820 kbit/s de vidéo)
ok(videoKbpsFor(q1080, 1080, 820) === 820, '1080p : débit de la source (820), pas 5000');
ok(videoKbpsFor(q720, 1080, 820) === 547, '720p : en proportion (547)');
ok(videoKbpsFor(q360, 1080, 820) === 273, '360p : en proportion (273)');
const total = (820 + 547 + 273 + 128 + 128 + 96) * 2884 / 8 / 1024;
ok(total < 800, `conférence de 48 min : ≈ ${Math.round(total)} Mo convertis (au lieu de ≈ 3 100)`);
// Source de bonne qualité : réglages d'avant inchangés
ok(videoKbpsFor(q1080, 1080, 8000) === 5000 && videoKbpsFor(q720, 1080, 8000) === 2800 && videoKbpsFor(q360, 1080, 8000) === 800, 'source riche : 5000 / 2800 / 800 inchangés');
// Source très pauvre : plancher, jamais au-dessus de la source
ok(videoKbpsFor(q720, 720, 300) === 300 && videoKbpsFor(q360, 720, 300) === 250, 'source pauvre : plancher sans dépasser la source');
ok(videoKbpsFor(q720, 720, 0) === 2800, 'débit inconnu : réglage d\'avant');
// Lecture du débit de la source
ok(sourceVideoKbps({ streams: [] }, { bit_rate: '820000' }, 10) === 820, 'débit de la piste vidéo');
ok(sourceVideoKbps({ format: { bit_rate: '1000000' }, streams: [{ codec_type: 'audio', bit_rate: '128000' }] }, {}, 10) === 872, 'débit total moins audio (webm/mkv)');
ok(sourceVideoKbps({ format: { size: String(125000 * 100) }, streams: [] }, {}, 100) === 1000, 'taille / durée en dernier recours');

// Vraie conversion : source 720p à ≈ 400 kbit/s -> aucune qualité au-dessus de la source
const tmp = mkdtempSync(path.join(tmpdir(), 'cap-'));
const input = path.join(tmp, 'in.mp4');
execFileSync('ffmpeg', ['-v', 'error', '-f', 'lavfi', '-i', 'testsrc2=size=1280x720:rate=25:duration=24', '-f', 'lavfi', '-i', 'sine=duration=24',
  '-c:v', 'libx264', '-b:v', '400k', '-maxrate', '420k', '-bufsize', '800k', '-c:a', 'aac', '-b:a', '96k', '-shortest', input]);
const info = await probe(input);
ok(info.videoKbps > 250 && info.videoKbps < 600, `débit de la source lu : ${info.videoKbps} kbit/s`);
const { args } = buildArgs({ input, outDir: tmp, info });
ok(args.includes(`${info.videoKbps}k`), 'la qualité 720p reçoit le débit de la source');
ok(!args.includes('2800k'), 'plus de 2800 kbit/s imposés');
const out = path.join(tmp, 'out');
await transcode({ input, outDir: out, info, threads: 2 });
const size = (d) => readdirSync(d).reduce((t, f) => t + statSync(path.join(d, f)).size, 0);
const inSize = statSync(input).size; const v0 = size(path.join(out, 'v0')); const v1 = size(path.join(out, 'v1'));
console.log(`     source ${Math.round(inSize / 1024)} Ko · 360p ${Math.round(v0 / 1024)} Ko · 720p ${Math.round(v1 / 1024)} Ko`);
ok(v1 < inSize * 1.35, '720p convertie : pas plus grosse que la source (± marge du conteneur)');
ok(v0 < v1, '360p plus légère que 720p');
console.log('TOUT EST OK');
