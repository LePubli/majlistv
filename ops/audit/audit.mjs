// Amélioration 6.8 — Audit de vitesse (Core Web Vitals) et d'accessibilité.
// Mesure les pages principales (visiteur + membre) en mobile (Moto G, 4G) et ordinateur avec Lighthouse, puis passe axe (WCAG 2 A/AA) sur chaque page.
// Usage : voir README.md. Variables : SITE (défaut http://localhost:3100), API (défaut http://127.0.0.1:3055), CHROME_PATH (Chrome/Chromium), OUT (fichier JSON), MODES (mobile,desktop).
// Code de sortie 1 si un seuil n'est pas respecté (CLS > 0,1 ; accessibilité < 95 ; violation axe « serious/critical »).
import lighthouse from 'lighthouse';
import * as chromeLauncher from 'chrome-launcher';
import { chromium } from 'playwright-core';
import { createRequire } from 'node:module';
import fs from 'node:fs';

const SITE = process.env.SITE || 'http://localhost:3100';
const API = process.env.API || 'http://127.0.0.1:3055';
const MODES = (process.env.MODES || 'mobile,desktop').split(',');
const OUT = process.env.OUT || 'audit-result.json';
const LIMITS = { cls: 0.1, a11y: 95 };
const axeSrc = fs.readFileSync(createRequire(import.meta.url).resolve('axe-core/axe.min.js'), 'utf8');
const json = { 'content-type': 'application/json' };

// Une conférence publiée existante (la page « conférence » est la plus lourde du site).
const cat = await (await fetch(`${API}/catalogue`)).json().catch(() => null);
const talk = cat?.hero?.items?.[0] || (Array.isArray(cat) ? cat[0] : null);
const slug = talk?.slug || talk?.id;
const PUBLIC = ['/', '/pricing', '/login', '/register', '/catalogue', '/chaines', '/kids', '/themes', '/priere', ...(slug ? [`/conferences/${slug}`] : [])];
const MEMBER = ['/', '/catalogue', '/library', '/account', ...(slug ? [`/conferences/${slug}`] : [])];

// Compte de test pour les pages « membre ».
const email = 'audit@test.local', password = 'AuditPassw0rd-1';
const reg = await fetch(`${API}/auth/register`, { method: 'POST', headers: json, body: JSON.stringify({ email, password, name: 'Audit' }) });
const token = (await (reg.ok ? reg : await fetch(`${API}/auth/login`, { method: 'POST', headers: json, body: JSON.stringify({ email, password }) })).json()).token;

const chrome = await chromeLauncher.launch({ chromePath: process.env.CHROME_PATH, chromeFlags: ['--headless=new', '--no-sandbox', '--disable-gpu'] });
const browser = await chromium.connectOverCDP(`http://127.0.0.1:${chrome.port}`);
const rows = [];

async function run(path, member, mode) {
  const ctx = browser.contexts()[0];
  const setup = await ctx.newPage();
  await setup.goto(SITE + '/login');
  await setup.evaluate(([m, t]) => { if (m) localStorage.setItem('token', t); else localStorage.removeItem('token'); }, [member, token]);
  await setup.close();
  const desktop = mode === 'desktop';
  const cfg = desktop ? { extends: 'lighthouse:default', settings: { formFactor: 'desktop', screenEmulation: { mobile: false, width: 1350, height: 940, deviceScaleFactor: 1, disabled: false }, throttling: { rttMs: 40, throughputKbps: 10240, cpuSlowdownMultiplier: 1, requestLatencyMs: 0, downloadThroughputKbps: 0, uploadThroughputKbps: 0 } } } : undefined;
  const { lhr } = await lighthouse(SITE + path, { port: chrome.port, output: 'json', logLevel: 'error', disableStorageReset: true, onlyCategories: ['performance', 'accessibility', 'best-practices', 'seo'] }, cfg);
  const a = lhr.audits, pc = (c) => Math.round((lhr.categories[c].score ?? 0) * 100), num = (id) => a[id]?.numericValue ?? -1;
  const row = { mode, member, path, perf: pc('performance'), a11y: pc('accessibility'), bp: pc('best-practices'), seo: pc('seo'),
    lcp: Math.round(num('largest-contentful-paint')), cls: +num('cumulative-layout-shift').toFixed(3), tbt: Math.round(num('total-blocking-time')), kb: Math.round((a['total-byte-weight']?.numericValue ?? 0) / 1024),
    a11yFails: lhr.categories.accessibility.auditRefs.filter((r) => a[r.id].score === 0).map((r) => r.id) };
  const page = await ctx.newPage(); await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(SITE + path, { waitUntil: 'networkidle' }); await page.evaluate(axeSrc);
  row.axe = await page.evaluate(async () => (await axe.run(document, { runOnly: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'] })).violations.map((v) => ({ id: v.id, impact: v.impact, nodes: v.nodes.length, sample: v.nodes[0].target.join(' ').slice(0, 100) })));
  await page.close();
  rows.push(row);
  console.log(`${mode.padEnd(7)} ${member ? 'membre ' : 'visiteur'} ${path.padEnd(34)} perf ${String(row.perf).padStart(3)}  a11y ${String(row.a11y).padStart(3)}  LCP ${String(row.lcp).padStart(5)} ms  CLS ${row.cls}  TBT ${row.tbt} ms  ${row.kb} Ko  axe ${row.axe.length}`);
}

for (const mode of MODES) { for (const p of PUBLIC) await run(p, false, mode); for (const p of MEMBER) await run(p, true, mode); }
fs.writeFileSync(OUT, JSON.stringify(rows, null, 1));
await browser.close(); await chrome.kill();

const bad = rows.filter((r) => r.cls > LIMITS.cls || r.a11y < LIMITS.a11y || r.axe.some((v) => v.impact === 'serious' || v.impact === 'critical'));
console.log(`\n${rows.length} mesures, ${bad.length} hors seuil (CLS ≤ ${LIMITS.cls}, accessibilité ≥ ${LIMITS.a11y}, aucune violation axe grave). Détail : ${OUT}`);
for (const r of bad) console.log(`  ✗ ${r.mode} ${r.member ? 'membre' : 'visiteur'} ${r.path} : CLS ${r.cls}, a11y ${r.a11y}, axe ${r.axe.filter((v) => ['serious', 'critical'].includes(v.impact)).map((v) => v.id).join(', ') || '—'}`);
process.exit(bad.length ? 1 : 0);
