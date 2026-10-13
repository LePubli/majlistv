import Link from 'next/link';
import { levelLabel } from '../lib/levels';

// Texte avec passages surlignés : l'API encadre les mots trouvés par deux marqueurs (pas de HTML injecté).
export function Marked({ text, markers = ['⟦', '⟧'] }) {
  const [a, b] = markers;
  const parts = [];
  let rest = text;
  let k = 0;
  while (rest) {
    const i = rest.indexOf(a);
    if (i < 0) { parts.push(rest); break; }
    const j = rest.indexOf(b, i + a.length);
    if (j < 0) { parts.push(rest.replaceAll(a, '')); break; }
    if (i > 0) parts.push(rest.slice(0, i));
    parts.push(<mark key={k++}>{rest.slice(i + a.length, j)}</mark>);
    rest = rest.slice(j + b.length);
  }
  return <>{parts}</>;
}

const clock = (ms) => {
  const s = Math.floor(ms / 1000);
  const h = Math.floor(s / 3600);
  const mm = String(Math.floor((s % 3600) / 60)).padStart(h ? 2 : 1, '0');
  return `${h ? h + ':' : ''}${mm}:${String(s % 60).padStart(2, '0')}`;
};

// Résultat de recherche : vignette, titre, extrait surligné et passages horodatés cliquables.
export default function SearchHit({ hit, t, markers }) {
  const thumb = hit.posterUrl || (hit.source === 'youtube' ? `https://i.ytimg.com/vi/${hit.video_ref}/hqdefault.jpg` : null);
  return (
    <article className="hit">
      <Link href={`/talks/${hit.id}`} className="hit-thumb" style={thumb ? { backgroundImage: `url(${thumb})` } : undefined} aria-label={hit.title}>
        <span className={`badge ${hit.access}`}>{t(hit.access)}</span>
      </Link>
      <div className="hit-body">
        {hit.series && (
          <p className="hit-series">
            <Link href={`/series/${hit.series.id}`}>{hit.series.title}</Link>
            {` · ${[hit.series.seasonNumber ? t('seasonN').replace('{n}', hit.series.seasonNumber) : '', t('epN').replace('{n}', hit.series.number)].filter(Boolean).join(' · ')}`}
          </p>
        )}
        <h3><Link href={`/talks/${hit.id}`}>{hit.title}</Link></h3>
        <p className="meta">{hit.level && <span className={`lvl ${hit.level}`}>{levelLabel(hit.level, t)}</span>}{hit.speaker}{hit.category ? ` · ${hit.category}` : ''}{hit.durationSeconds ? ` · ${Math.max(1, Math.round(hit.durationSeconds / 60))} ${t('minutes')}` : ''}</p>
        {hit.snippet && <p className="hit-snippet"><Marked text={hit.snippet} markers={markers} /></p>}
        {hit.moments.length > 0 && (
          <ul className="moments">
            {hit.moments.map((m) => (
              <li key={m.ms}>
                <Link href={`/talks/${hit.id}?t=${Math.floor(m.ms / 1000)}`}><span className="ts">▶ {clock(m.ms)}</span> {m.text}</Link>
              </li>
            ))}
          </ul>
        )}
      </div>
    </article>
  );
}
