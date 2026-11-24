// Fabrique les annuaires du kit (et le guide) à partir du code du site : routes.json (toutes les pages) et css-hooks.json (toutes les classes CSS).
// À relancer quand une page ou une classe est ajoutée :   node api/theme-kit/scan.mjs
// Le test api/tests/test_theme_kit.mjs échoue si ces fichiers ne sont plus à jour.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { THEME_SLOT_PATHS } from '../src/themePack.js';
import { wildcardFor, SITE_PAGES } from '../src/blocks.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const WEB = path.resolve(HERE, '../../web/app');

export function scanRoutes() {
  const out = [];
  const walk = (dir, rel) => {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      if (e.isDirectory()) {
        if (e.name === 'api') continue; // routes /api (proxy), pas des pages
        // (groupe) : dossier d'organisation, absent de l'adresse
        walk(path.join(dir, e.name), /^\(.*\)$/.test(e.name) ? rel : `${rel}/${e.name}`);
      } else if (/^page\.(js|jsx|tsx)$/.test(e.name)) out.push(rel || '/');
    }
  };
  walk(WEB, '');
  const names = new Map(SITE_PAGES.flatMap(([, items]) => items.map((i) => [i[0], i[1]])));
  return [...new Set(out)].sort().map((p) => {
    const dynamic = [...p.matchAll(/\[(\w+)\]/g)].map((m) => m[1]);
    const sample = p.replace(/\[\w+\]/g, 'x');
    const area = /^\/studio/.test(p) ? 'studio' : /^\/admin/.test(p) ? 'admin' : /^\/organizer/.test(p) ? 'organisateur'
      : /^\/kids/.test(p) ? 'kids' : /^\/(pb-preview|apercu-theme|editeur|audyn|fiche|rapport-annonceur|unsubscribe|welcome|redeem|attestation|l)(\/|$)/.test(p) ? 'technique' : 'public';
    let slot = null;
    if (THEME_SLOT_PATHS.includes(p)) slot = p;
    else if (dynamic.length) slot = wildcardFor(sample.replace(/^\/talks\//, '/conferences/')) || null;
    if (p === '/legal/[slug]') slot = '/legal/*';
    return { path: p, dynamic, area, slot, name: names.get(slot || p) || '' };
  });
}

export function scanCss() {
  const files = fs.readdirSync(WEB).filter((f) => f.endsWith('.css')).sort();
  const out = {};
  for (const f of files) {
    const css = fs.readFileSync(path.join(WEB, f), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '').replace(/"(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*'/g, '""');
    out[f] = [...new Set([...css.matchAll(/\.([a-zA-Z_][\w-]*)/g)].map((m) => m[1]).filter((c) => !/^\d/.test(c)))].sort();
  }
  return out;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  fs.writeFileSync(path.join(HERE, 'routes.json'), JSON.stringify(scanRoutes(), null, 1) + '\n');
  fs.writeFileSync(path.join(HERE, 'css-hooks.json'), JSON.stringify(scanCss()) + '\n');
  const { buildGuide } = await import('../src/themeKit.js'); // lu APRÈS l'écriture des annuaires
  fs.writeFileSync(path.join(HERE, 'GUIDE-IA.md'), buildGuide());
  console.log('routes.json, css-hooks.json et GUIDE-IA.md mis à jour');
}
