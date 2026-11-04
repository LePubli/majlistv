#!/usr/bin/env python3
"""
Génère api/migrations/088_athkar_contenus.sql à partir des fichiers docs/contenus/athkar-*.json.
La migration insère les dhikr directement en base au démarrage de l'API : NON validés, NON affichés.
Elle est idempotente : un dhikr déjà présent (même catégorie et même texte arabe) n'est pas réinséré.

Usage : python3 make_migration.py <dossier docs/contenus> <fichier .sql de sortie>
"""
import json
import sys

SRC, OUT = sys.argv[1], sys.argv[2]
# Sans 3e argument : migration 088 (contenus 1 et 2). Sinon : liste de fichiers (ex. 093 = athkar-vie-quotidienne.json).
FILES = sys.argv[3:] or ['athkar-matin-soir.json', 'athkar-priere-sommeil-reveil.json']
TITLES = {
    'athkar-vie-quotidienne.json': 'Contenus 3 : dhikr de la vie quotidienne (toilettes, ablutions, maison, mosquée, vêtements, repas, marché, assemblée)',
    'athkar-voyage.json': 'Contenus 5 : dhikr du voyage et des nouvelles (monture, départ, villages, retour, présages)',
    'athkar-epreuves.json': 'Contenus 6 : dhikr des épreuves (tristesse, détresse, peur, dette, doute, maladie, mauvais œil, fin de vie)',
}
TITLE = 'Contenus 1 et 2 : dhikr du matin et du soir, après la prière, du sommeil et du réveil' if not sys.argv[3:] else TITLES.get(FILES[0], 'Contenus : dhikr du recueil')


def q(s):
    assert '$q$' not in s
    return f'$q${s}$q$'


lines = [
    f'-- {TITLE} (__N__ entrées).',
    '-- Insérés NON validés (reviewed_at NULL) et NON affichés (enabled false) : rien n\'apparaît chez les membres avant relecture',
    '-- et validation dans Admin → Athkar. Idempotent : un dhikr déjà présent (même catégorie, même texte arabe) est ignoré.',
    '-- Généré par ops/contenus/athkar/make_migration.py à partir de docs/contenus/athkar-*.json.',
    '',
]
total = 0
for f in FILES:
    for x in json.load(open(f'{SRC}/{f}', encoding='utf-8')):
        total += 1
        lines.append(
            'INSERT INTO athkar_items(category, text_ar, translit, tr_fr, tr_en, reference, target, position, enabled)\n'
            f"SELECT {q(x['category'])}, {q(x['textAr'])}, {q(x['translit'])}, {q(x['trFr'])}, {q(x['trEn'])}, {q(x['reference'])}, {int(x['target'])}, {int(x['position'])}, false\n"
            f"WHERE NOT EXISTS (SELECT 1 FROM athkar_items WHERE category = {q(x['category'])} AND text_ar = {q(x['textAr'])});\n"
        )
open(OUT, 'w', encoding='utf-8').write('\n'.join(lines).replace('__N__', str(total), 1))
print(total, 'insertions')
