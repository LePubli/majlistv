'use client';
// Commandes du lecteur Audyn affichées sur la fiche d'un livre : position, précédent / ±15 s / lecture / suivant, vitesse, minuteur, mode veille.
import { useState } from 'react';
import { useApp } from './Providers';
import { useAudyn } from './AudynPlayer';
import { SLEEP_CHOICES, fmtClock } from '../lib/audyn';

export default function AudynControls() {
  const { t } = useApp();
  const au = useAudyn();
  const [sheet, setSheet] = useState(false);
  const timerText = au.timer.endOfChapter ? t('awSleepLeftEnd') : au.timerLeftMs != null ? t('awSleepLeft').replace('{t}', fmtClock(au.timerLeftMs / 1000)) : '';
  if (!au.book || !au.chapter) return null;
  const kids = Boolean(au.book.kids);
  const canTimer = !kids || au.book.timerAllowed; // espace Kids : minuteur réglable par l'enfant seulement si le parent l'a autorisé
  return (
    <section className="aw-ctl" aria-label={t('awPlayer')}>
      <div className="aw-now"><strong>{au.chapter.title}</strong></div>
      <div className="aw-seek">
        <span>{fmtClock(au.pos)}</span>
        <input type="range" min="0" max={Math.max(1, Math.round(au.dur))} step="1" value={Math.min(Math.round(au.pos), Math.max(1, Math.round(au.dur)))}
          aria-label={t('awProgress')} onChange={(e) => au.seekTo(Number(e.target.value))} />
        <span>{fmtClock(au.dur)}</span>
      </div>
      <div className="aw-row">
        <button type="button" className="aw-btn" aria-label={t('awPrevCh')} onClick={au.prev}>⏮</button>
        <button type="button" className="aw-btn" aria-label={t('awBack15')} onClick={() => au.skip(-15)}>−15</button>
        <button type="button" className="aw-btn gold big" aria-label={au.playing ? t('awPause') : t('awPlay')} onClick={au.toggle} disabled={au.loading}>{au.loading ? '…' : au.playing ? '❚❚' : '▶'}</button>
        <button type="button" className="aw-btn" aria-label={t('awFwd15')} onClick={() => au.skip(15)}>+15</button>
        <button type="button" className="aw-btn" aria-label={t('awNextCh')} onClick={au.next} disabled={au.index >= au.book.chapters.length - 1}>⏭</button>
      </div>
      {au.err && <p className="err" role="alert">{t('awErr')}</p>}
      {au.previewEnded && (kids
        ? <p className="aw-box" role="status">{t('awkPreviewEnded')}</p>
        : <p className="aw-box" role="status">{t('awPreviewEnded')} <a className="btn" href="/pricing">{t('awSubscribe')}</a></p>)}
      <div className="aw-row wrap">
        <button type="button" className="btn ghost" onClick={au.cycleSpeed}>{t('awSpeed').replace('{x}', String(au.speed))}</button>
        {canTimer
          ? <button type="button" className="btn ghost" aria-expanded={sheet} onClick={() => setSheet((v) => !v)}>🌙 {timerText || t('awSleep')}</button>
          : timerText && <span className="meta" role="status">🌙 {timerText}</span>}
        <button type="button" className="btn ghost" onClick={() => au.setDark(true)}>{t('awDark')}</button>
        <button type="button" className="btn ghost" onClick={au.stop}>{t('awStop')}</button>
      </div>
      {sheet && canTimer && (
        <div className="aw-sheet" role="group" aria-label={t('awSleep')}>
          <p className="meta">{t('awSleepHelp')}</p>
          <div className="aw-row wrap">
            {SLEEP_CHOICES.map((m) => (
              <button key={m} type="button" className="btn ghost" onClick={() => { au.setSleep(m); setSheet(false); }}>{m === 0 ? t('awSleepEnd') : t('awSleepMin').replace('{n}', String(m))}</button>
            ))}
            {(au.timer.endAt || au.timer.endOfChapter) && <button type="button" className="btn ghost" onClick={() => { au.setSleep(null); setSheet(false); }}>{t('awSleepOff')}</button>}
          </div>
        </div>
      )}
    </section>
  );
}
