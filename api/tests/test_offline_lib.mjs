// 22b-6 : fonctions pures du module « Hors connexion ».
import assert from 'node:assert/strict';
import { parseMaster, pickVariant, offeredHeights, estimateBytes, offlineKey, expiresAt, ffmpegArgs, AUDIO_BANDWIDTH } from '../src/modules/offline/lib.js';

const master = `#EXTM3U
#EXT-X-VERSION:7
#EXT-X-STREAM-INF:BANDWIDTH=1300000,RESOLUTION=1280x720,CODECS="avc1.64001f,mp4a.40.2"
v1/index.m3u8?t=abc&v=0
#EXT-X-STREAM-INF:BANDWIDTH=450000,RESOLUTION=640x360
v0/index.m3u8?t=abc&v=0
#EXT-X-STREAM-INF:BANDWIDTH=5000000,RESOLUTION=1920x1080
v2/index.m3u8
#EXT-X-STREAM-INF:BANDWIDTH=1,RESOLUTION=2x2
http://evil/x.m3u8
`;
const v = parseMaster(master);
assert.deepEqual(v.map((x) => [x.path, x.height, x.bandwidth]), [['v0/index.m3u8', 360, 450000], ['v1/index.m3u8', 720, 1300000], ['v2/index.m3u8', 1080, 5000000]]);
assert.deepEqual(parseMaster(''), []); assert.deepEqual(parseMaster(null), []);
assert.equal(pickVariant(v, 720).height, 720); assert.equal(pickVariant(v, 360).height, 360); assert.equal(pickVariant(v, 500).height, 360); assert.equal(pickVariant(v, 100).height, 360);
assert.equal(pickVariant([], 360), null);
assert.deepEqual(offeredHeights(v).map((x) => x.height), [360, 720]);
assert.deepEqual(offeredHeights([v[0]]).map((x) => x.height), [360], 'une seule qualité : pas de doublon');
assert.deepEqual(offeredHeights([{ path: 'v0/index.m3u8', height: 144, bandwidth: 1 }]).map((x) => x.height), [144], 'source petite');
assert.equal(estimateBytes(450000, 2880), Math.ceil(450000 * 2880 / 8 / 1048576) * 1048576);
assert.equal(estimateBytes(0, 100), 0); assert.equal(estimateBytes(100, 0), 0);
assert.equal(AUDIO_BANDWIDTH, 64000);
assert.equal(offlineKey('t1', '0', 'audio', 0), 'offline/t1/0/audio.m4a'); assert.equal(offlineKey('t1', 'abc', 'video', 720), 'offline/t1/abc/video-720.mp4');
const now = Date.UTC(2026, 9, 22);
assert.equal(expiresAt(now, 30), new Date(now + 30 * 86400000).toISOString()); assert.equal(expiresAt(now, 0), new Date(now + 30 * 86400000).toISOString()); assert.equal(expiresAt(now, 7), new Date(now + 7 * 86400000).toISOString());
const a = ffmpegArgs('/t/in.m3u8', '/t/out.m4a', 'audio'); assert.ok(a.includes('-vn') && a.includes('ipod') && a.includes('copy') && !a.includes('-map'));
const m = ffmpegArgs('/t/in.m3u8', '/t/out.mp4', 'video'); assert.ok(m.includes('mp4') && m.includes('+faststart') && m.includes('copy') && !m.includes('-vn'));
assert.ok(m.includes('file,http,https,tcp,tls,crypto'));
console.log('test_offline_lib OK');
