// Paramètres de l'application modifiables depuis le back-office (table app_settings).
// Valeur utilisée = valeur saisie dans le back-office, sinon variable d'environnement (ancienne méthode), sinon valeur par défaut.
import { pool } from './db.js';
import { cryptoReady, encrypt, decrypt } from './crypto.js';
import { TRANSLATION_LANGS } from './langs.js';

export const GROUPS = [
  { id: 'general', label: 'Général' },
  { id: 'payment', label: 'Paiement (Stripe)' },
  { id: 'translation', label: 'Traduction des sous-titres' },
  { id: 'insights', label: 'Résumés et chapitres' },
  { id: 'transcription', label: 'Transcription (Whisper)' },
  { id: 'search', label: 'Recherche (Meilisearch)' },
];

const PROVIDERS = ['claude', 'azure', 'deepseek'];
// type : text | secret | number | bool | select | langs | url
export const FIELDS = [
  { key: 'app_name', group: 'general', type: 'text', label: 'Nom du site', env: 'APP_NAME', def: 'Majlis TV' },
  { key: 'web_url', group: 'general', type: 'url', label: 'Adresse publique du site', env: 'WEB_URL',
    help: 'Utilisée pour le retour après paiement (ex. https://majlisstv.le-publicitaire.fr).' },
  { key: 'preview_seconds', group: 'general', type: 'number', label: "Aperçu gratuit des conférences premium (secondes)", env: 'PREVIEW_SECONDS', def: '120', min: 0, max: 1800 },

  { key: 'stripe_secret_key', group: 'payment', type: 'secret', label: 'Clé secrète Stripe', env: 'STRIPE_SECRET_KEY', test: 'stripe',
    help: 'sk_test_… pour tester, sk_live_… en production. Changer de compte ou de mode remet les abonnements à zéro (confirmation demandée).' },
  { key: 'stripe_webhook_secret', group: 'payment', type: 'secret', label: 'Secret de signature du webhook', env: 'STRIPE_WEBHOOK_SECRET', help: 'whsec_… (Stripe → Développeurs → Webhooks).' },
  { key: 'stripe_price_monthly', group: 'payment', type: 'text', label: 'Identifiant du prix mensuel', env: 'STRIPE_PRICE_MONTHLY', help: 'price_…' },
  { key: 'stripe_price_yearly', group: 'payment', type: 'text', label: 'Identifiant du prix annuel', env: 'STRIPE_PRICE_YEARLY', help: 'price_…' },
  { key: 'trial_days', group: 'payment', type: 'number', label: "Essai gratuit (jours, 0 = aucun)", env: 'TRIAL_DAYS', def: '7', min: 0, max: 90 },

  { key: 'translate_provider', group: 'translation', type: 'select', options: PROVIDERS, label: 'Moteur par défaut', env: 'TRANSLATE_PROVIDER', def: 'claude',
    help: 'claude : meilleure qualité · azure : gratuit jusqu\'à 2 M caractères/mois · deepseek : très économique.' },
  { key: 'translate_claude_langs', group: 'translation', type: 'langs', label: 'Langues forcées vers Claude', env: 'TRANSLATE_CLAUDE_LANGS' },
  { key: 'translate_azure_langs', group: 'translation', type: 'langs', label: 'Langues forcées vers Azure', env: 'TRANSLATE_AZURE_LANGS' },
  { key: 'translate_deepseek_langs', group: 'translation', type: 'langs', label: 'Langues forcées vers DeepSeek', env: 'TRANSLATE_DEEPSEEK_LANGS' },
  { key: 'anthropic_key', group: 'translation', type: 'secret', label: 'Clé API Claude (Anthropic)', env: 'ANTHROPIC_API_KEY', test: 'claude', help: 'Sert aux traductions et aux résumés.' },
  { key: 'claude_model', group: 'translation', type: 'text', label: 'Modèle Claude', env: 'CLAUDE_MODEL', def: 'claude-haiku-5-5', help: 'claude-sonnet-5-5 : meilleure qualité, plus cher.' },
  { key: 'azure_key', group: 'translation', type: 'secret', label: 'Clé Azure AI Translator', env: 'AZURE_TRANSLATOR_KEY', test: 'azure' },
  { key: 'azure_region', group: 'translation', type: 'text', label: 'Région Azure', env: 'AZURE_TRANSLATOR_REGION', help: 'ex. francecentral' },
  { key: 'azure_endpoint', group: 'translation', type: 'url', label: 'Adresse Azure', env: 'AZURE_TRANSLATOR_ENDPOINT', def: 'https://api.cognitive.microsofttranslator.com' },
  { key: 'azure_chars_per_minute', group: 'translation', type: 'number', label: 'Débit Azure (caractères/minute, 0 = illimité)', env: 'AZURE_CHARS_PER_MINUTE', def: '30000', min: 0, max: 10000000 },
  { key: 'deepseek_key', group: 'translation', type: 'secret', label: 'Clé API DeepSeek', env: 'DEEPSEEK_API_KEY', test: 'deepseek', help: 'Sert aux traductions et aux résumés.' },
  { key: 'deepseek_model', group: 'translation', type: 'text', label: 'Modèle DeepSeek', env: 'DEEPSEEK_MODEL', def: 'deepseek-flash' },
  { key: 'translate_max_chars', group: 'translation', type: 'number', label: 'Garde-fou : longueur maximale d\'une transcription (caractères)', env: 'TRANSLATE_MAX_CHARS', def: '600000', min: 1000, max: 5000000 },

  { key: 'insights_enabled', group: 'insights', type: 'bool', label: 'Générer résumé et chapitres', env: 'INSIGHTS_ENABLED', def: 'true' },
  { key: 'insights_provider', group: 'insights', type: 'select', options: ['auto', 'deepseek', 'claude'], label: 'Moteur', env: 'INSIGHTS_PROVIDER', def: 'auto', help: 'auto : DeepSeek s\'il a une clé, sinon Claude.' },
  { key: 'insights_claude_model', group: 'insights', type: 'text', label: 'Modèle Claude pour les résumés (vide = modèle de traduction)', env: 'INSIGHTS_CLAUDE_MODEL' },
  { key: 'insights_max_chars', group: 'insights', type: 'number', label: 'Garde-fou : longueur maximale (caractères)', env: 'INSIGHTS_MAX_CHARS', def: '200000', min: 1000, max: 5000000 },

  { key: 'whisper_language_mode', group: 'transcription', type: 'select', options: ['declared', 'auto'], label: 'Langue de la parole', env: 'WHISPER_LANGUAGE_MODE', def: 'declared',
    help: 'declared : langue indiquée par l\'organisateur (recommandé) · auto : détection automatique.' },
  { key: 'whisper_model', group: 'transcription', type: 'select', options: ['small', 'medium', 'large-v3-turbo', 'large-v3'], label: 'Modèle Whisper', env: 'WHISPER_MODEL', def: 'small',
    help: 'Plus gros = plus précis mais plus lent. Un nouveau modèle est téléchargé au premier usage.' },
  { key: 'whisper_threads', group: 'transcription', type: 'number', label: 'Cœurs CPU utilisés', env: 'WHISPER_THREADS', def: '4', min: 1, max: 32 },
  { key: 'whisper_beam', group: 'transcription', type: 'number', label: 'Précision de recherche (beam)', env: 'WHISPER_BEAM', def: '3', min: 1, max: 10 },

  { key: 'meili_url', group: 'search', type: 'url', label: 'Adresse du serveur Meilisearch', env: 'MEILI_URL',
    help: 'Vide = recherche simple intégrée (sans tolérance aux fautes). Sur le VPS : http://172.17.0.1:7060 (port hôte du service majlistv-search).' },
  { key: 'meili_key', group: 'search', type: 'secret', label: 'Clé maître Meilisearch', env: 'MEILI_KEY', test: 'meili',
    help: 'La même valeur que la variable MEILI_MASTER_KEY du service majlistv-search. L\'index se remplit tout seul en quelques minutes.' },
];
export const BY_KEY = Object.fromEntries(FIELDS.map((f) => [f.key, f]));

let cache = { at: 0, rows: new Map() };
async function rows() {
  if (Date.now() - cache.at > 5000) {
    const { rows: r } = await pool.query('SELECT key, value, is_secret FROM app_settings');
    cache = { at: Date.now(), rows: new Map(r.map((x) => [x.key, x])) };
  }
  return cache.rows;
}
export const invalidateSettings = () => { cache.at = 0; };

function envFallback(f) {
  const v = f.env ? process.env[f.env] : undefined;
  if (v) return v;
  if (f.key === 'web_url') return (process.env.CORS_ORIGIN || 'http://localhost:3001').split(',')[0].replace(/\/$/, '');
  return f.def ?? '';
}

// Valeur utilisée + origine ('db' | 'env' | 'default').
async function resolve(key) {
  const f = BY_KEY[key];
  const row = (await rows()).get(key);
  if (row && row.value !== '') {
    try { return { value: row.is_secret ? decrypt(row.value) : row.value, source: 'db' }; } catch { /* clé SETTINGS_KEY changée : valeur illisible, on retombe sur l'environnement */ }
  }
  const envVal = f.env ? process.env[f.env] : undefined;
  if (envVal) return { value: envVal, source: 'env' };
  return { value: envFallback(f), source: 'default' };
}

// « true / on / 1 / yes » = oui (les anciennes variables d'environnement acceptaient aussi off/0/no/false).
export const isOn = (v) => !['false', 'off', '0', 'no', ''].includes(String(v).trim().toLowerCase());

export async function getSetting(key) { return (await resolve(key)).value; }
export async function getNumber(key) { const n = Number(await getSetting(key)); return Number.isFinite(n) ? n : Number(BY_KEY[key].def || 0); }

// Description complète pour le back-office : jamais de clé en clair (seulement « défini » + 4 derniers caractères).
export async function describeSettings() {
  const out = [];
  for (const f of FIELDS) {
    const r = await resolve(f.key);
    const item = { key: f.key, group: f.group, type: f.type, label: f.label, help: f.help || '', options: f.options || null,
      test: f.test || null, min: f.min ?? null, max: f.max ?? null, source: r.source };
    if (f.type === 'secret') {
      item.isSet = r.value !== '';
      item.hint = r.value ? `••••${r.value.slice(-4)}` : '';
    } else {
      item.value = f.type === 'bool' ? String(isOn(r.value)) : r.value;
      item.default = f.def ?? '';
    }
    out.push(item);
  }
  return { groups: GROUPS, fields: out, encryption: cryptoReady, langs: TRANSLATION_LANGS };
}

// Contrôle d'une valeur reçue ; renvoie la valeur normalisée ou lève une Error lisible.
export function validateValue(f, raw) {
  const v = String(raw ?? '').trim();
  if (v.length > 500) throw new Error(`${f.label} : valeur trop longue`);
  switch (f.type) {
    case 'secret':
      if (/\s/.test(v)) throw new Error(`${f.label} : la clé ne doit pas contenir d'espace`);
      return v;
    case 'number': {
      const n = Number(v);
      if (!Number.isFinite(n) || n < (f.min ?? -Infinity) || n > (f.max ?? Infinity)) throw new Error(`${f.label} : nombre entre ${f.min} et ${f.max} attendu`);
      return String(Math.trunc(n));
    }
    case 'bool':
      if (!['true', 'false'].includes(v)) throw new Error(`${f.label} : oui ou non attendu`);
      return v;
    case 'select':
      if (!f.options.includes(v)) throw new Error(`${f.label} : valeur non autorisée`);
      return v;
    case 'langs': {
      const list = v.split(',').map((x) => x.trim().toLowerCase()).filter(Boolean);
      if (list.some((l) => !TRANSLATION_LANGS.includes(l))) throw new Error(`${f.label} : langue inconnue`);
      return [...new Set(list)].join(',');
    }
    case 'url':
      if (v) { try { const u = new URL(v); if (!/^https?:$/.test(u.protocol)) throw new Error(); } catch { throw new Error(`${f.label} : adresse invalide (https://…)`); } }
      return v.replace(/\/$/, '');
    default:
      return v;
  }
}

// Enregistre : valeur vide/null = retour à la variable d'environnement ou à la valeur par défaut.
export async function saveSettings(values, userId) {
  for (const [key, raw] of Object.entries(values)) {
    const f = BY_KEY[key];
    if (!f) throw new Error(`Paramètre inconnu : ${key}`);
    const v = raw === null ? '' : validateValue(f, raw);
    if (v === '') {
      await pool.query('DELETE FROM app_settings WHERE key = $1', [key]);
    } else {
      if (f.type === 'secret' && !cryptoReady) throw new Error('La variable SETTINGS_KEY (16 caractères minimum) doit être définie sur l\'API, le traducteur et le transcripteur avant d\'enregistrer une clé.');
      await pool.query(
        `INSERT INTO app_settings (key, value, is_secret, updated_by) VALUES ($1, $2, $3, $4)
         ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, is_secret = EXCLUDED.is_secret, updated_at = now(), updated_by = EXCLUDED.updated_by`,
        [key, f.type === 'secret' ? encrypt(v) : v, f.type === 'secret', userId]
      );
    }
  }
  invalidateSettings();
}
