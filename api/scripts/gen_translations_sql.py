#!/usr/bin/env python3
"""Génère api/content/catalogue-translations.json et api/migrations/123_catalogue_translations.sql à partir de catalogue_translations_data.py.
Usage : python3 api/scripts/gen_translations_sql.py"""
import json, os, sys
here = os.path.dirname(os.path.abspath(__file__)); root = os.path.join(here, '..')
sys.path.insert(0, here)
from catalogue_translations_data import T
tax = json.load(open(os.path.join(root, 'content/catalogue-taxonomy.json'), encoding='utf-8'))['categories']
slugs = [c['slug'] for c in tax] + [s['slug'] for c in tax for s in c['subcategories']]
assert set(slugs) == set(T), 'les slugs de la taxonomie et des traductions diffèrent'
json.dump({s: {'en': T[s][0], 'ar': T[s][1]} for s in slugs}, open(os.path.join(root, 'content/catalogue-translations.json'), 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
q = lambda s: "'" + s.replace("'", "''") + "'"
rows = ',\n'.join(f"  ({q(s)}, {q(T[s][0])}, {q(T[s][1])})" for s in slugs)
sql = f"""-- Catalogue : noms anglais et arabes des catégories (21/11/2026). Source : api/content/catalogue-translations.json (propositions IA, à valider).
-- Remplit categories.translations ({{"en":{{"name"}},"ar":{{"name"}}}}) sans JAMAIS écraser ce qui a déjà été saisi (Admin → Catégories) :
-- les valeurs existantes l'emportent. Ne touche ni au nom français ni aux descriptions. Rejouable.
-- Ne pas modifier à la main : python3 api/scripts/gen_translations_sql.py
UPDATE categories c SET translations = (COALESCE(c.translations, '{{}}'::jsonb) - 'en' - 'ar') || jsonb_build_object(
    'en', jsonb_build_object('name', v.en) || COALESCE(c.translations->'en', '{{}}'::jsonb),
    'ar', jsonb_build_object('name', v.ar) || COALESCE(c.translations->'ar', '{{}}'::jsonb)
  )
FROM (VALUES
{rows}
) AS v(slug, en, ar)
WHERE c.slug = v.slug;
"""
open(os.path.join(root, 'migrations/123_catalogue_translations.sql'), 'w', encoding='utf-8').write(sql)
print('ok', len(slugs))
