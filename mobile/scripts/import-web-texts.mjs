// Importe dans l'application les textes du site (web/lib/i18n.js) : mêmes mots, mêmes traductions FR / EN / AR que la PWA.
// Usage : node scripts/import-web-texts.mjs   (écrit src/lib/webTexts.ts ; à relancer quand on ajoute un préfixe ou une clé)
import { copyFileSync, mkdtempSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const tmp = mkdtempSync(join(tmpdir(), 'webi18n-'));
copyFileSync(join(here, '../../web/lib/i18n.js'), join(tmp, 'i18n.mjs')); // .mjs : lu comme module quel que soit le package
const { DICT } = await import(pathToFileURL(join(tmp, 'i18n.mjs')).href);

// Préfixes de clés repris du site (une famille = un écran ou une fonction).
const PREFIXES = ['hero', 'row', 'cit', 'fm', 'kdBand', 'rev', 'qp', 'pz', 'wb', 'nt', 'lk', 'pv', 'th', 'lv', 'spd', 'aud', 'cn', 'ep', 'season', 'ser', 'tab',
  'err', 'reg', 'hm', 'fav', 'search', 'sr', 'up', 'play', 'prev', 'next', 'share', 'rp', 'lr', 'col', 'ch', 'sp', 'pr', 'sub', 'follow', 'welcome', 'cat', 'fmt', 'ft', 'pc', 'tp', 'pry', 'kd', 'kc', 'ka'];
// Clés isolées.
const EXACT = ['home', 'library', 'navCatalogue', 'navLearn', 'seriesNav', 'colNav', 'minutes', 'login', 'register', 'email', 'password', 'submit', 'free', 'premium', 'mixed',
  'noTalks', 'summary', 'chapters', 'transcript', 'dSpeaker', 'dCategory', 'dLang', 'dDuration', 'dAccess', 'dSubs', 'lvLabel', 'pricing', 'subscribe', 'logout', 'account',
  'forgotLink', 'haveAccount', 'registerLegal', 'legalTerms', 'legalPrivacy', 'languageMenu', 'mainNav', 'removeFav', 'addFav', 'playerUnavailable', 'premiumOnly', 'convFailed',
  'processingMsg', 'previewMsg', 'transcribing', 'insightsWaiting', 'epN', 'seasonN', 'sShort', 'eShort', 'seasonCount', 'episodeCount', 'watchedOf', 'seriesTag', 'nextEp', 'prevEp',
  'upNextIn', 'playNow', 'cancelBtn', 'tabsLabel', 'tabAbout', 'trial', 'shareCopied', 'shareCopiedAt', 'errInvalid', 'errExists', 'errGeneric', 'bkNav', 'shrTitle', 'msCats', 'watchNow', 'moreInfo', 'continueWatching', 'epOf', 'sameVein', 'nextTitle', 'nowPlaying', 'watched', 'kids', 'kdNav', 'tierLearn', 'tierStd'];
const keep = (k) => EXACT.includes(k) || PREFIXES.some((p) => k.startsWith(p) && /^[A-Z0-9]/.test(k.slice(p.length) || 'A') || k === p);

// Toute clé utilisée dans le code (t('clé')) et présente sur le site est aussi importée : plus besoin de la lister à la main.
const used = new Set();
const walk = (d) => { for (const f of readdirSync(d)) { const p = join(d, f); if (statSync(p).isDirectory()) walk(p); else if (/\.tsx?$/.test(f) && f !== 'webTexts.ts') for (const m of readFileSync(p, 'utf8').matchAll(/\bt\(\s*'([A-Za-z0-9_]+)'/g)) used.add(m[1]); } };
walk(join(here, '../src'));
const keys = Object.keys(DICT.fr).filter((k) => keep(k) || used.has(k)).sort();
const out = {};
for (const l of ['fr', 'en', 'ar']) { out[l] = {}; for (const k of keys) out[l][k] = String(DICT[l][k] ?? DICT.fr[k]); }
const ts = `// GÉNÉRÉ par scripts/import-web-texts.mjs à partir de web/lib/i18n.js — ne pas modifier à la main.
// Textes du site repris tels quels pour que l'application dise la même chose que la PWA (FR / EN / AR).
export const WEB_KEYS = ${JSON.stringify(keys)} as const;
export type WebKey = (typeof WEB_KEYS)[number];
export const WEB: Record<'fr' | 'en' | 'ar', Record<WebKey, string>> = ${JSON.stringify(out)};
`;
writeFileSync(join(here, '../src/lib/webTexts.ts'), ts);
console.log(keys.length + ' clés importées');
