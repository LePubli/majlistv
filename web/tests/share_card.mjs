// Étape 32 — calculs purs des cartes à partager. Lancement depuis la racine du dépôt : node web/tests/share_card.mjs
import assert from 'node:assert/strict';
import { isRtlText, clipText, wrapLines, fitBlocks, cardFileName, clockLabel, FORMATS } from '../lib/shareCard.js';

let n = 0;
const ok = (c, m) => { assert.ok(c, m); n++; console.log('OK   ' + m); };
const mono = (px) => (s) => Array.from(s).length * px; // police « à chasse fixe » : 1 lettre = px pixels

ok(isRtlText('بسم الله الرحمن الرحيم') && !isRtlText('Au nom de Dieu') && !isRtlText('') && !isRtlText(null), 'détection du sens de lecture');
ok(isRtlText('Dieu قال') === false && isRtlText('قال الله تعالى Dieu') === true, 'texte mixte : majorité des lettres');

ok(clipText('court', 50) === 'court', 'texte court intact');
const long = 'Le savoir est une lumière que Dieu dépose dans le cœur de celui qu\'il veut guider';
const c = clipText(long, 40);
ok(c.length <= 40 && c.endsWith('…') && !c.includes('  ') && long.startsWith(c.slice(0, -1).trimEnd()), 'texte long coupé sur un mot avec « … »');
ok(clipText('a   b\n c', 20) === 'a b c', 'espaces et retours normalisés');

// Retour à la ligne
ok(JSON.stringify(wrapLines(mono(10), 'un deux trois quatre', 100)) === JSON.stringify(['un deux', 'trois', 'quatre']), 'retour à la ligne aux mots');
ok(wrapLines(mono(10), '', 100).length === 0, 'texte vide : aucune ligne');
const w = wrapLines(mono(10), 'abcdefghijklmnopqrstuvwxyz', 100);
ok(w.length === 3 && w.join('') === 'abcdefghijklmnopqrstuvwxyz' && w.every((l) => l.length <= 10), 'mot plus large que la ligne : coupé par lettres sans perte');
ok(wrapLines(mono(10), 'a b c', 1000).length === 1, 'tout tient sur une ligne');

// Ajustement de la taille
const measureAt = (size) => mono(size * 0.5);
const blocks = [{ text: 'mot '.repeat(40).trim(), ratio: 1, lineHeight: 1.5 }, { text: 'traduction '.repeat(20).trim(), ratio: 0.7, lineHeight: 1.4 }];
const big = fitBlocks(blocks, { maxWidth: 900, maxHeight: 2000, max: 70, min: 20, measureAt });
const small = fitBlocks(blocks, { maxWidth: 900, maxHeight: 500, max: 70, min: 20, measureAt });
ok(big.size === 70 && big.height <= 2000, 'beaucoup de place : taille maximale');
ok(small.size < 70 && small.height <= 500, `peu de place : police réduite (${small.size} px) et le texte tient (${small.height} px)`);
const tiny = fitBlocks(blocks, { maxWidth: 900, maxHeight: 10, max: 70, min: 20, measureAt });
ok(tiny.size === 20, 'jamais sous la taille minimale');
ok(small.layouts[1].fontSize === Math.round(small.size * 0.7), 'le 2e bloc suit son ratio');
ok(fitBlocks([], { maxWidth: 100, maxHeight: 100, measureAt }).height === 0, 'aucun bloc : hauteur nulle');

// Divers
ok(cardFileName('L\'Éloge de la Science — Cheikh', 'story') === 'l-eloge-de-la-science-cheikh-story.png', 'nom de fichier sans accents ni symboles');
ok(cardFileName('', 'wide') === 'carte-wide.png' && cardFileName('بسم', 'wide') === 'carte-wide.png', 'nom de fichier de repli');
ok(clockLabel(754) === '12:34' && clockLabel(3723) === '1:02:03' && clockLabel(5) === '0:05' && clockLabel(-3) === '0:00', 'instants mm:ss et h:mm:ss');
ok(FORMATS.square.w === 1080 && FORMATS.story.h === 1920 && FORMATS.wide.w === 1200 && FORMATS.wide.h === 630, 'formats carré, story et paysage');
console.log(`\n${n} vérifications réussies`);
