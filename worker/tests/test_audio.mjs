// 17a : génération de la rendition audio (ffmpeg requis). Usage : node worker/tests/test_audio.mjs [dossier-sortie]
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readdirSync, readFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { buildAudioArgs, makeAudio } from '../src/transcode.js';

const ok = (c, m) => { console.log((c ? 'OK   ' : 'FAIL ') + m); if (!c) process.exit(1); };
const tmp = mkdtempSync(path.join(tmpdir(), 'aud-'));
const input = path.join(tmp, 'in.mp4');
execFileSync('ffmpeg', ['-v', 'error', '-f', 'lavfi', '-i', 'testsrc=size=320x180:rate=15:duration=20', '-f', 'lavfi', '-i', 'sine=frequency=440:duration=20',
  '-c:v', 'libx264', '-c:a', 'aac', '-shortest', input]);

const args = buildAudioArgs({ input, outDir: '/x', copy: true });
ok(args.includes('-vn') && args.includes('copy'), 'copy : pas de vidéo, audio copié');
ok(buildAudioArgs({ input, outDir: '/x', copy: false }).includes('aac'), 'sans copy : ré-encodage AAC');

const out = process.argv[2] || path.join(tmp, 'audio');
await makeAudio({ input, outDir: out, copy: true });
const files = readdirSync(out);
ok(files.includes('index.m3u8') && files.includes('init.mp4') && files.some((f) => f.endsWith('.m4s')), 'playlist + init + segments : ' + files.join(','));
const pl = readFileSync(path.join(out, 'index.m3u8'), 'utf8');
ok(pl.includes('#EXT-X-MAP') && pl.includes('#EXT-X-ENDLIST'), 'playlist VOD fMP4');
const probe = JSON.parse(execFileSync('ffprobe', ['-v', 'error', '-show_streams', '-of', 'json', path.join(out, 'init.mp4')]).toString());
ok(!probe.streams.some((s) => s.codec_type === 'video'), 'aucune piste vidéo dans la rendition');
ok(existsSync(path.join(out, 'index.m3u8')), 'terminé');
