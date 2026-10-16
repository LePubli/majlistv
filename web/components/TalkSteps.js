'use client';
// Pastilles V T S R (vidéo, transcription, sous-titres, résumé) d'une conférence du Studio — voir lib/talkState.js.
import { useApp } from './Providers';

export function Step({ letter, state, label, t }) {
  const mark = { ok: ' ✓', run: ' …', err: ' !', wait: '', none: '' }[state];
  return <span className={`step step-${state}`} title={`${label} : ${t('step_' + state)}`}>{letter}{mark}</span>;
}

export default function TalkSteps({ steps }) {
  const { t } = useApp();
  return (
    <span className="steps" aria-label={t('colSteps')}>
      <Step letter="V" state={steps.video} label={t('stepVideo')} t={t} />
      <Step letter="T" state={steps.transcript} label={t('stepTranscript')} t={t} />
      <Step letter="S" state={steps.subs} label={t('stepSubs')} t={t} />
      <Step letter="R" state={steps.summary} label={t('stepSummary')} t={t} />
    </span>
  );
}
