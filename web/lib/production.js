// Étape S3 — parcours de production d'une conférence (Studio → Contenus, maquette « Studio v2 », écran 2) :
//   Importée › Transcrite › Traduite › Relue › Montée › Doublée › Publiée
// Chaque étape vaut : ok | run | todo | err | na (sans objet : conférence en français, éditeur pas encore livré, module absent).
// x = ligne de GET /me/talks enrichie (steps, kind de lib/talkState.js) ; p = état venu de GET /studio/production ({ views, dub, editor }).
export const STAGES = ['imported', 'transcribed', 'translated', 'reviewed', 'edited', 'dubbed', 'published'];

const isFr = (l) => String(l || '').toLowerCase().startsWith('fr');

export function production(x, p = {}) {
  const dub = p.dub || null;
  const lang = x.transcriptLanguage || x.language;
  const french = isFr(lang);
  const st = {};
  st.imported = x.steps.video === 'err' ? 'err' : x.steps.video === 'run' ? 'run' : 'ok';
  st.transcribed = { ok: 'ok', run: 'run', wait: 'todo', err: 'err', none: 'todo' }[x.steps.transcript] || 'todo';
  if (french) st.translated = 'na';
  else {
    const fr = (x.translations || []).find((t) => t.lang === 'fr');
    st.translated = dub?.hasFrench || fr?.status === 'ready' ? 'ok' : fr?.status === 'failed' ? 'err' : fr ? 'run' : 'todo';
  }
  st.reviewed = french || !dub ? 'na' : dub.review === 'validated' ? 'ok' : 'todo';
  // Éditeur de montage : « en cours » dès qu'un montage existe (E1) ; « fait » quand la vidéo publiée a été remplacée par le montage (E4b).
  st.edited = p.editor?.replaced ? 'ok' : p.editor?.project ? 'run' : 'na';
  const fullJob = dub?.job && dub.job.kind === 'full' ? dub.job : null;
  st.dubbed = french || !dub ? 'na' : dub.track ? 'ok' : fullJob ? 'run' : 'todo';
  st.published = x.kind === 'live' ? 'ok' : 'todo';

  // Étiquette : ce qui se passe maintenant, sinon où en est la conférence.
  let label; let tone = 'run'; let pct = null;
  const errAt = STAGES.find((k) => st[k] === 'err');
  if (errAt) { label = `err_${errAt}`; tone = 'err'; }
  else if (fullJob) { label = fullJob.status === 'running' ? 'dubbing' : 'dubbingWait'; pct = fullJob.status === 'running' ? fullJob.progress : null; }
  else if (st.imported === 'run') { label = 'converting'; pct = x.steps.videoPct; }
  else if (st.transcribed === 'run') { label = 'transcribing'; pct = x.steps.transcriptPct; }
  else if (st.translated === 'run') label = 'translating';
  else if (dub && !french && dub.hasFrench && dub.review !== 'validated' && !dub.track) label = 'toReview';
  else if (st.dubbed === 'ok') { label = 'dubbed'; tone = 'ok'; }
  else if (st.published === 'ok') { label = 'published'; tone = 'ok'; }
  else if (x.kind === 'sched') { label = 'scheduled'; tone = 'muted'; }
  else { label = 'draft'; tone = 'muted'; }

  return {
    stages: st, label, tone, pct, views: p.views ?? null, french, lang,
    toDub: Boolean(dub && !french && dub.hasFrench && !dub.track),
    toReview: Boolean(dub && !french && dub.hasFrench && dub.review !== 'validated' && !dub.track),
  };
}
