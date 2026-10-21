#!/bin/bash
# /root/apply-limits.sh — limites de ressources des conteneurs Mejliss TV (à relancer après CHAQUE redéploiement DockPanel :
# un redéploiement recrée le conteneur et efface ses limites). Copie versionnée du script du VPS (21/10/2026), plus la règle du doublage.
# Chaque règle : nom partiel du conteneur : processeurs : mémoire. Ce sont des plafonds, pas des réservations.
for rule in "majlistv-transcriber:4:6g" "majlistv-worker:3:3g" "majlistv-api:1:1g" "majlistv-web:1:1g" "majlistv-translator:0.5:256m" "storage:1:1g" "majlistv-search:0.5:768m" "majlistv-dubbing:4:8g"; do
  IFS=: read pat cpu mem <<< "$rule"
  for id in $(docker ps -aq --filter "name=$pat"); do
    docker update --cpus "$cpu" --memory "$mem" --memory-swap "$mem" --restart unless-stopped "$id" >/dev/null && echo "OK $pat ($cpu cpu, $mem, restart auto)"
  done
done
