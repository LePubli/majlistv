'use client';
// Lot X1 — Rendu d'un bloc d'extension : gabarit HTML restreint (contrôlé à l'installation, valeurs échappées au rendu) ou assemblage de blocs du site.
// Aucun code d'extension ne s'exécute : le gabarit n'a ni script ni style en ligne ni attribut d'événement.
import { useRouter } from 'next/navigation';
import { useApp } from './Providers';
import { EXT_META, validMedia } from '../lib/blocks';
import { compileTemplate, renderTemplate, expandComposed } from '../lib/extTemplate';

const compiled = new WeakMap(); // définition du bloc → gabarit compilé
const astOf = (def) => {
  let c = compiled.get(def);
  if (!c) { c = compileTemplate(def.template, def.fields || []); compiled.set(def, c); }
  return c;
};

export default function ExtBlock({ b, lang, preview, BlocksView }) {
  const { ext } = useApp();
  const router = useRouter();
  const def = EXT_META[b.type];
  if (!def) return null;
  const cls = `x-${def.ext} x-${def.ext}-${def.name}`;
  if (def.kind === 'composed') {
    return <div className={cls}><BlocksView blocks={expandComposed(def.tree, b.props, b.id)} locale={lang} preview={preview} nested /></div>;
  }
  const { ast, errors } = astOf(def);
  if (errors.length) return preview ? <p className="meta small pb-placeholder" role="note">Gabarit de l’extension invalide.</p> : null;
  const html = renderTemplate(ast, {
    props: b.props || {}, fields: def.fields || [], lang,
    texts: ext?.texts?.[def.ext] || {}, settings: ext?.settings?.[def.ext] || {}, features: ext?.features?.[def.ext] || {},
    mediaUrl: (id) => (validMedia(id) ? `/api/pages/media/${id}` : ''),
  });
  // Les liens du site passent par le routeur (pas de rechargement) ; en aperçu de l'éditeur, aucun lien ne part.
  const onClick = (e) => {
    const a = e.target.closest?.('a[href]');
    if (!a) return;
    if (preview) { e.preventDefault(); return; }
    const href = a.getAttribute('href') || '';
    if (href.startsWith('/') && !href.startsWith('//') && !e.metaKey && !e.ctrlKey && !e.shiftKey && e.button === 0) { e.preventDefault(); router.push(href); }
  };
  return <div className={cls} onClick={onClick} dangerouslySetInnerHTML={{ __html: html }} />;
}
