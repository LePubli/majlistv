#!/usr/bin/env bash
# Mejliss TV — relevé de la base de données (LECTURE SEULE, ne modifie rien).
# À lancer sur le VPS :   bash db-check.sh        (ou : bash db-check.sh | tee /root/db-check.txt)
# Montre : la taille de la base et des plus grosses tables, les tables souvent lues en entier (index peut-être manquant),
# les index jamais utilisés, les clés étrangères sans index, et les requêtes les plus lentes si pg_stat_statements est actif.
# Audit 11/2026, point P5. Les compteurs partent du dernier démarrage de PostgreSQL : un relevé juste après un
# redémarrage ne dit rien ; attendre quelques jours d'usage réel.
set -u
C="${PG_CONTAINER:-dockpanel-app-postgres-majlisstv}"
q() { docker exec "$C" sh -c 'psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -X -P pager=off -c "$1"' sh "$1" 2>&1; }

echo "== 1. Taille de la base et démarrage des compteurs"
q "SELECT pg_size_pretty(pg_database_size(current_database())) AS base, (SELECT stats_reset FROM pg_stat_database WHERE datname = current_database()) AS compteurs_depuis, pg_postmaster_start_time() AS demarrage;"

echo "== 2. Les 15 plus grosses tables (données + index)"
q "SELECT relname AS table, pg_size_pretty(pg_total_relation_size(relid)) AS taille, n_live_tup AS lignes, n_dead_tup AS lignes_mortes, last_autovacuum::date AS dernier_nettoyage FROM pg_stat_user_tables ORDER BY pg_total_relation_size(relid) DESC LIMIT 15;"

echo "== 3. Tables de plus de 5 000 lignes souvent lues en entier (index peut-être manquant)"
q "SELECT relname AS table, n_live_tup AS lignes, seq_scan AS lectures_completes, seq_tup_read AS lignes_lues, idx_scan AS lectures_par_index FROM pg_stat_user_tables WHERE n_live_tup > 5000 AND seq_scan > 100 AND seq_scan > COALESCE(idx_scan, 0) / 10 ORDER BY seq_tup_read DESC LIMIT 15;"

echo "== 4. Index jamais utilisés de plus de 1 Mo (hors clés primaires et contraintes d'unicité)"
q "SELECT s.relname AS table, s.indexrelname AS index, pg_size_pretty(pg_relation_size(s.indexrelid)) AS taille FROM pg_stat_user_indexes s JOIN pg_index i ON i.indexrelid = s.indexrelid WHERE s.idx_scan = 0 AND NOT i.indisunique AND NOT i.indisprimary AND pg_relation_size(s.indexrelid) > 1048576 ORDER BY pg_relation_size(s.indexrelid) DESC LIMIT 20;"

echo "== 5. Clés étrangères sans index sur des tables de plus de 5 000 lignes"
q "SELECT c.conrelid::regclass AS table, a.attname AS colonne, c.confrelid::regclass AS vers FROM pg_constraint c JOIN pg_attribute a ON a.attrelid = c.conrelid AND a.attnum = c.conkey[1] JOIN pg_stat_user_tables t ON t.relid = c.conrelid WHERE c.contype = 'f' AND array_length(c.conkey, 1) = 1 AND t.n_live_tup > 5000 AND NOT EXISTS (SELECT 1 FROM pg_index i WHERE i.indrelid = c.conrelid AND i.indkey[0] = c.conkey[1]) ORDER BY t.n_live_tup DESC LIMIT 20;"

echo "== 6. Requêtes les plus coûteuses (seulement si pg_stat_statements est actif)"
q "SELECT 1 FROM pg_extension WHERE extname = 'pg_stat_statements';" | grep -q "1 row" \
  && q "SELECT round(total_exec_time::numeric / 1000, 1) AS secondes_au_total, calls AS appels, round(mean_exec_time::numeric, 1) AS ms_en_moyenne, left(regexp_replace(query, '\s+', ' ', 'g'), 110) AS requete FROM pg_stat_statements ORDER BY total_exec_time DESC LIMIT 12;" \
  || echo "  pg_stat_statements n'est pas actif : pas de relevé des requêtes (normal, rien à faire)."

echo "== 7. Connexions"
q "SELECT state, count(*) FROM pg_stat_activity WHERE datname = current_database() GROUP BY state ORDER BY 2 DESC;"
