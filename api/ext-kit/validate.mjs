// Contrôle une extension (dossier ou .zip) avec EXACTEMENT les mêmes règles que le site :   node api/ext-kit/validate.mjs mon-extension/
import fs from 'node:fs';
import { parseExtPack } from '../src/extPack.js';
import { zipFolder } from './build.mjs';

const target = process.argv[2];
if (!target) { console.error('Usage : node api/ext-kit/validate.mjs <dossier ou .zip>'); process.exit(2); }
const buf = fs.statSync(target).isDirectory() ? zipFolder(target) : fs.readFileSync(target);
const r = parseExtPack(buf);
for (const w of r.warnings) console.log('⚠ ' + w);
if (!r.ok) { for (const e of r.errors) console.error('✗ ' + e); console.error(`\n${r.errors.length} erreur(s).`); process.exit(1); }
const s = r.summary;
console.log(`✓ Extension valide : « ${s.name} » ${s.version} : ${s.blocks} bloc(s) gabarit, ${s.composed} composé(s), ${s.settings} réglage(s), ${s.features} fonction(s), ${s.texts} texte(s), CSS ${s.cssBytes} o.`);
