'use client';
// QR code dessiné en SVG (aucune image externe : compatible avec la politique de sécurité du site). Sert à l'activation de la 2FA.
import { useMemo } from 'react';
import QRCode from 'qrcode';

export default function QrCode({ text, label }) {
  const art = useMemo(() => {
    try {
      const q = QRCode.create(text, { errorCorrectionLevel: 'M' });
      const n = q.modules.size, d = q.modules.data;
      let path = '';
      for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) if (d[y * n + x]) path += `M${x} ${y}h1v1h-1z`;
      return { n, path };
    } catch { return null; }
  }, [text]);
  if (!art) return null;
  const pad = 3;
  return (
    <svg className="qr" viewBox={`${-pad} ${-pad} ${art.n + pad * 2} ${art.n + pad * 2}`} role="img" aria-label={label} shapeRendering="crispEdges">
      <rect x={-pad} y={-pad} width={art.n + pad * 2} height={art.n + pad * 2} fill="#fff" />
      <path d={art.path} fill="#000" />
    </svg>
  );
}
