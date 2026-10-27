// Étape 32 — Cartes à partager (citation du jour, phrase d'une conférence) : calculs purs (testés avec Node) + dessin sur canvas (navigateur).
// Le dessin se fait côté navigateur : l'arabe est assemblé par le navigateur lui-même (lettres liées, sens de lecture), avec les polices du site.

export const FORMATS = {
  square: { w: 1080, h: 1080, label: 'shSquare' },
  story: { w: 1080, h: 1920, label: 'shStory' },
  wide: { w: 1200, h: 630, label: 'shWide' },
};
export const GOLD = '#E6A739';
export const BG = '#0B0906';

const RTL = /[֐-ࣿיִ-﷿ﹰ-﻿]/;
/** Le texte est-il écrit de droite à gauche (arabe, hébreu, persan, ourdou) ? Majorité de lettres RTL. */
export function isRtlText(text) {
  const letters = String(text || '').match(/\p{L}/gu) || [];
  if (!letters.length) return false;
  return letters.filter((c) => RTL.test(c)).length / letters.length > 0.5;
}

/** Raccourcit proprement (sur un espace) avec « … » ; ne coupe rien si le texte tient. */
export function clipText(text, max) {
  const s = String(text || '').replace(/\s+/g, ' ').trim();
  if (s.length <= max) return s;
  const cut = s.slice(0, max - 1);
  const sp = cut.lastIndexOf(' ');
  return `${(sp > max * 0.6 ? cut.slice(0, sp) : cut).trimEnd()}…`;
}

/** Retour à la ligne. measure(chaîne) → largeur en pixels. Un mot plus large que la ligne est coupé par lettres. */
export function wrapLines(measure, text, maxWidth) {
  const words = String(text || '').split(/\s+/).filter(Boolean);
  const lines = [];
  let cur = '';
  const push = () => { if (cur) { lines.push(cur); cur = ''; } };
  for (const w of words) {
    const test = cur ? `${cur} ${w}` : w;
    if (measure(test) <= maxWidth) { cur = test; continue; }
    push();
    if (measure(w) <= maxWidth) { cur = w; continue; }
    let part = '';
    for (const ch of Array.from(w)) {
      if (part && measure(part + ch) > maxWidth) { lines.push(part); part = ch; } else part += ch;
    }
    cur = part;
  }
  push();
  return lines;
}

/**
 * Plus grande taille de police (entre min et max) pour laquelle l'ensemble des blocs tient dans maxHeight.
 * blocks : [{ text, ratio (taille relative à la taille de base), lineHeight }] ; measureAt(taille, bloc) → fonction de mesure.
 * Renvoie { size, layouts: [{ lines, fontSize, lineHeight }], height }.
 */
export function fitBlocks(blocks, { maxWidth, maxHeight, max = 72, min = 22, gap = 36, measureAt }) {
  const layout = (size) => {
    const layouts = blocks.map((b) => {
      const fontSize = Math.round(size * (b.ratio || 1));
      const lines = wrapLines(measureAt(fontSize, b), b.text, maxWidth);
      return { lines, fontSize, lineHeight: Math.round(fontSize * (b.lineHeight || 1.4)) };
    });
    const height = layouts.reduce((h, l, i) => h + l.lines.length * l.lineHeight + (i ? gap : 0), 0);
    return { size, layouts, height };
  };
  let best = layout(min);
  for (let s = max; s >= min; s -= 2) {
    const l = layout(s);
    if (l.height <= maxHeight) { best = l; break; }
  }
  return best;
}

/** Nom de fichier propre pour le téléchargement. */
export function cardFileName(prefix, format) {
  const base = String(prefix || 'carte').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40) || 'carte';
  return `${base}-${format}.png`;
}

/** Instant « 12:34 » ou « 1:02:03 » à partir de secondes. */
export function clockLabel(sec) {
  const s = Math.max(0, Math.floor(sec));
  const h = Math.floor(s / 3600);
  const m = String(Math.floor((s % 3600) / 60)).padStart(h ? 2 : 1, '0');
  return `${h ? `${h}:` : ''}${m}:${String(s % 60).padStart(2, '0')}`;
}

// ---------------------------------------------------------------------------------------------------------------------
// Dessin (navigateur seulement)
const AR_FONT = "'Noto Sans Arabic Variable', 'Noto Kufi Arabic Variable', 'Segoe UI', 'Traditional Arabic', serif";
const LAT_FONT = "'DM Sans Variable', 'Montserrat Variable', 'Noto Sans Arabic Variable', system-ui, 'Segoe UI', sans-serif";
const TITLE_FONT = "'Montserrat Variable', 'Noto Kufi Arabic Variable', system-ui, sans-serif";

const loadImage = (src) => new Promise((resolve) => { const i = new Image(); i.onload = () => resolve(i); i.onerror = () => resolve(null); i.src = src; });

/** Charge les polices du site avant de dessiner (sinon le canvas utilise une police de secours). */
async function ensureFonts() {
  if (typeof document === 'undefined' || !document.fonts?.load) return;
  const jobs = [
    document.fonts.load(`600 40px ${AR_FONT.split(',')[0]}`, 'بسم الله'),
    document.fonts.load(`500 40px ${LAT_FONT.split(',')[0]}`, 'Abc'),
    document.fonts.load(`700 40px ${TITLE_FONT.split(',')[0]}`, 'Abc'),
  ];
  await Promise.race([Promise.allSettled(jobs), new Promise((r) => setTimeout(r, 2500))]);
}

/**
 * Dessine la carte sur le canvas et renvoie ce canvas.
 * card : { ar?, fr?, attribution?, kicker?, stamp? } — fr peut contenir un texte arabe seul (transcription en arabe) : il est alors dessiné en arabe.
 */
export async function renderCard(canvas, formatKey, card) {
  const f = FORMATS[formatKey] || FORMATS.square;
  const { w, h } = f;
  canvas.width = w; canvas.height = h;
  const ctx = canvas.getContext('2d');
  await ensureFonts();
  const [emblem, wordmark] = await Promise.all([loadImage('/brand/emblem.png'), loadImage('/brand/wordmark.png')]);

  const tall = h > w * 1.2, wide = w > h * 1.3;
  const pad = Math.round(w * (wide ? 0.06 : 0.09));

  // Fond noir, halo or, cadre fin.
  ctx.fillStyle = BG; ctx.fillRect(0, 0, w, h);
  const glow = ctx.createRadialGradient(w / 2, h * 0.35, 0, w / 2, h * 0.35, Math.max(w, h) * 0.75);
  glow.addColorStop(0, 'rgba(230,167,57,0.22)'); glow.addColorStop(1, 'rgba(230,167,57,0)');
  ctx.fillStyle = glow; ctx.fillRect(0, 0, w, h);
  ctx.strokeStyle = 'rgba(230,167,57,0.55)'; ctx.lineWidth = 3;
  const inset = Math.round(w * 0.028);
  const rr = (x, y, ww, hh, r) => { ctx.beginPath(); ctx.moveTo(x + r, y); ctx.arcTo(x + ww, y, x + ww, y + hh, r); ctx.arcTo(x + ww, y + hh, x, y + hh, r); ctx.arcTo(x, y + hh, x, y, r); ctx.arcTo(x, y, x + ww, y, r); ctx.closePath(); };
  rr(inset, inset, w - inset * 2, h - inset * 2, 36); ctx.stroke();

  // En-tête : emblème + intitulé (kicker) ; pied : logo et adresse du site.
  const top = pad * 0.75 + inset;
  let y = top;
  const headH = Math.round(h * (wide ? 0.11 : 0.06));
  if (emblem) { const eh = headH; const ew = eh * (emblem.width / emblem.height); ctx.drawImage(emblem, w / 2 - ew / 2, y, ew, eh); }
  y += headH + 14;
  if (card.kicker) {
    ctx.fillStyle = GOLD; ctx.textAlign = 'center'; ctx.textBaseline = 'top'; ctx.direction = 'ltr';
    ctx.font = `700 ${Math.round(w * (wide ? 0.02 : 0.026))}px ${TITLE_FONT}`;
    ctx.fillText(String(card.kicker).toUpperCase(), w / 2, y);
    y += Math.round(w * 0.04);
  }
  const footH = Math.round(h * (wide ? 0.12 : 0.075));
  const footY = h - inset - pad * 0.55 - footH;

  // Textes : arabe (si présent) puis traduction / texte.
  const frIsRtl = isRtlText(card.fr);
  const blocks = [];
  if (card.ar) blocks.push({ key: 'ar', text: clipText(card.ar, tall ? 700 : 460), ratio: 1.0, lineHeight: 1.75, rtl: true });
  if (card.fr) blocks.push({ key: 'fr', text: clipText(card.fr, tall ? 520 : 360), ratio: card.ar ? 0.66 : 1.0, lineHeight: frIsRtl ? 1.75 : 1.42, rtl: frIsRtl });
  const attrH = card.attribution ? Math.round(w * 0.07) : 0;
  const areaTop = y + 8;
  const areaH = footY - areaTop - attrH - 24;
  const maxW = w - pad * 2;
  ctx.textBaseline = 'alphabetic';
  const measureAt = (size, b) => { ctx.font = b.rtl ? `600 ${size}px ${AR_FONT}` : `500 ${size}px ${LAT_FONT}`; ctx.direction = b.rtl ? 'rtl' : 'ltr'; return (s) => ctx.measureText(s).width; };
  const fit = fitBlocks(blocks, { maxWidth: maxW, maxHeight: areaH, max: tall ? 84 : 76, min: 24, gap: 34, measureAt });
  let ty = areaTop + Math.max(0, (areaH - fit.height) / 2);
  fit.layouts.forEach((L, i) => {
    const b = blocks[i];
    ctx.font = b.rtl ? `600 ${L.fontSize}px ${AR_FONT}` : `500 ${L.fontSize}px ${LAT_FONT}`;
    ctx.direction = b.rtl ? 'rtl' : 'ltr'; ctx.textAlign = 'center';
    ctx.fillStyle = b.key === 'ar' ? '#FFFFFF' : (card.ar ? 'rgba(255,255,255,0.92)' : '#FFFFFF');
    L.lines.forEach((line) => { ty += L.lineHeight; ctx.fillText(line, w / 2, ty - (L.lineHeight - L.fontSize) / 2); });
    ty += 34;
  });

  // Filet et attribution en or.
  if (card.attribution) {
    const ay = footY - attrH * 0.55;
    ctx.strokeStyle = GOLD; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(w / 2 - w * 0.06, ay - attrH * 0.55); ctx.lineTo(w / 2 + w * 0.06, ay - attrH * 0.55); ctx.stroke();
    ctx.fillStyle = GOLD; ctx.direction = isRtlText(card.attribution) ? 'rtl' : 'ltr'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    const size = Math.round(w * (wide ? 0.024 : 0.03));
    ctx.font = `600 ${size}px ${LAT_FONT}`;
    const lines = wrapLines((s) => ctx.measureText(s).width, clipText(card.attribution, 140), maxW).slice(0, 2);
    lines.forEach((l, i) => ctx.fillText(l, w / 2, ay + i * size * 1.3));
  }

  // Pied : logo Mejliss TV et adresse du site.
  ctx.textBaseline = 'middle'; ctx.direction = 'ltr';
  const fy = footY + footH / 2;
  if (wordmark) { const wh = Math.round(footH * 0.5); const ww = wh * (wordmark.width / wordmark.height); ctx.drawImage(wordmark, pad, fy - wh / 2, ww, wh); }
  ctx.fillStyle = 'rgba(255,255,255,0.75)'; ctx.textAlign = 'right';
  ctx.font = `500 ${Math.round(w * (wide ? 0.02 : 0.025))}px ${LAT_FONT}`;
  const host = card.host || (typeof location !== 'undefined' ? location.host : '');
  ctx.fillText(card.stamp ? `${card.stamp}  ·  ${host}` : host, w - pad, fy);
  return canvas;
}

/** Image PNG de la carte (Blob). */
export const cardBlob = (canvas) => new Promise((resolve) => canvas.toBlob((b) => resolve(b), 'image/png'));
