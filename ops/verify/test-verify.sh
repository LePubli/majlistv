#!/usr/bin/env bash
# Test de verify-deploy.sh SANS VPS : faux docker/curl/nginx (dossier stub/) + la base de test locale (PostgreSQL :5544, API :3055, site :3001).
# Vérifie que le script s'exécute jusqu'au bout, que ses requêtes SQL sont valides et qu'il détecte une migration manquante.
# Les lignes Meilisearch / nginx / apply-limits / sauvegarde sont des ÉCHECS ou ATTENTIONS normaux ici (rien de tel sur la machine de test).
set -u
D=$(cd "$(dirname "$0")" && pwd)
out=$(PATH="$D/stub:$PATH" bash "$D/verify-deploy.sh" --no-public --quick 2>&1 | sed 's/\x1b\[[0-9;]*m//g')
echo "$out" | tail -12
echo "$out" | grep -q "migrations à jour" || { echo "FAIL : migrations non lues"; exit 1; }
echo "$out" | grep -q "table media_imports présente" || { echo "FAIL : media_imports"; exit 1; }
echo "$out" | grep -q "Résumé" || { echo "FAIL : pas de résumé"; exit 1; }
bad=$(EXPECT_MIGRATION=999_future.sql PATH="$D/stub:$PATH" bash "$D/verify-deploy.sh" --no-public --quick 2>&1 | sed 's/\x1b\[[0-9;]*m//g' | grep -c "dernière migration appliquée")
[ "$bad" = 1 ] || { echo "FAIL : migration manquante non détectée"; exit 1; }
echo "TOUT EST OK"
