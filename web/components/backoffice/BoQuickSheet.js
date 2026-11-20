'use client';
// « Fiche rapide du contenu » de la maquette (thème Premium) : volet de droite de Studio → Contenus.
// Tout vient de la ligne de la vidéo (titre, intervenant, langues, durée, état, parcours) ; les liens ne mènent qu'à des écrans qui existent.
import Link from 'next/link';
import { useApp } from '../Providers';
import { STAGES } from '../../lib/production';
import { hasWebModule } from '../../lib/modules';

export default function BoQuickSheet({ row, langs, statusLabel, visLabel, minutes, onClose }) {
  const { t, feat, modUsable } = useApp();
  const on = (id) => hasWebModule(id) && feat(id) && modUsable(id);
  const r = row;
  return (
    <aside className="bo-quick-sheet" aria-label={t('bqTitle')}>
      <div className="bo-qs-head"><h2>{t('bqTitle')}</h2><button type="button" className="bo-qs-x" onClick={onClose} aria-label={t('bqClose')}>×</button></div>
      <div className="bo-qs-poster" style={r.posterUrl ? { backgroundImage: `url(${r.posterUrl})` } : undefined}><b dir="auto">{r.title}</b></div>
      <dl className="bo-qs-dl">
        <div><dt>{t('bqTitleField')}</dt><dd dir="auto">{r.title}</dd></div>
        {r.speaker && <div><dt>{t('bqSpeaker')}</dt><dd dir="auto">{r.speaker}</dd></div>}
        <div><dt>{t('bqLangs')}</dt><dd>{langs}</dd></div>
        {minutes && <div><dt>{t('bqDuration')}</dt><dd>{minutes}</dd></div>}
        <div><dt>{t('bqStatus')}</dt><dd><span className={`pd-label ${r.p.tone}`}>{statusLabel}</span></dd></div>
        <div><dt>{t('bqVis')}</dt><dd>{visLabel}</dd></div>
      </dl>
      <h3>{t('bqSteps')}</h3>
      <ol className="bo-qs-steps">
        {STAGES.map((k) => <li key={k} className={r.p.stages[k]}><i aria-hidden="true" /><span>{t(`pdSt_${k}`)}</span><small>{t(`pdState_${r.p.stages[k]}`)}</small></li>)}
      </ol>
      <h3>{t('bqOptions')}</h3>
      <div className="bo-qs-links">
        <Link href={`/studio/${r.id}`}>{t('manage')}</Link>
        {on('stats') && <Link href={`/studio/stats?talk=${r.id}`}>{t('sdAnalytics')}</Link>}
        {on('dubbing') && <Link href={`/studio/dubbing/${r.id}`}>{t('sdDub')}</Link>}
        {on('editor') && r.source === 'upload' && <Link href={`/studio/editor?talk=${r.id}`}>{t('sdEditInEditor')}</Link>}
      </div>
    </aside>
  );
}
