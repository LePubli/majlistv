// Réservation de la vidéo à convertir.
// Étape S3 (Studio → Activité) : on respecte la pause générale et la plage horaire des tâches lourdes (activity_allows),
// les vidéos mises en pause (activity_paused) et la priorité (activity_priority). Si l'API n'a pas encore créé ces
// fonctions (migration 055), on revient à la requête d'origine : la plus ancienne vidéo en attente.
export function makeClaim(pool, log = () => {}) {
  let controls = true;
  return async function claim() {
    const cond = controls ? `AND activity_allows('video') AND NOT activity_paused('video', id::text)` : '';
    const order = controls ? `activity_priority('video', id::text) DESC, created_at` : 'created_at';
    try {
      const { rows } = await pool.query(
        `UPDATE talks SET video_status = 'processing', video_progress = 0, video_error = NULL,
                transcode_attempts = transcode_attempts + 1
         WHERE id = (SELECT id FROM talks WHERE source = 'upload' AND video_status = 'pending' ${cond}
                     ORDER BY ${order} LIMIT 1 FOR UPDATE SKIP LOCKED)
         RETURNING id, video_ref, transcode_attempts`
      );
      return rows[0];
    } catch (err) {
      if (controls && err.code === '42883') { controls = false; log('Pause et priorité indisponibles (migration 055 de l\'API absente) : file simple'); return claim(); }
      throw err;
    }
  };
}
