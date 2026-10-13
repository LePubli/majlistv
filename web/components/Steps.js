'use client';
// Bandeau d'étapes du parcours : 1 compte · 2 formule · 3 profiter. `current` = étape en cours (1 à 3).
export default function Steps({ current, t }) {
  const items = [t('stepAccount'), t('stepPlan'), t('stepEnjoy')];
  return (
    <ol className="steps" aria-label={t('stepsLabel')}>
      {items.map((label, i) => {
        const n = i + 1;
        const state = n < current ? 'done' : n === current ? 'now' : 'todo';
        return (
          <li key={n} className={`step ${state}`} aria-current={state === 'now' ? 'step' : undefined}>
            <span className="step-dot">{state === 'done' ? '✓' : n}</span>
            <span className="step-label">{label}</span>
          </li>
        );
      })}
    </ol>
  );
}
