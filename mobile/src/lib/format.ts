// Mise en forme des durées. Pur, testable avec Node.

/** 1565 s → « 26:05 » ; 3725 s → « 1:02:05 ». */
export function formatClock(totalSeconds: number): string {
  const s = Math.max(0, Math.floor(Number.isFinite(totalSeconds) ? totalSeconds : 0));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  const mm = h ? String(m).padStart(2, '0') : String(m);
  return (h ? `${h}:` : '') + `${mm}:${String(sec).padStart(2, '0')}`;
}

/** 2520 s → « 42 min » ; 3900 s → « 1 h 05 » ; moins d'une minute → « 1 min ». */
export function formatDuration(totalSeconds: number | null | undefined): string {
  const s = Math.round(Number(totalSeconds) || 0);
  if (s <= 0) return '';
  const min = Math.max(1, Math.round(s / 60));
  if (min < 60) return `${min} min`;
  const h = Math.floor(min / 60);
  const m = min % 60;
  return m ? `${h} h ${String(m).padStart(2, '0')}` : `${h} h`;
}

/** Part déjà regardée, 0 à 100 (0 si la durée est inconnue). */
export function percent(positionMs: number, durationMs: number): number {
  if (!durationMs || durationMs <= 0) return 0;
  return Math.max(0, Math.min(100, Math.round((positionMs / durationMs) * 100)));
}
