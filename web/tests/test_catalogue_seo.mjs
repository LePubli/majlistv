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
