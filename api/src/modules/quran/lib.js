// Coran : lecture des fichiers importés (formats « tanzil » et « json »), téléchargement sûr, import en base, choix des ressources par défaut.
import dns from 'node:dns/promises';
import { pool } from '../../db.js';
import { isPrivateHost } from '../../mediaImport.js';
import { SURA_VERSES } from './juz.js';

export const KINDS = ['text', 'translation', 'transliteration', 'tafsir', 'words', 'tajweed'];
export const TOTAL_VERSES = 6236; // total habituel du texte Hafs (sans la basmala des sourates) : sert à un simple avertissement
export const MAX_BYTES = 60 * 1024 * 1024;

// Texte d'un verset ou d'un commentaire : sans balises HTML (certaines sources en contiennent), sans espaces superflus.
export function cleanText(s) {
  return String(s ?? '')
    .replace(/<\s*br\s*\/?>/gi, '\n').replace(/<\/\s*(p|div|li)\s*>/gi, '\n').replace(/<[^>]*>/g, '')
    .replace(/&nbsp;/g, ' ').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&amp;/g, '&')
    .replace(/\r/g, '').replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim();
}

const validKey = (sura, aya) => Number.isInteger(sura) && Number.isInteger(aya) && sura >= 1 && sura <= 114 && aya >= 1 && aya <= 286;

// Lignes « sourate|verset|texte » (format des fichiers Tanzil) ; les lignes vides et celles qui commencent par # sont ignorées.
export function parseTanzil(content) {
  const rows = []; let skipped = 0;
  for (const line of String(content).split('\n')) {
    const l = line.replace(/\r$/, '');
    if (!l.trim() || l.startsWith('#')) continue;
    const i = l.indexOf('|'); const j = i < 0 ? -1 : l.indexOf('|', i + 1);
    if (j < 0) { skipped++; continue; }
    const sura = Number(l.slice(0, i)); const aya = Number(l.slice(i + 1, j)); const text = cleanText(l.slice(j + 1));
    if (!validKey(sura, aya) || !text) { skipped++; continue; }
    rows.push({ sura, aya, text });
  }
  return { rows, skipped };
}

// JSON : liste [{ sura, aya, text }], ou { verses: [...] }, ou objet { "1": { "1": "texte" } } / { "1": ["texte", …] }.
export function parseJson(content) {
  let data;
  try { data = JSON.parse(content); } catch { return { error: 'Fichier JSON illisible.' }; }
  const rows = []; let skipped = 0;
  const push = (sura, aya, text, notes) => {
    const s = Number(sura); const a = Number(aya); const t = cleanText(text);
    if (!validKey(s, a) || !t) { skipped++; return; }
    rows.push({ sura: s, aya: a, text: t, notes: cleanText(notes) });
  };
  const list = Array.isArray(data) ? data : Array.isArray(data?.verses) ? data.verses : null;
  if (list) {
    for (const v of list) push(v?.sura ?? v?.surah ?? v?.chapter, v?.aya ?? v?.ayah ?? v?.verse, v?.text ?? v?.content, v?.footnotes ?? v?.notes);
  } else if (data && typeof data === 'object') {
    for (const [s, body] of Object.entries(data)) {
      if (Array.isArray(body)) body.forEach((t, i) => (typeof t === 'string' ? push(s, i + 1, t) : push(s, t?.verse ?? t?.aya ?? t?.ayah ?? i + 1, t?.text, t?.footnotes ?? t?.notes)));
      else if (body && typeof body === 'object') for (const [a, t] of Object.entries(body)) push(s, a, typeof t === 'string' ? t : t?.text);
      else skipped++;
    }
  } else return { error: 'Format JSON non reconnu.' };
  return { rows, skipped };
}

export function parseContent(format, content) {
  const r = format === 'json' ? parseJson(content) : parseTanzil(content);
  if (r.error) return r;
  // Un même verset deux fois : le dernier gagne.
  const map = new Map();
  for (const x of r.rows) map.set(x.sura * 1000 + x.aya, x);
  const rows = [...map.values()].sort((a, b) => a.sura - b.sura || a.aya - b.aya);
  if (!rows.length) return { error: 'Aucun verset valide trouvé dans ce fichier (format, numéros de sourate et de verset).' };
  return { rows, skipped: r.skipped + (r.rows.length - rows.length) };
}

// --- Téléchargement : adresses publiques seulement, 3 redirections au plus, taille et durée limitées. -------------------------
async function assertPublic(u) {
  if (!['http:', 'https:'].includes(u.protocol) || u.username || u.password) throw new Error('Adresse non acceptée (http ou https, sans identifiant).');
  if (process.env.QURAN_ALLOW_PRIVATE_URLS === '1') return; // tests seulement
  if (isPrivateHost(u.hostname)) throw new Error('Cette adresse n\'est pas un site public.');
  const addrs = await dns.lookup(u.hostname, { all: true }).catch(() => []);
  if (!addrs.length || addrs.some((a) => isPrivateHost(a.address))) throw new Error('Cette adresse n\'est pas un site public.');
}

export async function fetchText(raw) {
  let u;
  try { u = new URL(String(raw).trim()); } catch { throw new Error('Adresse invalide.'); }
  const signal = AbortSignal.timeout(120000);
  for (let hop = 0; hop < 4; hop++) {
    await assertPublic(u);
    const res = await fetch(u, { redirect: 'manual', signal, headers: { 'user-agent': 'MejlissTV-quran-import', accept: 'text/plain,application/json,*/*' } });
    if (res.status >= 300 && res.status < 400 && res.headers.get('location')) { u = new URL(res.headers.get('location'), u); continue; }
    if (!res.ok) throw new Error(`Le site a répondu ${res.status}.`);
    const len = Number(res.headers.get('content-length') || 0);
    if (len > MAX_BYTES) throw new Error('Fichier trop gros (60 Mo au plus).');
    const chunks = []; let size = 0;
    for await (const c of res.body) {
      size += c.length;
      if (size > MAX_BYTES) throw new Error('Fichier trop gros (60 Mo au plus).');
      chunks.push(c);
    }
    return Buffer.concat(chunks).toString('utf8').replace(/^﻿/, '');
  }
  throw new Error('Trop de redirections.');
}

// Adresse avec « {n} » : un fichier par sourate (1 à 114), téléchargés 6 à la fois puis réunis (format JSON).
export async function fetchBySura(template) {
  const files = new Array(114);
  let next = 1;
  const worker = async () => {
    for (;;) {
      const n = next++;
      if (n > 114) return;
      try { files[n - 1] = await fetchText(String(template).replace(/\{n\}/g, String(n))); }
      catch (e) { throw new Error(`sourate ${n} : ${e.message}`); }
    }
  };
  await Promise.all(Array.from({ length: 6 }, worker));
  const rows = []; let skipped = 0;
  for (let i = 0; i < 114; i++) {
    const r = parseJson(files[i]);
    if (r.error) throw new Error(`sourate ${i + 1} : ${r.error}`);
    rows.push(...r.rows); skipped += r.skipped;
  }
  return { rows, skipped };
}

// --- Mot à mot et tajwid ------------------------------------------------------------------------------------------------------
// Mot à mot : liste [{ sura, aya, position, text }] (ou surah/ayah/word/translation…), ou objet { "1:1:1": "texte" } (sourate:verset:mot).
// Un verset n'est gardé que si ses mots sont numérotés 1, 2, 3… sans trou.
export function parseWords(content) {
  let data;
  try { data = JSON.parse(content); } catch { return { error: 'Fichier JSON illisible.' }; }
  const items = [];
  if (Array.isArray(data) || Array.isArray(data?.words)) {
    for (const w of (Array.isArray(data) ? data : data.words)) {
      // Tableau [sourate, verset, mot, texte] (« nested array ») ou objet.
      if (Array.isArray(w)) { items.push([Number(w[0]), Number(w[1]), Number(w[2]), w[3]]); continue; }
      items.push([Number(w?.sura ?? w?.surah ?? w?.chapter), Number(w?.aya ?? w?.ayah ?? w?.verse), Number(w?.position ?? w?.word ?? w?.pos ?? w?.index), w?.text ?? w?.translation ?? w?.meaning ?? w?.content]);
    }
  } else if (data && typeof data === 'object') {
    for (const [k, v] of Object.entries(data)) {
      const m = /^(\d+)[:_-](\d+)[:_-](\d+)$/.exec(k);
      // Clés « 1:1:1 » (sourate:verset:mot) ; valeur texte, ou objet { text | translation | t }.
      items.push(m ? [Number(m[1]), Number(m[2]), Number(m[3]), typeof v === 'string' ? v : v?.text ?? v?.translation ?? v?.t] : [NaN, NaN, NaN, null]);
    }
  } else return { error: 'Format JSON non reconnu.' };
  const by = new Map(); let skipped = 0;
  for (const [sura, aya, pos, raw] of items) {
    const text = cleanText(raw);
    if (!validKey(sura, aya) || !Number.isInteger(pos) || pos < 1 || pos > 400 || !text) { skipped++; continue; }
    const key = sura * 1000 + aya;
    if (!by.has(key)) by.set(key, { sura, aya, w: new Map() });
    by.get(key).w.set(pos, text);
  }
  const rows = [];
  for (const v of by.values()) {
    let n = v.w.size;
    // Certaines sources ajoutent en dernier « mot » le numéro du verset (ex. « (5) ») : il n'a pas de sens à afficher.
    if (n > 1 && /^[\s()\[\]{}0-9\u0660-\u0669\u06F0-\u06F9\u06DD]+$/.test(v.w.get(n) || '')) { v.w.delete(n); n--; }
    let good = true;
    for (let i = 1; i <= n; i++) if (!v.w.has(i)) { good = false; break; }
    if (!good) { skipped += n; continue; }
    rows.push({ sura: v.sura, aya: v.aya, words: Array.from({ length: n }, (_, i) => v.w.get(i + 1)) });
  }
  rows.sort((a, b) => a.sura - b.sura || a.aya - b.aya);
  if (!rows.length) return { error: 'Aucun mot valide trouvé dans ce fichier (sourate, verset, numéro du mot, texte).' };
  return { rows, skipped };
}

// Aligne le mot à mot sur les mots du texte arabe affiché. Le texte Tanzil commence le verset 1 de chaque sourate (sauf 1 et 9)
// par « بِسْمِ ٱللَّهِ ٱلرَّحْمَٰنِ ٱلرَّحِيمِ » (4 mots), absente des sources qui comptent la basmala à part : on la laisse sans sens ('').
// Renvoie la liste alignée (même longueur que le texte) ou null si les nombres de mots ne se correspondent pas.
export function alignWords(sura, aya, arabic, words) {
  if (!Array.isArray(words)) return null;
  const n = String(arabic || '').trim().split(/\s+/).filter(Boolean).length;
  if (n === words.length) return words;
  if (aya === 1 && sura !== 1 && sura !== 9 && n === words.length + 4) return ['', '', '', '', ...words];
  return null;
}

// Tajwid : liste [{ surah, ayah, annotations: [{ rule, start, end }] }] — positions en caractères (points de code) du texte arabe.
// Si on connaît le texte arabe (arabicLen = Map clé → longueur), les versets dont une position dépasse le texte sont écartés.
const LETTER_CHECK = {
  hamzat_wasl: (x) => x === '\u0671', lam_shamsiyyah: (x) => x === '\u0644',
  qalqalah: (x) => /^[\u0642\u0637\u0628\u062c\u062f]\u0652?$/.test(x), ghunnah: (x) => /^[\u0646\u0645]\u0651/.test(x),
};
export function parseTajweed(content, arabicLen) {
  let data;
  try { data = JSON.parse(content); } catch { return { error: 'Fichier JSON illisible.' }; }
  const list = Array.isArray(data) ? data : Array.isArray(data?.verses) ? data.verses : null;
  if (!list) return { error: 'Format JSON non reconnu (liste de versets avec « annotations »).' };
  const rows = []; let skipped = 0; let shifted = 0;
  for (const v of list) {
    const sura = Number(v?.sura ?? v?.surah); const aya = Number(v?.aya ?? v?.ayah);
    const ann = v?.annotations ?? v?.marks;
    if (!validKey(sura, aya) || !Array.isArray(ann)) { skipped++; continue; }
    const marks = [];
    let bad = false;
    for (const a of ann) {
      const rule = String(a?.rule ?? ''); const start = Number(a?.start); const end = Number(a?.end);
      if (!/^[a-z0-9_]{1,40}$/.test(rule) || !Number.isInteger(start) || !Number.isInteger(end) || start < 0 || end <= start) { bad = true; break; }
      marks.push([rule, start, end]);
    }
    const info = arabicLen?.get(sura * 1000 + aya);
    const chars = typeof info === 'string' ? [...info] : null;
    const len = chars ? chars.length : info;
    if (bad || !marks.length || (arabicLen && (len === undefined || marks.some((m) => m[2] > len)))) { skipped++; continue; }
    // Contrôle des lettres : le fichier d'origine date de 2017 ; si une règle tombe sur une lettre qui ne lui correspond pas, le verset est décalé → écarté (jamais de mauvaise couleur).
    if (chars && marks.some((m) => { const f = LETTER_CHECK[m[0]]; return f && !f(chars.slice(m[1], m[2]).join('')); })) { shifted++; continue; }
    rows.push({ sura, aya, marks });
  }
  if (!rows.length) return { error: 'Aucun verset de tajwid utilisable (les positions doivent correspondre au texte arabe importé).' };
  return { rows, skipped, shifted };
}

async function replaceInto(resource, sql, rows, mk) {
  const c = await pool.connect();
  try {
    await c.query('BEGIN');
    await c.query('DELETE FROM quran_words WHERE resource_id = $1', [resource.id]);
    await c.query('DELETE FROM quran_tajweed WHERE resource_id = $1', [resource.id]);
    for (const r of rows) await c.query(sql, mk(r));
    await c.query('UPDATE quran_resources SET verse_count = $2, imported_at = now(), updated_at = now() WHERE id = $1', [resource.id, rows.length]);
    await c.query('COMMIT');
  } catch (e) { await c.query('ROLLBACK').catch(() => {}); throw e; } finally { c.release(); }
}
export const importWords = (res, rows) => replaceInto(res, 'INSERT INTO quran_words(resource_id, sura, aya, words) VALUES ($1,$2,$3,$4)', rows, (r) => [res.id, r.sura, r.aya, r.words]);
export const importTajweed = (res, rows) => replaceInto(res, 'INSERT INTO quran_tajweed(resource_id, sura, aya, marks) VALUES ($1,$2,$3,$4::jsonb)', rows, (r) => [res.id, r.sura, r.aya, JSON.stringify(r.marks)]);

// Numéro du verset dans tout le Coran (1 à 6236) : utilisé par certains serveurs audio (Islamic Network / AlQuran.cloud).
export function globalAyah(sura, aya) {
  let n = 0;
  for (let i = 0; i < sura - 1; i++) n += SURA_VERSES[i];
  return n + aya;
}

// Adresse du fichier d'un verset à partir du modèle : {sura3}/{aya3} (sur 3 chiffres), {sura}/{aya}, ou {ayahg} (1 à 6236).
export function reciterFileUrl(tpl, sura, aya) {
  return String(tpl)
    .replace(/\{sura3\}/g, String(sura).padStart(3, '0')).replace(/\{aya3\}/g, String(aya).padStart(3, '0'))
    .replace(/\{sura\}/g, String(sura)).replace(/\{aya\}/g, String(aya)).replace(/\{ayahg\}/g, String(globalAyah(sura, aya)));
}

// Adresse d'un récitateur : https, avec ({sura} ou {sura3}) et ({aya} ou {aya3}), ou bien {ayahg} ; renvoie { origin } ou { error }.
export function checkReciterUrl(tpl) {
  const t = String(tpl || '').trim();
  const pair = /\{sura3?\}/.test(t) && /\{aya3?\}/.test(t);
  if (!pair && !/\{ayahg\}/.test(t)) return { error: 'L\'adresse doit contenir {sura3} (ou {sura}) et {aya3} (ou {aya}), ou bien {ayahg} (numéro du verset de 1 à 6236).' };
  let u;
  try { u = new URL(reciterFileUrl(t, 1, 1)); } catch { return { error: 'Adresse invalide.' }; }
  if (u.protocol !== 'https:' || u.username || u.password) return { error: 'L\'adresse doit commencer par https:// et ne pas contenir d\'identifiant.' };
  return { origin: u.origin };
}

// --- Catalogues de récitateurs verset par verset (lus par le serveur ; rien n'est copié : le navigateur lit chez la source) ----------
export const CATALOGS = {
  everyayah: {
    label: 'EveryAyah.com',
    url: 'https://everyayah.com/data/recitations.js',
    sourceUrl: 'https://everyayah.com',
    license: 'EveryAyah.com — conditions d\'utilisation à vérifier par l\'administrateur avant de proposer ce récitateur',
  },
  islamic: {
    label: 'Islamic Network (AlQuran.cloud)',
    url: 'https://api.alquran.cloud/v1/edition?format=audio&type=versebyverse',
    sourceUrl: 'https://alquran.cloud/terms-and-conditions',
    license: 'Islamic Network : récitations confiées pour une diffusion gratuite non commerciale ; usage commercial toléré, droits conservés par les récitateurs (retrait possible sur demande)',
  },
};
const slugOf = (prefix, s) => `${prefix}-${String(s).toLowerCase().replace(/[^a-z0-9_-]+/g, '-').replace(/^-+|-+$/g, '')}`.slice(0, 60);

// EveryAyah : fichier « recitations.js » = objet JSON { "1": { subfolder, name, bitrate }, …, ayahCount: […] }.
export function parseEveryAyah(content) {
  const txt = String(content || '');
  const a = txt.indexOf('{'); const b = txt.lastIndexOf('}');
  let data;
  try { data = JSON.parse(txt.slice(a, b + 1)); } catch { return { error: 'Catalogue EveryAyah illisible.' }; }
  const c = CATALOGS.everyayah;
  const items = Object.entries(data).filter(([k, v]) => /^\d+$/.test(k) && v && typeof v === 'object' && /^[A-Za-z0-9_.-]{2,120}$/.test(String(v.subfolder || '')))
    .sort((x, y) => Number(x[0]) - Number(y[0]))
    .map(([, v]) => {
      const name = String(v.name || v.subfolder).trim().slice(0, 100);
      const bitrate = String(v.bitrate || '').trim().slice(0, 20);
      return {
        slug: slugOf('ea', v.subfolder), name: `${name}${bitrate ? ` (${bitrate})` : ''}`.slice(0, 120),
        urlTemplate: `https://everyayah.com/data/${v.subfolder}/{sura3}{aya3}.mp3`,
        sourceUrl: c.sourceUrl, license: c.license, credit: `Récitation : ${name} — EveryAyah.com`.slice(0, 300),
      };
    });
  return items.length ? { items } : { error: 'Aucun récitateur dans le catalogue EveryAyah.' };
}

// Islamic Network : liste des éditions audio « verset par verset » ; on garde les récitations en arabe. L'adresse des fichiers
// (débit compris) est lue sur le premier verset de chaque édition : …/quran/audio/<débit>/<édition>/1.mp3 → …/{ayahg}.mp3.
export function parseIslamicEditions(content) {
  let data;
  try { data = JSON.parse(String(content || '')); } catch { return { error: 'Catalogue Islamic Network illisible.' }; }
  const list = Array.isArray(data?.data) ? data.data : [];
  const eds = list.filter((e) => e && e.format === 'audio' && (e.type === 'versebyverse' || !e.type) && e.language === 'ar' && /^[a-z]{2}\.[a-z0-9_-]{2,60}$/i.test(String(e.identifier || '')));
  return eds.length ? { editions: eds.map((e) => ({ identifier: e.identifier, name: String(e.englishName || e.identifier).slice(0, 80), nameAr: String(e.name || '').slice(0, 80) })) } : { error: 'Aucune récitation dans le catalogue Islamic Network.' };
}
export function islamicTemplate(audioUrl, identifier) {
  const m = /^(https:\/\/cdn\.islamic\.network\/quran\/audio\/\d{2,3}\/)([^/]+)\/1\.mp3$/.exec(String(audioUrl || ''));
  return m && m[2] === identifier ? `${m[1]}${identifier}/{ayahg}.mp3` : `https://cdn.islamic.network/quran/audio/128/${identifier}/{ayahg}.mp3`;
}
export function islamicItem(ed, template) {
  const c = CATALOGS.islamic;
  return {
    slug: slugOf('in', ed.identifier), name: `${ed.name}${ed.nameAr ? ` — ${ed.nameAr}` : ''}`.slice(0, 120), urlTemplate: template,
    sourceUrl: c.sourceUrl, license: c.license, credit: `Récitation : ${ed.name} — Islamic Network (cdn.islamic.network)`.slice(0, 300),
  };
}

const catalogCache = new Map(); // source → { at, items }
export async function reciterCatalog(source, { fetcher = fetchText, now = Date.now() } = {}) {
  const hit = catalogCache.get(source);
  if (hit && now - hit.at < 10 * 60 * 1000) return { items: hit.items };
  let out;
  if (source === 'everyayah') out = parseEveryAyah(await fetcher(CATALOGS.everyayah.url));
  else if (source === 'islamic') {
    const r = parseIslamicEditions(await fetcher(CATALOGS.islamic.url));
    if (r.error) return r;
    const items = new Array(r.editions.length); let next = 0;
    const worker = async () => {
      for (;;) {
        const i = next++; if (i >= r.editions.length) return;
        const ed = r.editions[i];
        let audio = null;
        try { audio = JSON.parse(await fetcher(`https://api.alquran.cloud/v1/ayah/1/${ed.identifier}`))?.data?.audio; } catch { /* débit par défaut */ }
        items[i] = islamicItem(ed, islamicTemplate(audio, ed.identifier));
      }
    };
    await Promise.all(Array.from({ length: 4 }, worker));
    out = { items };
  } else return { error: 'Catalogue inconnu.' };
  if (out.items) catalogCache.set(source, { at: now, items: out.items });
  return out;
}

// Remplace tous les versets d'une ressource (transaction : en cas d'erreur, l'ancien contenu reste).
export async function importRows(resource, rows) {
  const c = await pool.connect();
  try {
    await c.query('BEGIN');
    await c.query('DELETE FROM quran_verses WHERE resource_id = $1', [resource.id]);
    for (let i = 0; i < rows.length; i += 2000) {
      const part = rows.slice(i, i + 2000);
      await c.query(
        'INSERT INTO quran_verses(resource_id, sura, aya, text, notes) SELECT $1, * FROM unnest($2::smallint[], $3::smallint[], $4::text[], $5::text[])',
        [resource.id, part.map((r) => r.sura), part.map((r) => r.aya), part.map((r) => r.text), part.map((r) => r.notes || '')]);
    }
    await c.query('UPDATE quran_resources SET verse_count = $2, imported_at = now(), updated_at = now() WHERE id = $1', [resource.id, rows.length]);
    await c.query('COMMIT');
  } catch (e) { await c.query('ROLLBACK').catch(() => {}); throw e; } finally { c.release(); }
}

// --- Choix des ressources ---------------------------------------------------------------------------------------------------
export const enabledResources = async () => (await pool.query('SELECT * FROM quran_resources WHERE enabled AND verse_count > 0 ORDER BY position, id')).rows;

export const publicMeta = (r) => ({ slug: r.slug, kind: r.kind, lang: r.lang, name: r.name, author: r.author, sourceUrl: r.source_url, license: r.license, credit: r.credit });

// Texte arabe : la première ressource « text » activée.
export const arabicOf = (list) => list.find((r) => r.kind === 'text') || null;

// Choix d'une traduction / phonétique : « none » = aucune ; un identifiant ; sinon la première de la langue demandée, puis la première.
export function pick(list, kind, wanted, lang) {
  if (wanted === 'none') return null;
  const of = list.filter((r) => r.kind === kind);
  if (wanted) return of.find((r) => r.slug === wanted) || null;
  return of.find((r) => r.lang === lang) || of[0] || null;
}

export const LANGS = ['fr', 'en', 'ar'];
export const lang = (l) => (LANGS.includes(String(l || '').slice(0, 2)) ? String(l).slice(0, 2) : 'fr');
