// Coran : lecture des fichiers importés (formats « tanzil » et « json »), téléchargement sûr, import en base, choix des ressources par défaut.
import dns from 'node:dns/promises';
import { pool } from '../../db.js';
import { isPrivateHost } from '../../mediaImport.js';

export const KINDS = ['text', 'translation', 'transliteration', 'tafsir'];
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
  const push = (sura, aya, text) => {
    const s = Number(sura); const a = Number(aya); const t = cleanText(text);
    if (!validKey(s, a) || !t) { skipped++; return; }
    rows.push({ sura: s, aya: a, text: t });
  };
  const list = Array.isArray(data) ? data : Array.isArray(data?.verses) ? data.verses : null;
  if (list) {
    for (const v of list) push(v?.sura ?? v?.surah ?? v?.chapter, v?.aya ?? v?.ayah ?? v?.verse, v?.text ?? v?.content);
  } else if (data && typeof data === 'object') {
    for (const [s, body] of Object.entries(data)) {
      if (Array.isArray(body)) body.forEach((t, i) => push(s, i + 1, typeof t === 'string' ? t : t?.text));
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

// Remplace tous les versets d'une ressource (transaction : en cas d'erreur, l'ancien contenu reste).
export async function importRows(resource, rows) {
  const c = await pool.connect();
  try {
    await c.query('BEGIN');
    await c.query('DELETE FROM quran_verses WHERE resource_id = $1', [resource.id]);
    for (let i = 0; i < rows.length; i += 2000) {
      const part = rows.slice(i, i + 2000);
      await c.query(
        'INSERT INTO quran_verses(resource_id, sura, aya, text) SELECT $1, * FROM unnest($2::smallint[], $3::smallint[], $4::text[])',
        [resource.id, part.map((r) => r.sura), part.map((r) => r.aya), part.map((r) => r.text)]);
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
