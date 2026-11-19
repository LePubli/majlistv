// Thème « Premium » (thème V20 fourni par Epok, 19/11/2026) : bâti sur le thème bleu, choix dans Admin → Paramètres,
// illustrations du thème (sans avatar inventé ni affiche « Prophètes »), Montserrat, vrai logo.
import assert from 'node:assert/strict';
import fs from 'node:fs';
const read = (p) => fs.readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');
const { SKINS, skinAttr, isBlueFamily, applySkin } = await import('../lib/skin.js');
assert.deepEqual(SKINS, ['classique', 'nuit', 'bleu', 'premium']);
assert.equal(skinAttr('premium'), 'bleu', 'premium reprend toutes les règles du thème bleu');
assert.equal(skinAttr('nuit'), 'nuit');
assert.ok(isBlueFamily('premium') && isBlueFamily('bleu') && !isBlueFamily('classique'));
const el = { dataset: {} };
applySkin(el, 'premium'); assert.deepEqual(el.dataset, { skin: 'bleu', skinName: 'premium', premium: '' });
applySkin(el, 'nuit'); assert.deepEqual(el.dataset, { skin: 'nuit', skinName: 'nuit' }, 'changer de thème retire data-premium');
const lay = read('app/layout.js');
assert.match(lay, /import '\.\/skin-premium\.css'/);
assert.match(lay, /data-premium=\{skin === 'premium' \? '' : undefined\}/);
assert.match(read('app/page.js'), /if \(isBlueFamily\(skin\)\)/, 'accueil streaming');
assert.match(read('app/catalogue/page.js'), /if \(isBlueFamily\(skin\)\)/, 'catalogue streaming');
assert.match(read('components/SkinPicker.js'), /\['premium', 'skPremium'\]/);
const i18n = read('lib/i18n.js');
assert.equal((i18n.match(/\bskPremium:/g) || []).length, 3, 'skPremium en fr/en/ar');
const css = read('app/skin-premium.css');
const rules = css.replace(/\/\*[\s\S]*?\*\//g, '').match(/[^{}@]+\{/g).map((x) => x.replace(/\{$/, '').trim()).filter((x) => x && !/^(from|to|\d)/.test(x) && !x.startsWith('media') && !/^\(/.test(x));
const top = (sel) => { const out = []; let d = 0, cur = ''; for (const ch of sel) { if (ch === '(') d++; if (ch === ')') d--; if (ch === ',' && !d) { out.push(cur); cur = ''; } else cur += ch; } out.push(cur); return out; };
for (const r of rules) for (const part of top(r)) assert.match(part.trim(), /^html\[data-premium\]/, `règle limitée au thème Premium : ${part.trim()}`);
assert.match(css, /#087CFF/); assert.match(css, /#031127/);
assert.doesNotMatch(css.replace(/\/\*[\s\S]*?\*\//g, ''), /Georgia/, 'titres en Montserrat (choix d’Epok)');
assert.match(css, /html\[data-premium\]\[dir="rtl"\] \.hero\.banner \.banner-shade/, 'dégradé inversé en arabe');
for (const m of css.matchAll(/url\('\/premium\/([\w-]+\.webp)'\)/g)) assert.ok(fs.existsSync(new URL(`../public/premium/${m[1]}`, import.meta.url)), `image ${m[1]}`);
const files = fs.readdirSync(new URL('../public/premium/', import.meta.url));
assert.ok(!files.some((f) => /avatar|reference|prophet|prophete/i.test(f)), 'ni avatar inventé, ni capture de référence, ni affiche « Prophètes »');
const { PREMIUM_ART, posterArt } = await import('../lib/thumb.js');
for (const a of PREMIUM_ART) { assert.ok(files.includes(`${a}.webp`), `décor ${a}`); assert.doesNotMatch(a, /salahuddin|khwarizmi|kids/, 'décor sans personnage'); }
assert.equal(posterArt('abc'), posterArt('abc')); assert.match(posterArt('x'), /^url\(\/premium\/[\w-]+\.webp\)$/);
assert.match(read('components/TalkCard.js'), /'--ph-art': posterArt\(talk\.id\)/);
console.log('web premium OK');
