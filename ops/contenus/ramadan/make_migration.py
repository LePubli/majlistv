#!/usr/bin/env python3
"""Génère api/migrations/089_ramadan_contenus.sql depuis docs/contenus/ramadan-circuit.json (actions NON validées, NON affichées, idempotent).
Usage : python3 make_migration.py docs/contenus/ramadan-circuit.json api/migrations/089_ramadan_contenus.sql"""
import json, sys
SRC, OUT = sys.argv[1:3]
def q(s):
    assert '$q$' not in s
    return '$q$' + s + '$q$'
L = ['-- Contenus 3 : circuit de Ramadan (adultes et enfants). Insérées NON validées et NON affichées : rien n\'apparaît chez les membres',
     '-- avant relecture et validation dans Admin → Circuit de Ramadan. Idempotent : une action déjà présente (même public, jour et titre) est ignorée.',
     '-- Généré par ops/contenus/ramadan/make_migration.py à partir de docs/contenus/ramadan-circuit.json.', '']
data = json.load(open(SRC, encoding='utf-8'))
for x in data:
    t, tx = x['title'], x['text']
    L.append('INSERT INTO ramadan_items(audience, day, title_fr, title_en, title_ar, text_fr, text_en, text_ar, link, reference, position, enabled)\n'
             f"SELECT {q(x['audience'])}, {int(x['day'])}, {q(t['fr'])}, {q(t['en'])}, {q(t['ar'])}, {q(tx['fr'])}, {q(tx['en'])}, {q(tx['ar'])}, {q(x['link'])}, {q(x['reference'])}, {int(x['position'])}, false\n"
             f"WHERE NOT EXISTS (SELECT 1 FROM ramadan_items WHERE audience = {q(x['audience'])} AND day = {int(x['day'])} AND title_fr = {q(t['fr'])});\n")
open(OUT, 'w', encoding='utf-8').write('\n'.join(L))
print(len(data), 'insertions')
