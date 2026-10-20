// Recherche « sans accents » (registre n°47) sans extension Postgres : la même table de correspondance sert en JavaScript
// (ce que la personne tape) et en SQL (translate() sur la colonne). Français : é → e, ç → c, œ → o… ; arabe : voyelles
// courtes (harakat) et tatweel retirées, alif hamza / madda → alif, tâ marbûta → hâ, alif maqsûra → yâ.
// Paires « lettre → lettre de base » ; les lettres de AR_DROP sont supprimées.
const PAIRS = [
  ['àáâãäåā', 'a'], ['èéêëē', 'e'], ['ìíîïī', 'i'], ['òóôõöøōœ', 'o'], ['ùúûüū', 'u'], ['ýÿ', 'y'], ['ç', 'c'], ['ñ', 'n'], ['æ', 'a'],
  ['أإآٱ', 'ا'], ['ة', 'ه'], ['ى', 'ي'],
];
const AR_DROP = '\u064B\u064C\u064D\u064E\u064F\u0650\u0651\u0652\u0640'; // harakat, chadda, soukoun, tatweel
const FROM = PAIRS.map(([f]) => f).join('') + AR_DROP;
const TO = PAIRS.map(([f, t]) => t.repeat([...f].length)).join('');
const MAP = new Map([...FROM].map((ch, i) => [ch, i < TO.length ? TO[i] : '']));

export function fold(s) {
  return [...String(s || '').toLowerCase()].map((ch) => (MAP.has(ch) ? MAP.get(ch) : ch)).join('');
}

// Expression SQL équivalente pour une colonne (texte).
export const foldSql = (expr) => `translate(lower(${expr}), '${FROM}', '${TO}')`;
