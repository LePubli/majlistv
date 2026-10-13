// Ouvrages : filigrane des PDF et liens de téléchargement à durée limitée.
import crypto from 'node:crypto';
import { PDFDocument, StandardFonts, rgb, degrees } from 'pdf-lib';
import { config } from './config.js';

const clean = (s) => String(s).replace(/[^\x20-\x7E]/g, '?'); // police standard du PDF : ASCII seulement

// Ajoute sur chaque page : une ligne en pied de page et un filigrane diagonal discret, tous deux avec l'adresse e-mail de l'abonné et la date.
export async function watermarkPdf(buffer, email, date) {
  const doc = await PDFDocument.load(buffer);
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const line = clean(`Mejliss TV - copie personnelle de ${email} - ${date} - ne pas diffuser`);
  const mark = clean(`${email} - ${date}`);
  for (const page of doc.getPages()) {
    const { width, height } = page.getSize();
    page.drawText(line, { x: 20, y: 10, size: 7, font, color: rgb(0.3, 0.3, 0.3), opacity: 0.9, maxWidth: width - 40 });
    const size = Math.max(14, Math.min(34, (Math.hypot(width, height) * 0.7) / Math.max(10, mark.length) * 1.7));
    const w = font.widthOfTextAtSize(mark, size);
    const a = Math.PI / 4;
    page.drawText(mark, { x: width / 2 - (w / 2) * Math.cos(a), y: height / 2 - (w / 2) * Math.sin(a), size, font, color: rgb(0.5, 0.5, 0.5), opacity: 0.12, rotate: degrees(45) });
  }
  doc.setSubject(clean(`Copie personnelle de ${email}`));
  doc.setKeywords([mark]);
  return Buffer.from(await doc.save());
}

// Compte les pages et refuse un PDF illisible ou protégé par mot de passe.
export async function inspectPdf(buffer) {
  if (buffer.subarray(0, 5).toString() !== '%PDF-') throw new Error("Ce fichier n'est pas un PDF");
  try {
    const doc = await PDFDocument.load(buffer);
    return { pages: doc.getPageCount() };
  } catch (err) {
    throw new Error(/encrypt/i.test(err.message) ? 'PDF protégé par mot de passe : retirez la protection avant de l\'envoyer' : 'PDF illisible ou corrompu');
  }
}

// Jeton de téléchargement signé (HMAC), distinct du jeton de connexion : { b: ouvrage, l: langue, u: membre, e: échéance }.
const sig = (payload) => crypto.createHmac('sha256', `${config.jwtSecret}:book-download`).update(payload).digest('base64url');
export function signDownload(data, minutes) {
  const payload = Buffer.from(JSON.stringify({ ...data, e: Date.now() + minutes * 60000 })).toString('base64url');
  return `${payload}.${sig(payload)}`;
}
export function verifyDownload(token) {
  const [payload, mac] = String(token).split('.');
  if (!payload || !mac) return null;
  const good = Buffer.from(sig(payload));
  const got = Buffer.from(mac);
  if (good.length !== got.length || !crypto.timingSafeEqual(good, got)) return null;
  try {
    const d = JSON.parse(Buffer.from(payload, 'base64url').toString());
    return d.e > Date.now() ? d : null;
  } catch { return null; }
}
