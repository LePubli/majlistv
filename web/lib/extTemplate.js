// Lot X1 — Gabarits HTML des blocs d'extension. Copie IDENTIQUE dans web/lib/extTemplate.js (même code côté API et côté site).
//
// Un gabarit est du HTML restreint + quelques instructions entre doubles accolades. Aucun script, aucun style en ligne, aucun
// attribut d'événement : à l'installation, tout ce qui n'est pas dans la liste blanche est REFUSÉ (message précis), jamais « nettoyé ».
// Au rendu, chaque valeur est échappée ; les adresses sont revérifiées ; les images ne viennent que de la bibliothèque du site.
//
//   {{champ}}              valeur d'un champ du bloc (texte dans la langue du visiteur, nombre, choix, adresse)
//   {{champ|br}}           idem, les retours à la ligne deviennent des <br>
//   {{t:cle}}              texte de l'extension (extension.json → "texts"), dans la langue du visiteur
//   {{s:cle}}              réglage de l'extension (Admin → Extensions)
//   {{lang}} {{dir}}       langue (fr/en/ar) et sens d'écriture (ltr/rtl)
//   {{#if cond}}…{{else}}…{{/if}}   cond : champ | !champ | champ=valeur | feat:cle (fonction activée) | s:cle | !s:cle
//   {{#each liste}}…{{/each}}       répète pour chaque élément d'un champ « liste » ; dedans {{champ}} est un champ de l'élément, {{@n}} = 1, 2, 3…
//   Dans src="" : {{champ}} d'un champ « image » seulement. Dans href="" : un champ « adresse » ou une adresse fixe valide.
import { LANGS, validUrl, tx } from './blocks.js';

export const TPL_TAGS = ['div', 'span', 'p', 'h2', 'h3', 'h4', 'h5', 'h6', 'a', 'img', 'ul', 'ol', 'li', 'section', 'article', 'header', 'footer', 'nav', 'aside', 'figure', 'figcaption',
  'strong', 'em', 'b', 'i', 'u', 'small', 'br', 'hr', 'blockquote', 'table', 'thead', 'tbody', 'tr', 'th', 'td', 'details', 'summary'];
const VOID = ['br', 'hr', 'img'];
// Attributs permis : nom → règle (static = valeur fixe seulement ; text = valeur fixe ou champs texte ; url ; media).
export const TPL_ATTRS = { class: 'class', href: 'url', src: 'media', alt: 'text', title: 'text', role: 'role', width: 'int', height: 'int', colspan: 'int', rowspan: 'int', open: 'bool', 'aria-label': 'text', 'aria-hidden': 'bool-str', 'aria-expanded': 'bool-str' };
export const TPL_ROLES = ['list', 'listitem', 'region', 'note', 'img', 'presentation', 'group', 'navigation'];
const MAX_SRC = 20 * 1024, MAX_NODES = 600, MAX_DEPTH = 14;
const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');

// ------------------------------------------------------------------ Compilation (à l'installation, et au rendu)
// fields : liste de champs (même description que BLOCK_TYPES.<type>.fields). env : { texts: Set de clés, settings: Set de clés, features: Set de clés }.
// Renvoie { ast, errors[] }.
export function compileTemplate(src, fields, env = {}) {
  const errors = [];
  const fail = (m) => { if (errors.length < 12) errors.push(m); };
  src = String(src ?? '');
  if (src.length > MAX_SRC) return { ast: [], errors: [`Gabarit trop long (${MAX_SRC / 1024} Ko au maximum)`] };
  const byKey = Object.fromEntries(fields.map((f) => [f.k, f]));
  let nodes = 0;
  // Résolution d'une expression {{…}} dans un contexte : scope = liste de champs visibles ; ctx = 'text' | 'url' | 'media' | 'attr-text'
  const parseExpr = (raw, scope, ctx) => {
    const e = raw.trim();
    const sc = Object.fromEntries(scope.map((f) => [f.k, f]));
    let m;
    if (e === 'lang' || e === 'dir') { if (ctx !== 'text' && ctx !== 'attr-text') fail(`{{${e}}} n'est permis que dans un texte`); return { v: e }; }
    if (e === '@n') { if (!scope.inEach) fail('{{@n}} n’existe que dans {{#each}}'); return { v: '@n' }; }
    if ((m = e.match(/^t:([A-Za-z0-9_]{1,40})$/))) { if (env.texts && !env.texts.has(m[1])) fail(`{{t:${m[1]}}} : texte absent de « texts » dans extension.json`); if (ctx === 'url' || ctx === 'media') fail('Un texte de l’extension ne peut pas servir d’adresse'); return { v: 't', key: m[1] }; }
    if ((m = e.match(/^s:([A-Za-z0-9_]{1,40})$/))) { if (env.settings && !env.settings.has(m[1])) fail(`{{s:${m[1]}}} : réglage absent de « settings » dans extension.json`); if (ctx === 'url' || ctx === 'media') fail('Un réglage ne peut pas servir d’adresse'); return { v: 's', key: m[1] }; }
    m = e.match(/^([A-Za-z][A-Za-z0-9_]{0,30})(\|br)?$/);
    if (!m) { fail(`Expression non comprise : {{${e}}}`); return { v: 'x' }; }
    const f = sc[m[1]];
    if (!f) { fail(`{{${e}}} : champ « ${m[1]} » inconnu${scope.inEach ? ' dans cette liste' : ''}`); return { v: 'x' }; }
    if (f.kind === 'list') { fail(`{{${e}}} : « ${m[1]} » est une liste : utilisez {{#each ${m[1]}}}`); return { v: 'x' }; }
    if (ctx === 'media' && f.kind !== 'media') fail(`src="" n’accepte qu’un champ de type « media » (image) : « ${m[1]} » est de type « ${f.kind} »`);
    else if (ctx === 'url' && f.kind !== 'url') fail(`href="" n’accepte qu’un champ de type « url » (adresse) : « ${m[1]} » est de type « ${f.kind} »`);
    else if ((ctx === 'text' || ctx === 'attr-text') && (f.kind === 'media' || f.kind === 'url') && ctx === 'attr-text') fail(`Un champ « ${f.kind} » ne peut pas servir de texte d’attribut`);
    else if (ctx === 'text' && f.kind === 'media') fail(`« ${m[1]} » est une image : placez-la dans src=""`);
    if (m[2] && !['t', 'tl'].includes(f.kind)) fail(`{{${e}}} : |br ne s’applique qu’aux textes`);
    return { v: 'f', key: m[1], br: Boolean(m[2]) };
  };
  const parseCond = (raw, scope) => {
    const e = raw.trim();
    let neg = false; let s = e;
    if (s.startsWith('!')) { neg = true; s = s.slice(1); }
    let m;
    if ((m = s.match(/^feat:([A-Za-z0-9_]{1,40})$/))) { if (env.features && !env.features.has(m[1])) fail(`{{#if ${e}}} : fonction « ${m[1]} » absente de « features »`); return { c: 'feat', key: m[1], neg }; }
    if ((m = s.match(/^s:([A-Za-z0-9_]{1,40})$/))) { if (env.settings && !env.settings.has(m[1])) fail(`{{#if ${e}}} : réglage « ${m[1]} » absent de « settings »`); return { c: 's', key: m[1], neg }; }
    if ((m = s.match(/^([A-Za-z][A-Za-z0-9_]{0,30})(?:=([A-Za-z0-9_\-]{1,40}))?$/))) {
      const f = scope.find((x) => x.k === m[1]);
      if (!f) { fail(`{{#if ${e}}} : champ « ${m[1]} » inconnu`); return { c: 'f', key: m[1], neg }; }
      return { c: 'f', key: m[1], eq: m[2], neg };
    }
    fail(`Condition non comprise : {{#if ${e}}}`);
    return { c: 'f', key: 'x', neg };
  };

  // Découpe en jetons : balises HTML, instructions {{…}}, texte.
  const re = /<!--[\s\S]*?-->|<\/?[A-Za-z][^>]*>|\{\{[^}]*\}\}|[^<{]+|[<{]/g;
  const root = []; const stack = [{ kids: root, kind: 'root', scope: fields }];
  const top = () => stack[stack.length - 1];
  const push = (n) => { nodes++; top().kids.push(n); };
  let m;
  while ((m = re.exec(src))) {
    const tk = m[0];
    if (nodes > MAX_NODES) { fail(`Gabarit trop complexe (${MAX_NODES} éléments au maximum)`); break; }
    if (tk.startsWith('<!--')) continue;
    if (tk.startsWith('{{')) {
      const inner = tk.slice(2, -2).trim();
      if (inner.startsWith('#if ')) { const n = { t: 'if', cond: parseCond(inner.slice(4), top().scope), then: [], else: [] }; push(n); stack.push({ kids: n.then, kind: 'if', node: n, scope: top().scope }); }
      else if (inner === 'else') { const f = top(); if (f.kind !== 'if' || f.inElse) fail('{{else}} sans {{#if}}'); else { f.kids = f.node.else; f.inElse = true; } }
      else if (inner === '/if') { if (top().kind !== 'if') fail('{{/if}} sans {{#if}}'); else stack.pop(); }
      else if (inner.startsWith('#each ')) {
        const key = inner.slice(6).trim(); const f = top().scope.find((x) => x.k === key);
        if (!f || f.kind !== 'list') { fail(`{{#each ${key}}} : « ${key} » n’est pas une liste du bloc`); }
        if (top().scope.inEach) fail('{{#each}} ne peut pas être imbriqué');
        const sub = Object.assign([...(f?.fields || [])], { inEach: true });
        const n = { t: 'each', key, body: [] }; push(n); stack.push({ kids: n.body, kind: 'each', node: n, scope: sub });
      } else if (inner === '/each') { if (top().kind !== 'each') fail('{{/each}} sans {{#each}}'); else stack.pop(); }
      else if (inner.startsWith('#') || inner.startsWith('/')) fail(`Instruction inconnue : {{${inner}}}`);
      else push({ t: 'var', ...parseExpr(inner, top().scope, 'text') });
      continue;
    }
    if (tk === '<' || tk === '{') { if (tk === '<') fail('Caractère « < » seul : écrivez &lt;'); else push({ t: 'text', v: '{' }); continue; }
    if (tk.startsWith('</')) {
      const name = tk.slice(2, -1).trim().toLowerCase();
      const f = top();
      if (f.kind !== 'tag' || f.node.name !== name) { fail(`Balise fermante </${name}> sans ouverture correspondante`); continue; }
      stack.pop(); continue;
    }
    if (tk.startsWith('<')) {
      const mt = tk.match(/^<([A-Za-z][A-Za-z0-9]*)([\s\S]*?)(\/?)>$/);
      if (!mt) { fail(`Balise non comprise : ${tk.slice(0, 40)}`); continue; }
      const name = mt[1].toLowerCase();
      if (!TPL_TAGS.includes(name)) { fail(`Balise <${name}> interdite (permises : ${TPL_TAGS.join(', ')})`); continue; }
      const attrs = []; const sc = top().scope;
      const are = /\s*([A-Za-z_:][-A-Za-z0-9_:.]*)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'))?\s*/y;
      let rest = mt[2]; let pos = 0;
      while (pos < rest.length) {
        are.lastIndex = pos; if (/^\s*$/.test(rest.slice(pos))) break;
        const am = are.exec(rest);
        if (!am || am.index !== pos) { fail(`<${name}> : attribut mal écrit près de « ${rest.slice(pos, pos + 20)} »`); break; }
        pos = are.lastIndex;
        const an = am[1].toLowerCase(); const av = am[2] ?? am[3] ?? '';
        const rule = TPL_ATTRS[an];
        if (!rule) { fail(`<${name}> : attribut « ${an} » interdit (permis : ${Object.keys(TPL_ATTRS).join(', ')})`); continue; }
        if (an === 'src' && name !== 'img') { fail('src="" n’est permis que sur <img>'); continue; }
        if (an === 'href' && name !== 'a') { fail('href="" n’est permis que sur <a>'); continue; }
        if (an === 'alt' && name !== 'img') { fail('alt="" n’est permis que sur <img>'); continue; }
        const parts = []; let last = 0; const vr = /\{\{([^}]*)\}\}/g; let vm; let hasVar = false;
        while ((vm = vr.exec(av))) { hasVar = true; if (vm.index > last) parts.push(av.slice(last, vm.index)); parts.push(parseExpr(vm[1], sc, rule === 'media' ? 'media' : rule === 'url' ? 'url' : 'attr-text')); last = vm.index + vm[0].length; }
        if (last < av.length) parts.push(av.slice(last));
        if (/[<>]/.test(av)) fail(`<${name} ${an}> : « < » et « > » interdits dans une valeur`);
        if (an === 'class') {
          // class="" : texte fixe, plus éventuellement des champs « choix » (sel) dont les valeurs sont des mots simples (ex. class="x-id-look-{{look}}")
          for (const p of parts) {
            if (typeof p === 'string') { if (!/^[A-Za-z0-9_\- ]*$/.test(p)) fail('class="" : lettres, chiffres, tirets et soulignés seulement'); }
            else if (!(p.v === 'f' && sc.find((x) => x.k === p.key)?.kind === 'sel')) fail('class="" n’accepte que des champs de type « sel » (choix)');
          }
        }
        if (rule === 'role' && !TPL_ROLES.includes(av)) fail(`role="${av}" non permis (permis : ${TPL_ROLES.join(', ')})`);
        if (rule === 'int' && !/^\d{1,4}$/.test(av)) fail(`${an}="" : nombre entier`);
        if (rule === 'bool-str' && !['true', 'false'].includes(av)) fail(`${an}="" : true ou false`);
        if (rule === 'bool' && av !== '' && av !== an) fail(`${an} : attribut sans valeur`);
        if (rule === 'url' && !hasVar && !(av.startsWith('#') || validUrl(av))) fail(`href="${av.slice(0, 40)}" : adresse non valide (/page, https://…, mailto:, tel: ou #ancre)`);
        if (rule === 'url' && hasVar && (parts.length !== 1 || typeof parts[0] === 'string')) fail('href="" : un seul champ « url », sans texte autour');
        if (rule === 'media' && (!hasVar || parts.length !== 1 || typeof parts[0] === 'string')) fail('src="" : un seul champ « media » (image), sans texte autour');
        attrs.push([an, parts]);
      }
      const node = { t: 'tag', name, attrs, kids: [] };
      if (name === 'img' && !attrs.some(([a]) => a === 'alt')) fail('<img> : alt="" obligatoire (description pour les malvoyants ; alt="" si décorative)');
      if (name === 'img' && !attrs.some(([a]) => a === 'src')) fail('<img> : src="{{champ_image}}" obligatoire');
      if (name === 'a' && !attrs.some(([a]) => a === 'href')) fail('<a> : href="" obligatoire');
      push(node);
      if (!VOID.includes(name) && !mt[3]) { if (stack.length > MAX_DEPTH) { fail(`Gabarit trop profond (${MAX_DEPTH} niveaux au maximum)`); break; } stack.push({ kids: node.kids, kind: 'tag', node, scope: top().scope }); }
      continue;
    }
    // texte brut : une accolade ou un chevron dans le texte doit être écrit en entités (&lt; etc.) ; & n'est permis qu'en entité
    if (/&(?!(?:[a-z]{2,8}|#\d{1,6}|#x[0-9a-f]{1,6});)/i.test(tk)) fail('Le caractère & doit être écrit &amp; (ou une entité comme &nbsp;)');
    push({ t: 'text', v: tk });
  }
  for (const fr of stack.slice(1)) fail(fr.kind === 'tag' ? `Balise <${fr.node.name}> jamais fermée` : fr.kind === 'if' ? '{{#if}} jamais fermé' : '{{#each}} jamais fermé');
  return { ast: errors.length ? [] : root, errors };
}

// ------------------------------------------------------------------ Rendu → chaîne HTML (tout est échappé)
// ctx : { props, fields, lang, texts: { cle: {fr,en,ar} }, settings: { cle: valeur }, features: { cle: bool }, mediaUrl(id) }
const fieldText = (f, v, lang) => {
  if (v == null || v === '') return '';
  if (f.kind === 't' || f.kind === 'tl') return tx(v, lang);
  if (f.kind === 'sel' || f.kind === 'num' || f.kind === 'url') return String(v);
  return '';
};
const truthy = (f, v, lang) => (f.kind === 'list' ? Array.isArray(v) && v.length > 0 : f.kind === 'num' ? Number(v) > 0 : Boolean(fieldText(f, v, lang) || (f.kind === 'media' && v)));
export function renderTemplate(ast, ctx) {
  const lang = LANGS.includes(ctx.lang) ? ctx.lang : 'fr';
  const dir = lang === 'ar' ? 'rtl' : 'ltr';
  const out = [];
  const lookup = (scope, key) => ({ f: scope.fields.find((x) => x.k === key), v: scope.props?.[key] });
  const val = (n, scope) => {
    if (n.v === 'lang') return lang; if (n.v === 'dir') return dir; if (n.v === '@n') return String(scope.n || 1);
    if (n.v === 't') return tx(ctx.texts?.[n.key], lang);
    if (n.v === 's') { const s = ctx.settings?.[n.key]; return s == null || typeof s === 'object' ? '' : String(s); }
    if (n.v === 'f') { const { f, v } = lookup(scope, n.key); return f ? fieldText(f, v, lang) : ''; }
    return '';
  };
  const cond = (c, scope) => {
    let r;
    if (c.c === 'feat') r = Boolean(ctx.features?.[c.key]);
    else if (c.c === 's') { const s = ctx.settings?.[c.key]; r = !(s == null || s === '' || s === false || s === 0 || s === '0'); }
    else { const { f, v } = lookup(scope, c.key); r = f ? (c.eq !== undefined ? fieldText(f, v, lang) === c.eq : truthy(f, v, lang)) : false; }
    return c.neg ? !r : r;
  };
  const walk = (nodes, scope) => {
    for (const n of nodes) {
      if (n.t === 'text') out.push(n.v);
      else if (n.t === 'var') { const s = esc(val(n, scope)); out.push(n.br ? s.replace(/\r?\n/g, '<br>') : s); }
      else if (n.t === 'if') walk(cond(n.cond, scope) ? n.then : n.else, scope);
      else if (n.t === 'each') {
        const { v } = lookup(scope, n.key); const f = scope.fields.find((x) => x.k === n.key);
        (Array.isArray(v) ? v : []).forEach((it, i) => walk(n.body, { fields: f.fields, props: it, n: i + 1 }));
      } else if (n.t === 'tag') {
        let attrs = '';
        for (const [an, parts] of n.attrs) {
          if (an === 'open' || (TPL_ATTRS[an] === 'bool')) { attrs += ` ${an}`; continue; }
          let s = '';
          for (const p of parts) s += typeof p === 'string' ? p.replace(/&amp;|&quot;|&#39;|&lt;|&gt;/g, (x) => ({ '&amp;': '&', '&quot;': '"', '&#39;': "'", '&lt;': '<', '&gt;': '>' }[x])) : val(p, scope);
          if (an === 'href') { if (!(s.startsWith('#') || validUrl(s))) continue; }
          if (an === 'src') { const raw = parts[0] && typeof parts[0] !== 'string' && parts[0].v === 'f' ? lookup(scope, parts[0].key).v : ''; s = ctx.mediaUrl && typeof raw === 'string' ? ctx.mediaUrl(raw) : ''; if (!s) continue; }
          attrs += ` ${an}="${esc(s)}"`;
          if (an === 'href' && /^https?:/.test(s)) attrs += ' rel="noopener noreferrer"';
        }
        if (n.name === 'img' && !/ src=/.test(attrs)) continue; // image absente : rien
        out.push(`<${n.name}${attrs}>`);
        if (!VOID.includes(n.name)) { walk(n.kids, scope); out.push(`</${n.name}>`); }
      }
    }
  };
  walk(ast, { fields: ctx.fields, props: ctx.props || {}, n: 1 });
  return out.join('');
}

// ------------------------------------------------------------------ Blocs composés : un assemblage de blocs du site, avec des champs liés
// tree : [{ type, props: { cle: valeur | "$champ" }, cols?: [[noeud…]] }]. Une valeur "$champ" prend la valeur du champ du bloc d'extension.
// Renvoie la liste de vrais blocs du site (identifiants dérivés de `baseId`), prête pour BlocksView ou cleanContent.
export function expandComposed(tree, props, baseId = 'xc') {
  const walk = (list, pre) => (list || []).map((n, i) => {
    const id = `${pre}-${i}`;
    const p = {};
    for (const [k, v] of Object.entries(n.props || {})) {
      if (typeof v === 'string' && /^\$[A-Za-z][A-Za-z0-9_]{0,30}$/.test(v)) { const x = props?.[v.slice(1)]; if (x !== undefined && x !== null && x !== '') p[k] = x; }
      else p[k] = v;
    }
    const b = { id, type: n.type, props: p, show: { devices: ['m', 't', 'd'], audience: 'all' }, style: {} };
    if (Array.isArray(n.cols)) b.cols = n.cols.map((c, ci) => walk(c, `${id}c${ci}`));
    return b;
  });
  return walk(tree, baseId);
}
