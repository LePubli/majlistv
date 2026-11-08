// Amélioration 5.3 (étape 2) — Rapport annonceur : jeton secret, courbe par jour, PDF.
import crypto from 'node:crypto';
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';
import { clickRate } from './ads.js';

export const REPORT_DAYS = 90;
export const TOKEN_RE = /^[A-Za-z0-9_-]{20,64}$/;
/** Nouveau jeton secret (32 caractères, 192 bits d'aléa). */
export const newReportToken = () => crypto.randomBytes(24).toString('base64url');

const iso = (d) => d.toISOString().slice(0, 10);
/** Courbe jour par jour sur `days` jours se terminant à `today` (AAAA-MM-JJ) ; les jours sans donnée valent 0. */
export function fillDays(rows, today, days = REPORT_DAYS) {
  const byDay = new Map(rows.map((r) => [r.day, r]));
  const end = new Date(`${today}T00:00:00Z`);
  const out = [];
  for (let i = days - 1; i >= 0; i--) {
    const day = iso(new Date(end.getTime() - i * 86400000));
    const r = byDay.get(day);
    out.push({ day, impressions: r?.impressions ?? 0, clicks: r?.clicks ?? 0 });
  }
  return out;
}

/** Données du rapport (aucune donnée personnelle, aucun lien ni jeton). */
export function buildReport(ad, daily, byLang, today, status) {
  return {
    advertiser: ad.advertiser, title: ad.title, status, startsAt: ad.starts_at, endsAt: ad.ends_at, createdAt: ad.created_at,
    languages: ad.languages || [],
    totals: { impressions: ad.impressions, clicks: ad.clicks, skips: ad.skips, ctr: clickRate(ad.impressions, ad.clicks) },
    byLang: Object.fromEntries(Object.entries(byLang).map(([k, v]) => [k, { ...v, ctr: clickRate(v.impressions, v.clicks) }])),
    daily: fillDays(daily, today),
    generatedAt: new Date().toISOString(),
  };
}

const STATUS_FR = { live: 'En cours', scheduled: 'Programmée', ended: 'Terminée', paused: 'En pause' };
const LANG_FR = { fr: 'Français', en: 'Anglais', ar: 'Arabe', none: 'Sans langue' };
const fdate = (v) => (v ? new Date(v).toLocaleDateString('fr-FR', { timeZone: 'Europe/Paris' }) : null);

/** PDF du rapport (A4). Retourne un Buffer. */
export async function reportPdf(r) {
  const doc = await PDFDocument.load(await (async () => { const d = await PDFDocument.create(); d.addPage(); return d.save(); })());
  doc.removePage(0);
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const ok = new Set(font.getCharacterSet());
  const clean = (s) => [...String(s ?? '').replace(/\s+/g, ' ')].map((c) => (ok.has(c.codePointAt(0)) ? c : '?')).join('');
  const GOLD = rgb(0.72, 0.55, 0.12), GREY = rgb(0.4, 0.4, 0.4), BLACK = rgb(0.07, 0.07, 0.07);
  const W = 595, H = 842, M = 48;
  let page = doc.addPage([W, H]); let y = H - M;
  const text = (s, x, size = 11, f = font, color = BLACK) => page.drawText(clean(s), { x, y, size, font: f, color });
  const line = (dy = 16) => { y -= dy; if (y < M + 20) { page = doc.addPage([W, H]); y = H - M; } };
  const num = (n) => new Intl.NumberFormat('fr-FR').format(n).replace(/[  ]/g, ' ');

  page.drawRectangle({ x: 0, y: H - 6, width: W, height: 6, color: GOLD });
  text('Mejliss TV - Rapport de campagne', M, 10, bold, GOLD); line(26);
  text(r.title, M, 20, bold); line(20);
  text(`Annonceur : ${r.advertiser}`, M, 12); line(16);
  const period = [r.startsAt ? `du ${fdate(r.startsAt)}` : null, r.endsAt ? `jusqu'au ${fdate(r.endsAt)}` : null].filter(Boolean).join(' ') || 'sans date de fin';
  text(`Situation : ${STATUS_FR[r.status] || r.status} - ${period}`, M, 10, font, GREY); line(14);
  text(`Langues visées : ${r.languages.length ? r.languages.map((l) => LANG_FR[l]).join(', ') : 'toutes'}`, M, 10, font, GREY); line(14);
  text(`Rapport établi le ${fdate(r.generatedAt)}`, M, 10, font, GREY); line(30);

  text('Résultats', M, 14, bold); line(20);
  const t = r.totals;
  const box = (label, value, i) => {
    const x = M + i * 130;
    page.drawRectangle({ x, y: y - 34, width: 120, height: 48, borderColor: GOLD, borderWidth: 1 });
    page.drawText(clean(String(value)), { x: x + 10, y: y - 12, size: 18, font: bold, color: BLACK });
    page.drawText(clean(label), { x: x + 10, y: y - 28, size: 9, font, color: GREY });
  };
  box('Affichages', num(t.impressions), 0); box('Clics', num(t.clicks), 1); box('Taux de clic', `${String(t.ctr).replace('.', ',')} %`, 2); box('« Passer »', num(t.skips), 3);
  y -= 70;

  text('Répartition par langue de l’application', M, 14, bold); line(20);
  const cols = [M, M + 150, M + 260, M + 360];
  ['Langue', 'Affichages', 'Clics', 'Taux de clic'].forEach((h, i) => page.drawText(h, { x: cols[i], y, size: 10, font: bold, color: GREY }));
  line(16);
  for (const k of ['fr', 'en', 'ar', 'none']) {
    const v = r.byLang[k];
    [LANG_FR[k], num(v.impressions), num(v.clicks), `${String(v.ctr).replace('.', ',')} %`].forEach((s, i) => page.drawText(clean(s), { x: cols[i], y, size: 10, font, color: BLACK }));
    line(15);
  }
  line(10);

  // Courbe : barres des affichages sur les 30 derniers jours
  text('Affichages par jour (30 derniers jours)', M, 14, bold); line(14);
  const last = r.daily.slice(-30); const max = Math.max(1, ...last.map((d) => d.impressions));
  const bw = (W - 2 * M) / last.length; const ch = 90;
  last.forEach((d, i) => {
    const h = (d.impressions / max) * ch;
    if (h > 0) page.drawRectangle({ x: M + i * bw + 1, y: y - ch, width: Math.max(1, bw - 2), height: h, color: GOLD });
  });
  page.drawLine({ start: { x: M, y: y - ch }, end: { x: W - M, y: y - ch }, thickness: 0.5, color: GREY });
  y -= ch + 12;
  page.drawText(clean(fdate(last[0].day)), { x: M, y, size: 8, font, color: GREY });
  const endLabel = clean(fdate(last[last.length - 1].day));
  page.drawText(endLabel, { x: W - M - font.widthOfTextAtSize(endLabel, 8), y, size: 8, font, color: GREY });
  page.drawText(clean(`pic : ${num(max)} affichage(s) / jour`), { x: W / 2 - 50, y, size: 8, font, color: GREY });
  line(30);

  // Tableau jour par jour (jours avec activité)
  const active = r.daily.filter((d) => d.impressions || d.clicks).reverse();
  if (active.length) {
    text('Détail par jour', M, 14, bold); line(20);
    ['Jour', 'Affichages', 'Clics'].forEach((h, i) => page.drawText(h, { x: [M, M + 120, M + 230][i], y, size: 10, font: bold, color: GREY }));
    line(15);
    for (const d of active) {
      [fdate(d.day), num(d.impressions), num(d.clicks)].forEach((s, i) => page.drawText(clean(s), { x: [M, M + 120, M + 230][i], y, size: 10, font, color: BLACK }));
      line(14);
    }
  }
  line(10);
  text('Chiffres comptés par l’application Mejliss TV (un affichage = une publicité montrée à l’écran). Aucune donnée personnelle.', M, 8, font, GREY);
  doc.setTitle(clean(`Rapport - ${r.title}`)); doc.setProducer('Mejliss TV');
  return Buffer.from(await doc.save());
}
