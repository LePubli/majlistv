-- Étape I2 : textes du site modifiables depuis Admin → Textes.
-- On ne garde ici que les textes CHANGÉS par rapport au texte d'origine (web/lib/i18n.js) : une ligne par (clé, langue).
-- Supprimer la ligne = « rétablir le texte d'origine ». Une clé qui n'existe plus dans le code est simplement ignorée par le site.
CREATE TABLE site_texts (
  key        text NOT NULL CHECK (key ~ '^[A-Za-z0-9_.-]{1,80}$'),
  lang       text NOT NULL CHECK (lang IN ('fr', 'en', 'ar')),
  value      text NOT NULL CHECK (char_length(value) BETWEEN 1 AND 2000),
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid REFERENCES users(id) ON DELETE SET NULL,
  PRIMARY KEY (key, lang)
);
