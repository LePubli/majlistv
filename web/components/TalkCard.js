import Link from 'next/link';

// Vignette d'une conférence (miniature YouTube si disponible).
// progress (0..1) : barre de progression "Continuer à regarder". onRemove : bouton de retrait (bibliothèque).
export default function TalkCard({ talk, t, progress, onRemove, removeLabel }) {
  const thumb = talk.posterUrl || (talk.source === 'youtube' ? `https://i.ytimg.com/vi/${talk.video_ref}/hqdefault.jpg` : null);
  return (
    <div className="talk-wrap">
      <Link href={`/talks/${talk.id}`} className="talk">
        <div className="thumb" style={thumb ? { backgroundImage: `url(${thumb})` } : undefined}>
          <span className={`badge ${talk.access}`}>{t(talk.access)}</span>
          {talk.durationSeconds > 0 && <span className="dur">{Math.max(1, Math.round(talk.durationSeconds / 60))} {t('minutes')}</span>}
          {progress > 0 && <span className="progress"><span style={{ width: `${Math.min(100, Math.round(progress * 100))}%` }} /></span>}
        </div>
        <h3>{talk.title}</h3>
        <p>{talk.speaker}{talk.category ? ` · ${talk.category}` : ''}</p>
      </Link>
      {onRemove && <button type="button" className="card-remove" onClick={onRemove} aria-label={removeLabel} title={removeLabel}>×</button>}
    </div>
  );
}
