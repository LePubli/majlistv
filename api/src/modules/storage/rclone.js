// Module « Stockage et archivage » — pilotage de rclone (étape S2).
// rclone parle SFTP, S3 et WebDAV : changer de fournisseur ne demande aucun code. La configuration est passée par variables
// d'environnement du processus rclone (RCLONE_CONFIG_<NOM>_<OPTION>), jamais écrite sur le disque. Les mots de passe sont
// « obscurcis » par rclone lui-même (format attendu par ses options pass / password).
//   GARAGE : le stockage des vidéos (variables S3_* de l'API)
//   ARCH   : le fournisseur d'archivage choisi
//   ARCHC  : couche de chiffrement par-dessus ARCH (si une phrase de chiffrement est réglée)
import { spawn } from 'node:child_process';
import { config } from '../../config.js';

export const RCLONE_BIN = process.env.RCLONE_BIN || 'rclone';
export const PROVIDERS = ['planethoster', 's3', 'webdav', 'none'];
const COMMON = ['--config', '/tmp/rclone-mejliss-none.conf', '--log-level', 'ERROR', '--contimeout', '20s', '--timeout', '10m',
  '--retries', '2', '--low-level-retries', '5', '--s3-no-check-bucket'];

// Lance rclone ; renvoie { code, stdout, stderr }. Les secrets ne passent jamais dans les arguments (visibles dans ps).
export function run(args, { env = {}, input, timeoutMs = 6 * 3600_000, secrets = [] } = {}) {
  return new Promise((resolve) => {
    let out = ''; let err = ''; let done = false;
    let p;
    try {
      p = spawn(RCLONE_BIN, [...args, ...COMMON], { env: { PATH: process.env.PATH, HOME: process.env.HOME || '/tmp', ...env }, stdio: ['pipe', 'pipe', 'pipe'] });
    } catch (e) { resolve({ code: -1, stdout: '', stderr: e.message }); return; }
    const timer = setTimeout(() => { if (!done) { p.kill('SIGKILL'); err += '\nDélai dépassé'; } }, timeoutMs);
    p.stdout.on('data', (d) => { if (out.length < 2_000_000) out += d; });
    p.stderr.on('data', (d) => { if (err.length < 20_000) err += d; });
    p.on('error', (e) => { done = true; clearTimeout(timer); resolve({ code: -1, stdout: out, stderr: e.code === 'ENOENT' ? 'rclone est introuvable dans le conteneur de l\'API (voir README, étape S2)' : e.message }); });
    p.on('close', (code) => { done = true; clearTimeout(timer); resolve({ code, stdout: out, stderr: scrub(err, secrets) }); });
    if (input !== undefined) p.stdin.end(input); else p.stdin.end();
  });
}

// Retire les secrets d'un message d'erreur et le raccourcit (affiché dans le Studio).
export function scrub(text, secrets = []) {
  let s = String(text || '');
  for (const x of secrets) if (x && x.length >= 4) s = s.split(x).join('••••');
  s = s.split('\n').map((l) => l.replace(/^\d{4}\/\d\d\/\d\d \d\d:\d\d:\d\d (ERROR|CRITICAL|NOTICE) *: */, '').trim()).filter(Boolean).join(' · ');
  return s.slice(0, 600);
}

// Mot de passe au format attendu par rclone (lu sur l'entrée standard, jamais en argument).
export async function obscure(secret) {
  const r = await run(['obscure', '-'], { input: secret, timeoutMs: 15_000 });
  if (r.code !== 0) throw new Error(`rclone obscure : ${r.stderr || 'échec'}`);
  return r.stdout.trim();
}

const isKey = (s) => /-----BEGIN [A-Z ]*PRIVATE KEY-----/.test(s || '');
const cleanFolder = (f) => String(f || '').trim().replace(/^\/+|\/+$/g, '').replace(/\.\.+/g, '.');

// Réglages → environnement rclone + adresse de base des archives. Lève une Error lisible si un champ manque.
export async function remoteEnv(s) {
  const env = {};
  const secrets = [];
  const p = s.provider;
  if (!PROVIDERS.includes(p) || p === 'none') throw Object.assign(new Error('Aucun fournisseur d\'archivage choisi'), { code: 'no_provider' });
  const folder = cleanFolder(s.folder) || 'studio';
  let base;
  if (p === 'planethoster') {
    if (!s.sftp_host || !s.sftp_user || !s.sftp_secret) throw Object.assign(new Error('SFTP : adresse, identifiant et mot de passe (ou clé) sont nécessaires'), { code: 'incomplete' });
    Object.assign(env, { RCLONE_CONFIG_ARCH_TYPE: 'sftp', RCLONE_CONFIG_ARCH_HOST: s.sftp_host.trim(), RCLONE_CONFIG_ARCH_PORT: String(s.sftp_port || 22), RCLONE_CONFIG_ARCH_USER: s.sftp_user.trim() });
    secrets.push(s.sftp_secret);
    // Clé privée : rclone attend les retours à la ligne sous la forme « \n » (option key_pem).
    if (isKey(s.sftp_secret)) env.RCLONE_CONFIG_ARCH_KEY_PEM = s.sftp_secret.trim().replace(/\r?\n/g, '\\n');
    else env.RCLONE_CONFIG_ARCH_PASS = await obscure(s.sftp_secret);
    base = `ARCH:${folder}`;
  } else if (p === 's3') {
    if (!s.s3_endpoint || !s.s3_bucket || !s.s3_access_key || !s.s3_secret_key) throw Object.assign(new Error('S3 : adresse, bucket, clé d\'accès et clé secrète sont nécessaires'), { code: 'incomplete' });
    Object.assign(env, {
      RCLONE_CONFIG_ARCH_TYPE: 's3', RCLONE_CONFIG_ARCH_PROVIDER: 'Other', RCLONE_CONFIG_ARCH_ENDPOINT: s.s3_endpoint, RCLONE_CONFIG_ARCH_REGION: s.s3_region || 'auto',
      RCLONE_CONFIG_ARCH_ACCESS_KEY_ID: s.s3_access_key.trim(), RCLONE_CONFIG_ARCH_SECRET_ACCESS_KEY: s.s3_secret_key, RCLONE_CONFIG_ARCH_FORCE_PATH_STYLE: 'true',
    });
    secrets.push(s.s3_secret_key);
    base = `ARCH:${s.s3_bucket.trim()}/${folder}`;
  } else {
    if (!s.webdav_url) throw Object.assign(new Error('WebDAV : l\'adresse est nécessaire'), { code: 'incomplete' });
    Object.assign(env, { RCLONE_CONFIG_ARCH_TYPE: 'webdav', RCLONE_CONFIG_ARCH_URL: s.webdav_url, RCLONE_CONFIG_ARCH_VENDOR: 'other' });
    if (s.webdav_user) env.RCLONE_CONFIG_ARCH_USER = s.webdav_user.trim();
    if (s.webdav_pass) { env.RCLONE_CONFIG_ARCH_PASS = await obscure(s.webdav_pass); secrets.push(s.webdav_pass); }
    base = `ARCH:${folder}`;
  }
  let remote = base;
  const encrypted = Boolean(s.encrypt_pass);
  if (encrypted) {
    // Contenu chiffré, noms de fichiers lisibles (pour s'y retrouver chez le fournisseur ; suffixe .bin).
    Object.assign(env, {
      RCLONE_CONFIG_ARCHC_TYPE: 'crypt', RCLONE_CONFIG_ARCHC_REMOTE: base, RCLONE_CONFIG_ARCHC_PASSWORD: await obscure(s.encrypt_pass),
      RCLONE_CONFIG_ARCHC_FILENAME_ENCRYPTION: 'off', RCLONE_CONFIG_ARCHC_DIRECTORY_NAME_ENCRYPTION: 'false',
    });
    secrets.push(s.encrypt_pass);
    remote = 'ARCHC:';
  }
  return { env, base, remote, encrypted, secrets };
}

// Garage (stockage des vidéos), vu par rclone.
export function garageEnv() {
  const g = config.s3;
  if (!g.endpoint || !g.accessKey || !g.secretKey) throw Object.assign(new Error('Stockage Garage non configuré (variables S3_*)'), { code: 'storage_off' });
  return {
    env: {
      RCLONE_CONFIG_GARAGE_TYPE: 's3', RCLONE_CONFIG_GARAGE_PROVIDER: 'Other', RCLONE_CONFIG_GARAGE_ENDPOINT: g.endpoint, RCLONE_CONFIG_GARAGE_REGION: g.region,
      RCLONE_CONFIG_GARAGE_ACCESS_KEY_ID: g.accessKey, RCLONE_CONFIG_GARAGE_SECRET_ACCESS_KEY: g.secretKey, RCLONE_CONFIG_GARAGE_FORCE_PATH_STYLE: 'true',
    },
    path: (key) => `GARAGE:${g.bucket}/${key}`,
    secrets: [g.secretKey],
  };
}

// Joint un dossier de base et une clé : « ARCH:studio » + « a/b.mp4 » → « ARCH:studio/a/b.mp4 » ; « ARCHC: » + … → « ARCHC:a/b.mp4 ».
export const join = (remote, key) => (remote.endsWith(':') ? remote + key : `${remote}/${key}`);

// Taille d'un fichier distant (null s'il n'existe pas).
export async function statSize(env, path, secrets) {
  const r = await run(['lsjson', '--stat', '--no-mimetype', path], { env, timeoutMs: 120_000, secrets });
  if (r.code !== 0) return { size: null, error: r.stderr };
  try { const j = JSON.parse(r.stdout); return { size: j && !j.IsDir ? Number(j.Size) : null }; } catch { return { size: null, error: 'réponse illisible' }; }
}
