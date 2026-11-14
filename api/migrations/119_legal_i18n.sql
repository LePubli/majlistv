-- Étape D : pages légales en trois langues, remplies automatiquement avec Admin → Paramètres → Informations légales.
-- custom = false : la page suit le modèle à jour (api/src/legalTemplates.js) ; true : texte saisi à la main dans Admin → Pages légales.
-- Une page déjà modifiée à la main (texte qui ne commence plus par le modèle d'origine) reste telle quelle.
ALTER TABLE legal_pages
  ADD COLUMN title_en text NOT NULL DEFAULT '',
  ADD COLUMN body_en  text NOT NULL DEFAULT '',
  ADD COLUMN title_ar text NOT NULL DEFAULT '',
  ADD COLUMN body_ar  text NOT NULL DEFAULT '',
  ADD COLUMN custom   boolean NOT NULL DEFAULT false;
UPDATE legal_pages SET custom = (body NOT LIKE 'Modèle à compléter%');
