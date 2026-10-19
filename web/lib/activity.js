// Étape S3 — libellés des tâches de Studio → Activité (aussi utilisés par le tableau de bord).
// Une tâche : { queue: video | transcript | translation | dubbing | archive | editor, kind?, lang?, status, progress, blockedBy? }
export function taskName(x, t) {
  if (x.queue === 'dubbing') return t(x.kind === 'preview' ? 'tqPreview' : 'tqDubbing');
  if (x.queue === 'archive') return t(x.kind === 'restore' ? 'tqRestore' : 'tqArchive');
  if (x.queue === 'replace') return t(x.kind === 'restore' ? 'tqRestoreVideo' : 'tqReplace'); // étape E4b : nouvelle version de la vidéo
  if (x.queue === 'render') return t(x.kind === 'preview' ? 'tqRenderPreview' : 'tqRenderFinal'); // étape E4a : rendus du montage
  if (x.queue === 'editor') return t(x.kind === 'music' ? 'tqWaveMusic' : x.kind === 'dub' ? 'tqWaveDub' : 'tqWaveOrig'); // étape E2 : analyses du son
  if (x.queue === 'translation') return `${t('tqTranslation')}${x.lang ? ` (${String(x.lang).toUpperCase()})` : ''}`;
  return t(x.queue === 'video' ? 'tqVideo' : 'tqTranscript');
}

// « Doublage 64 % », « En attente », « En pause »…
export function taskLabel(x, t) {
  if (x.status === 'running') return x.progress != null ? `${taskName(x, t)} ${x.progress} %` : `${taskName(x, t)} · ${t('taskRunning')}`;
  if (x.status === 'paused') return `${taskName(x, t)} · ${t('taskPaused')}`;
  if (x.status === 'blocked') return `${taskName(x, t)} · ${t(`taskBlocked_${x.blockedBy || 'other'}`)}`;
  if (x.status === 'failed') return `${taskName(x, t)} · ${t('taskFailed')}`;
  return `${taskName(x, t)} · ${t('taskWaiting')}`;
}
