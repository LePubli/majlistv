// Une conférence est visible du public si elle est publiée, ou programmée et que l'heure de publication est passée.
// Aucun planificateur : la condition est évaluée à chaque requête (et à chaque synchronisation de la recherche).
export const visibleSql = (alias = 't') =>
  `(${alias}.publication = 'published' OR (${alias}.publication = 'scheduled' AND ${alias}.publish_at <= now()))`;
