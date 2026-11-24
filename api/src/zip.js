// Lecture et écriture de fichiers .zip, sans dépendance (thèmes uploadables, lot T).
// Lecture : méthodes « stocké » et « deflate » seulement, pas de zip64, pas de chiffrement ; protections contre les archives piégées
// (nombre de fichiers, taille déclarée ET réelle, chemins dangereux, doublons).
import zlib from 'node:zlib';

export const ZIP_LIMITS = { files: 300, fileBytes: 5 * 1024 * 1024, totalBytes: 40 * 1024 * 1024 };

const SIG_EOCD = 0x06054b50, SIG_CEN = 0x02014b50, SIG_LOC = 0x04034b50;

// Chemin sûr : relatif, sans « .. », sans antislash, sans caractère de contrôle, 200 caractères au plus.
export function safeEntryName(name) {
  if (typeof name !== 'string' || !name || name.length > 200) return false;
  if (name.startsWith('/') || name.includes('\\') || /[\u0000-\u001f]/.test(name) || /^[A-Za-z]:/.test(name)) return false;
  return !name.split('/').some((p) => p === '..' || p === '.' );
}

// Renvoie [{ name, data }] (dossiers ignorés) ou lève une Error au message lisible.
export function readZip(buf, limits = ZIP_LIMITS) {
  if (!Buffer.isBuffer(buf) || buf.length < 22) throw new Error('Ce n’est pas un fichier .zip');
  let eocd = -1;
  for (let i = buf.length - 22; i >= Math.max(0, buf.length - 22 - 65535); i--) { if (buf.readUInt32LE(i) === SIG_EOCD) { eocd = i; break; } }
  if (eocd < 0) throw new Error('Ce n’est pas un fichier .zip');
  const count = buf.readUInt16LE(eocd + 10);
  let off = buf.readUInt32LE(eocd + 16);
  if (count === 0xffff || off === 0xffffffff) throw new Error('Zip64 non pris en charge');
  if (count > limits.files) throw new Error(`Trop de fichiers (${limits.files} au maximum)`);
  const out = []; const seen = new Set(); let total = 0;
  for (let n = 0; n < count; n++) {
    if (off + 46 > buf.length || buf.readUInt32LE(off) !== SIG_CEN) throw new Error('Archive abîmée');
    const flags = buf.readUInt16LE(off + 8), method = buf.readUInt16LE(off + 10);
    const csize = buf.readUInt32LE(off + 20), usize = buf.readUInt32LE(off + 24);
    const nlen = buf.readUInt16LE(off + 28), elen = buf.readUInt16LE(off + 30), clen = buf.readUInt16LE(off + 32);
    const lho = buf.readUInt32LE(off + 42);
    const name = buf.subarray(off + 46, off + 46 + nlen).toString('utf8');
    off += 46 + nlen + elen + clen;
    if (name.endsWith('/')) continue; // dossier
    if (flags & 1) throw new Error('Archive chiffrée non prise en charge');
    if (!safeEntryName(name)) throw new Error(`Chemin refusé dans l’archive : « ${name.slice(0, 60)} »`);
    if (name.startsWith('__MACOSX/') || name.endsWith('.DS_Store')) continue;
    if (seen.has(name.toLowerCase())) throw new Error(`Fichier en double : « ${name} »`);
    seen.add(name.toLowerCase());
    if (usize > limits.fileBytes) throw new Error(`« ${name} » est trop lourd (${Math.round(limits.fileBytes / 1048576)} Mo au maximum)`);
    total += usize;
    if (total > limits.totalBytes) throw new Error(`Archive trop lourde une fois décompressée (${Math.round(limits.totalBytes / 1048576)} Mo au maximum)`);
    if (lho + 30 > buf.length || buf.readUInt32LE(lho) !== SIG_LOC) throw new Error('Archive abîmée');
    const start = lho + 30 + buf.readUInt16LE(lho + 26) + buf.readUInt16LE(lho + 28);
    if (start + csize > buf.length) throw new Error('Archive abîmée');
    const raw = buf.subarray(start, start + csize);
    let data;
    if (method === 0) data = Buffer.from(raw);
    else if (method === 8) {
      try { data = zlib.inflateRawSync(raw, { maxOutputLength: limits.fileBytes + 1 }); } catch { throw new Error(`« ${name} » est abîmé ou trop gros`); }
    } else throw new Error(`Compression non prise en charge pour « ${name} »`);
    if (data.length !== usize || data.length > limits.fileBytes) throw new Error(`« ${name} » : taille incohérente`);
    out.push({ name, data });
  }
  return out;
}

// Écrit un .zip (deflate) à partir de [{ name, data }] — utilisé par le kit de thèmes. Ordre et dates fixes : le résultat est reproductible.
export function writeZip(entries) {
  const parts = []; const central = []; let offset = 0;
  const sorted = [...entries].sort((a, b) => (a.name < b.name ? -1 : 1));
  for (const e of sorted) {
    const name = Buffer.from(e.name, 'utf8');
    const data = Buffer.isBuffer(e.data) ? e.data : Buffer.from(e.data);
    const comp = zlib.deflateRawSync(data, { level: 9 });
    const useComp = comp.length < data.length;
    const body = useComp ? comp : data;
    const crc = zlib.crc32(data) >>> 0;
    const lh = Buffer.alloc(30);
    lh.writeUInt32LE(SIG_LOC, 0); lh.writeUInt16LE(20, 4); lh.writeUInt16LE(0x0800, 6); lh.writeUInt16LE(useComp ? 8 : 0, 8);
    lh.writeUInt16LE(0, 10); lh.writeUInt16LE(0x21, 12); // 1980-01-01
    lh.writeUInt32LE(crc, 14); lh.writeUInt32LE(body.length, 18); lh.writeUInt32LE(data.length, 22); lh.writeUInt16LE(name.length, 26);
    parts.push(lh, name, body);
    const ch = Buffer.alloc(46);
    ch.writeUInt32LE(SIG_CEN, 0); ch.writeUInt16LE(20, 4); ch.writeUInt16LE(20, 6); ch.writeUInt16LE(0x0800, 8); ch.writeUInt16LE(useComp ? 8 : 0, 10);
    ch.writeUInt16LE(0, 12); ch.writeUInt16LE(0x21, 14); ch.writeUInt32LE(crc, 16); ch.writeUInt32LE(body.length, 20); ch.writeUInt32LE(data.length, 24);
    ch.writeUInt16LE(name.length, 28); ch.writeUInt32LE(offset, 42);
    central.push(ch, name);
    offset += lh.length + name.length + body.length;
  }
  const cen = Buffer.concat(central);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(SIG_EOCD, 0); end.writeUInt16LE(sorted.length, 8); end.writeUInt16LE(sorted.length, 10); end.writeUInt32LE(cen.length, 12); end.writeUInt32LE(offset, 16);
  return Buffer.concat([...parts, cen, end]);
}
