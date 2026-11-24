// Régénère le dossier d'exemple et le guide pour IA depuis le code :   node api/ext-kit/generate.mjs
import fs from 'node:fs';
import path from 'node:path';
import { buildExtGuide, EXT_EXAMPLE } from '../src/extKit.js';

const HERE = path.dirname(import.meta.filename);
fs.rmSync(path.join(HERE, 'example'), { recursive: true, force: true });
for (const [name, data] of Object.entries(EXT_EXAMPLE)) {
  const p = path.join(HERE, 'example', name);
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, data);
}
fs.writeFileSync(path.join(HERE, 'GUIDE-EXTENSIONS-IA.md'), buildExtGuide());
console.log('example/ et GUIDE-EXTENSIONS-IA.md mis à jour');
