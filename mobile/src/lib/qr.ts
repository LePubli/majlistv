// Modules d'un QR code (JavaScript pur, qrcode-generator) : vrai = carré noir. Testé avec Node.
import qrcode from 'qrcode-generator';

export function qrMatrix(text: string): boolean[][] {
  const qr = qrcode(0, 'M');
  qr.addData(text);
  qr.make();
  const n = qr.getModuleCount();
  return Array.from({ length: n }, (_, r) => Array.from({ length: n }, (__, c) => qr.isDark(r, c)));
}
