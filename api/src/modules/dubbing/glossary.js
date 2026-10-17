// Module « Doublage français » — glossaire de prononciation (étape D1b).
// Même règle que le service de doublage (dubbing/src/glossary.py) : termes les plus longs d'abord, « mot entier » = pas de lettre
// ni de chiffre collé avant ou après (l'apostrophe compte comme une séparation : « l'Imam »), majuscules ignorées sauf demande.
const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

export function compile(entries) {
  return entries.filter((e) => e.active !== false && e.term && e.term.trim())
    .sort((a, b) => b.term.trim().length - a.term.trim().length)
    .map((e) => {
      const body = esc(e.term.trim());
      const src = e.whole_word ?? e.wholeWord ?? true ? `(?<![\\p{L}\\p{N}_])${body}(?![\\p{L}\\p{N}_])` : body;
      return { term: e.term.trim(), say: e.say, re: new RegExp(src, `gu${(e.case_sensitive ?? e.caseSensitive) ? '' : 'i'}`) };
    });
}

// Texte prononcé + liste des remplacements faits [{ term, say }]. Un passage déjà remplacé n'est pas remplacé une seconde fois.
export function apply(text, compiled) {
  const parts = [];
  let out = String(text || '');
  const hits = [];
  for (const g of compiled) {
    out = out.replace(g.re, (m) => {
      hits.push({ term: m, say: g.say });
      parts.push(g.say);
      return `${parts.length - 1}`;
    });
  }
  return { text: out.replace(/(\d+)/g, (_, i) => parts[Number(i)]), hits };
}
