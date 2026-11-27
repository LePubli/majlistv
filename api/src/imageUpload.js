// Réception d'une image (data-URL JPEG / PNG / WebP, 2,5 Mo max) partagée par les séries et les collections.
import { putObject } from './storage.js';

const EXT = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' };

// Renvoie { key } une fois l'image enregistrée, ou { error } si elle est invalide.
export async function storeImage(prefix, id, image) {
  const m = String(image || '').match(/^data:(image\/(?:jpeg|png|webp));base64,([A-Za-z0-9+/=]+)$/);
  if (!m) return { error: 'Image JPEG, PNG ou WebP attendue' };
  const buf = Buffer.from(m[2], 'base64');
  const magic = (m[1] === 'image/jpeg' && buf[0] === 0xff && buf[1] === 0xd8)
    || (m[1] === 'image/png' && buf.subarray(1, 4).toString() === 'PNG')
    || (m[1] === 'image/webp' && buf.subarray(0, 4).toString() === 'RIFF' && buf.subarray(8, 12).toString() === 'WEBP');
  if (!magic || buf.length > 2.5 * 1024 * 1024) return { error: 'Image invalide ou trop lourde (2,5 Mo maximum)' };
  const key = `${prefix}/${id}-${Date.now()}.${EXT[m[1]]}`;
  await putObject(key, buf, m[1]);
  return { key };
}
