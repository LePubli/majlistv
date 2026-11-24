// Modèles de sections (étape 3) : des groupes de blocs prêts à poser sur une page, puis à modifier librement.
// Chaque modèle fabrique de NOUVEAUX blocs (identifiants neufs) à chaque utilisation. Aucun contenu inventé sur le site :
// ce sont des textes d'exemple à remplacer, écrits en français seulement.
import { newBlock } from './blocks.js';

const fr = (t) => ({ fr: t });
const mk = (type, props = {}, style = {}) => { const b = newBlock(type); b.props = { ...b.props, ...props }; if (Object.keys(style).length) b.style = style; return b; };
const cols = (count, lists, props = {}, style = {}) => { const c = mk('columns', { count: String(count), ...props }, style); c.cols = lists; return c; };

export const TEMPLATES = [
  {
    id: 'hero-cta', label: 'Bannière d’accueil', hint: 'Grande bannière avec titre, texte et deux boutons.',
    make: () => [mk('hero', { eyebrow: fr('Bienvenue'), title: fr('Un titre qui donne envie'), text: fr('Une ou deux phrases pour présenter ce que l’on trouve ici.'), btn1Label: fr('Découvrir'), btn1Url: '/', btn2Label: fr('En savoir plus'), btn2Url: '/pricing', height: 'l' })],
  },
  {
    id: 'two-cols-text-image', label: 'Deux colonnes : texte et image', hint: 'Un titre et un texte à gauche, une image à droite (à choisir).',
    make: () => [cols(2, [[mk('heading', { title: fr('Un titre de section'), subtitle: fr('Un sous-titre') }), mk('text', { body: fr('Expliquez ici, en quelques lignes, ce que vous proposez.') }), mk('button', { label: fr('En savoir plus'), url: '/' })], [mk('image', { alt: fr('Description de l’image'), size: 'full' })]], { valign: 'center', gap: 'l' })],
  },
  {
    id: 'three-cols', label: 'Trois arguments', hint: 'Trois colonnes de même largeur, chacune avec un titre et un texte.',
    make: () => [mk('heading', { title: fr('Pourquoi nous choisir'), level: 'h2' }), cols(3, [1, 2, 3].map((n) => [mk('heading', { title: fr(`Argument ${n}`), level: 'h3' }), mk('text', { body: fr('Une phrase pour développer cet argument.') })]), { gap: 'm' })],
  },
  {
    id: 'cta-band', label: 'Bandeau d’appel à l’action', hint: 'Une bande colorée avec un titre, une phrase et un bouton, centrés.',
    make: () => [mk('heading', { title: fr('Prêt à commencer ?'), subtitle: fr('Une phrase pour donner envie de cliquer.') }, { bgColor: '@accent', align: 'center', padTop: 36, padBottom: 12, radius: 18 }), mk('button', { label: fr('Commencer'), url: '/register' }, { align: 'center' })],
  },
  {
    id: 'videos-row', label: 'Titre + rangée de vidéos', hint: 'Un titre et les vidéos les plus récentes du catalogue.',
    make: () => [mk('heading', { title: fr('À découvrir'), level: 'h2' }), mk('talks', { title: fr('Nouveautés'), source: 'latest', limit: 4 })],
  },
  {
    id: 'faq', label: 'Questions fréquentes', hint: 'Un titre et une liste de questions qui se déplient.',
    make: () => [mk('faq', { title: fr('Questions fréquentes'), items: [{ q: fr('Une première question ?'), a: fr('Sa réponse.') }, { q: fr('Une deuxième question ?'), a: fr('Sa réponse.') }] })],
  },
  {
    id: 'quote-card', label: 'Citation encadrée', hint: 'Une citation mise en valeur dans une carte avec bordure.',
    make: () => [mk('quote', { text: fr('Une belle phrase à retenir.'), author: fr('Auteur') }, { border: true, shadow: 'soft', radius: 18, padTop: 24, padBottom: 24 })],
  },
];
