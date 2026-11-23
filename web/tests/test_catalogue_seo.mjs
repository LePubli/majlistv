// Catalogue, phase 7 (SEO) — /catalogue est enveloppé par une page serveur qui donne titre, description et canonique,
// et marque « noindex, follow » toute adresse filtrée (doublon de /catalogue).
//   node web/tests/test_catalogue_seo.mjs
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
const web = fileURLToPath(new URL('..', import.meta.url));
const page = fs.readFileSync(`${web}/app/catalogue/page.js`, 'utf8');
assert.ok(!/^'use client'/m.test(page), 'la page /catalogue est rendue côté serveur');
assert.match(page, /export async function generateMetadata\(\{ searchParams \}\)/);
assert.match(page, /canonical: url/, 'adresse canonique');
assert.match(page, /filtered \? \{ index: false, follow: true \}/, 'pages filtrées en noindex, follow');
assert.match(page, /import CatalogueClient from '\.\/CatalogueClient'/);
const client = fs.readFileSync(`${web}/app/catalogue/CatalogueClient.js`, 'utf8');
assert.match(client, /^'use client'/, "l'écran interactif reste côté navigateur");
console.log('OK catalogue SEO');

// Pages de catégorie : liste des vidéos en données structurées (ItemList), positions continues d'une page à l'autre.
const cat = fs.readFileSync(`${web}/app/catalogue/[slug]/page.js`, 'utf8');
assert.match(cat, /'@type': 'ItemList'/, 'ItemList sur la page de catégorie');
assert.match(cat, /position: \(page - 1\) \* PAGE \+ i \+ 1/, 'positions continues entre les pages');
assert.match(cat, /talks\.length \?/, 'pas de liste vide');
console.log('OK   ItemList de la page de catégorie');
