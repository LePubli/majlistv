// Langues disponibles et sens d'écriture — fichier LÉGER, pour les écrans du navigateur.
// Les textes eux-mêmes (lib/i18n.js, ~580 Ko pour les trois langues) restent sur le serveur : la page reçoit seulement
// les textes de SA langue (app/layout.js → Providers). Importer LOCALES ou DIR depuis lib/i18n.js dans un composant
// « use client » ferait télécharger les trois langues à chaque visiteur (audit 11/2026, point P1) : un test l'interdit.
// Mêmes valeurs que dans lib/i18n.js (test : web/tests/test_locales_web.mjs).
export const LOCALES = { fr: 'Français', en: 'English', ar: 'العربية' };
export const DIR = { fr: 'ltr', en: 'ltr', ar: 'rtl' };
export const getLocale = (value) => (Object.hasOwn(LOCALES, value) ? value : 'fr');
