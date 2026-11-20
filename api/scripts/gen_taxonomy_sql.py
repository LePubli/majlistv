#!/usr/bin/env python3
"""Génère api/migrations/121_catalogue_taxonomy.sql à partir de api/content/catalogue-taxonomy.json (source de vérité de la taxonomie).
Usage : python3 api/scripts/gen_taxonomy_sql.py"""
import json, os
root = os.path.join(os.path.dirname(__file__), '..')
data = json.load(open(os.path.join(root, 'content/catalogue-taxonomy.json'), encoding='utf-8'))['categories']
q = lambda s: "'" + s.replace("'", "''") + "'" if s is not None else 'NULL'
top, sub = [], []
n = {'adult': 0, 'kids': 0}
for c in data:
    n[c['catalogueType']] += 1; i = n[c['catalogueType']]
    top.append(f"  ({q(c['slug'])}, {q(c['name'])}, {q(c['catalogueType'])}, {i * 10}, {q(c['icon'])}, {q(c['color'])})")
    for j, s in enumerate(c['subcategories'], 1):
        sub.append(f"  ({q(s['slug'])}, {q(s['name'])}, {q(c['slug'])}, {q(c['catalogueType'])}, {j * 10})")
tpl = open(os.path.join(os.path.dirname(__file__), 'taxonomy_migration.tpl.sql'), encoding='utf-8').read()
out = tpl.replace('/*TOP*/', ',\n'.join(top)).replace('/*SUB*/', ',\n'.join(sub))
open(os.path.join(root, 'migrations/121_catalogue_taxonomy.sql'), 'w', encoding='utf-8').write(out)
print('ok', len(top), len(sub))
