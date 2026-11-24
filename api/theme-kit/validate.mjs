// Contrôle un thème (dossier ou .zip) avec EXACTEMENT les mêmes règles que le site :   node api/theme-kit/validate.mjs mon-theme.zip
import fs from 'node:fs';
import { parsePack } from '../src/themePack.js';
import { zipFolder } from './build.mjs';

const target = process.argv[2];
if (!target) { console.error('Usage : node api/theme-kit/validate.mjs <dossier ou .zip>'); process.exit(2); }
const buf = fs.statSync(target).isDirectory() ? zipFolder(target) : fs.readFileSync(target);
const r = parsePack(buf);
for (const w of r.warnings) console.log('⚠ ' + w);
if (!r.ok) { for (const e of r.errors) console.error('✗ ' + e); console.error(`\n${r.errors.length} erreur(s).`); process.exit(1); }
const s = r.summary;
console.log(`✓ Thème valide : « ${s.name} » ${s.version} (base ${s.base}) : ${s.tokens} réglage(s), ${s.fonts} police(s), CSS ${s.cssBytes} o, ${s.assets} image(s), ${s.pages} page(s), ${s.globals} section(s) globale(s), ${s.templates} modèle(s).`);
