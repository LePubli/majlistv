// Reconnaissance d'un format de fichier à ses premiers octets (on ne se fie jamais à l'extension ni au type annoncé).

// Image : png, jpeg, gif, webp ou null.
export function imageFormat(buf) {
  if (buf.length > 12 && buf.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return 'png';
  if (buf.length > 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return 'jpeg';
  if (buf.length > 6 && buf.subarray(0, 4).toString('latin1') === 'GIF8') return 'gif';
  if (buf.length > 12 && buf.subarray(0, 4).toString('latin1') === 'RIFF' && buf.subarray(8, 12).toString('latin1') === 'WEBP') return 'webp';
  return null;
}

// Police : woff2, woff, opentype, truetype ou null.
export function fontFormat(buf) {
  const sig = buf.subarray(0, 4);
  if (sig.toString('latin1') === 'wOF2') return 'woff2';
  if (sig.toString('latin1') === 'wOFF') return 'woff';
  if (sig.toString('latin1') === 'OTTO') return 'opentype';
  if (sig.equals(Buffer.from([0, 1, 0, 0])) || sig.toString('latin1') === 'true') return 'truetype';
  return null;
}
