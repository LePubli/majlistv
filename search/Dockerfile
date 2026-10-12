# Moteur de recherche Meilisearch pour Majlis TV. Contexte de build = racine du dépôt.
# Index des conférences (titres, intervenants, descriptions, transcriptions et traductions), alimenté par l'API.
FROM getmeili/meilisearch:v1.55.0
# Production : clé maître obligatoire (variable MEILI_MASTER_KEY dans DockPanel, 32 caractères ou plus).
ENV MEILI_ENV=production \
    MEILI_NO_ANALYTICS=true \
    MEILI_DB_PATH=/meili_data/data.ms \
    MEILI_DUMP_DIR=/meili_data/dumps \
    MEILI_HTTP_ADDR=0.0.0.0:7700 \
    MEILI_MAX_INDEXING_MEMORY=300Mb \
    MEILI_MAX_INDEXING_THREADS=1
EXPOSE 7700
