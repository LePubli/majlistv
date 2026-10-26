// État d'une conférence dans le studio, calculé à partir de GET /me/talks.
// 4 étapes : V vidéo, T transcription, S sous-titres traduits, R résumé et chapitres.
// Chaque étape vaut : ok | run | wait | err | none (sans objet).

const SOURCES = { youtube: 'YouTube', vimeo: 'Vimeo', dailymotion: 'Dailymotion', archive: 'archive.org' };
export const sourceLabel = (s) => SOURCES[s] || '';

export function talkSteps(x) {
  const external = x.source !== 'upload';
  const busy = (st) => ['pending', 'processing', 'importing'].includes(st);

  // V : conversion HLS (vidéos envoyées) ; YouTube / Vimeo / archive.org : rien à convertir.
  let video = 'ok';
  let videoPct = null;
  if (!external) {
    // 'importing' : vidéo copiée depuis un autre site (étape Import), pas encore convertie.
    if (x.status === 'failed') video = 'err';
    else if (busy(x.status)) { video = 'run'; videoPct = x.status === 'processing' ? x.progress : null; }
  }

  // T : transcription.
  const ts = x.transcriptStatus;
  let transcript = 'none';
  let transcriptPct = null;
  if (ts === 'ready') transcript = 'ok';
  else if (ts === 'failed') transcript = 'err';
  else if (ts === 'processing') { transcript = 'run'; transcriptPct = x.transcriptProgress; }
  else if (ts === 'pending') transcript = video === 'ok' ? 'run' : 'wait';

  // S : sous-titres traduits (aucune langue demandée : sans objet).
  const tr = x.translations || [];
  let subs = 'none';
  if (tr.length) {
    if (tr.some((t) => t.status === 'failed')) subs = 'err';
    else if (tr.some((t) => busy(t.status))) subs = transcript === 'ok' ? 'run' : 'wait';
    else subs = 'ok';
  }

  // R : résumé et chapitres (après la transcription).
  const ins = x.insights || [];
  let summary = 'none';
  if (ins.some((i) => i.status === 'failed')) summary = 'err';
  else if (ins.some((i) => busy(i.status))) summary = 'run';
  else if (ins.length) summary = 'ok';
  else if (transcript === 'run' || transcript === 'wait' || (transcript === 'ok' && !ins.length)) summary = 'wait';

  return { video, videoPct, transcript, transcriptPct, subs, summary };
}

// Catégorie de la conférence pour les filtres :
//   err (à corriger), run (en traitement), draft (brouillon), sched (programmée, pas encore visible), live (en ligne).
export function talkKind(x, steps = talkSteps(x)) {
  const all = [steps.video, steps.transcript, steps.subs, steps.summary];
  if (all.includes('err')) return 'err';
  // Un brouillon ou une conférence programmée garde son statut même pendant le traitement (la progression reste visible dans les pastilles).
  if (x.publication === 'draft') return 'draft';
  if (x.reviewStatus === 'pending' || x.reviewStatus === 'rejected') return 'review'; // étape 20 : relecture avant mise en ligne
  if (x.publication === 'scheduled' && x.visible === false) return 'sched';
  if (steps.video !== 'ok') return 'run';
  if (all.includes('run')) return 'run';
  return 'live';
}

// Pourcentage global affiché pour une conférence en traitement.
export function talkProgress(steps) {
  if (steps.video === 'run') return steps.videoPct ?? 0;
  if (steps.transcript === 'run') return steps.transcriptPct ?? 0;
  return null;
}

export const isBusy = (x) => talkKind(x) === 'run';
