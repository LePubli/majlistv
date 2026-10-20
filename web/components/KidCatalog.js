'use client';
// Mejliss Kids — catalogue de l'enfant : recherche, rubriques (pastilles), rangées de suggestions, option « seulement pour mon âge ».
// Mots simples, gros boutons ; aucun classement ni comparaison entre enfants.
import { useEffect, useMemo, useRef, useState } from 'react';
import { useApp } from './Providers';
import { KidCard } from './KidsHome';

const name = (r, locale) => r.names?.[locale] || r.names?.fr || r.slug;

export default function KidCatalog() {
  const { t, call, kid, locale } = useApp();
  const [d, setD] = useState(null);
  const [q, setQ] = useState('');
  const [found, setFound] = useState(null);       // résultats de recherche (null = pas de recherche)
  const [rubric, setRubric] = useState(null);     // id de rubrique choisie
  const [mine, setMine] = useState(false);        // seulement pour mon âge
  const seq = useRef(0);
  useEffect(() => { call('/kids/catalog').then((r) => setD(r.ok ? r.data : { rubrics: [], shelves: [], talks: [] })); }, [call]);
  // Recherche : on attend 300 ms après la dernière lettre ; la réponse la plus récente gagne.
  useEffect(() => {
    const s = q.trim();
    if (s.length < 2) { setFound(null); return undefined; }
    const n = ++seq.current;
    const h = setTimeout(() => {
      call(`/kids/search?q=${encodeURIComponent(s)}${rubric ? `&rubric=${rubric}` : ''}`).then((r) => { if (n === seq.current) setFound(r.ok ? r.data.talks : []); });
    }, 300);
    return () => clearTimeout(h);
  }, [q, rubric, call]);
  const byId = useMemo(() => new Map((d?.talks || []).map((x) => [x.id, x])), [d]);
  const ageOk = (x) => !mine || x.kidsBands?.[0] === kid?.band;
  const title = (s) => {
    if (s.kind === 'resume') return t('kdContinue');
    if (s.kind === 'because') return t('kcBecause').replace('{title}', s.basedOn.title);
    if (s.kind === 'age') return t('kcAge');
    if (s.kind === 'new') return t('kcNew');
    if (s.kind === 'popular') return t('kcPopular');
    const r = d.rubrics.find((x) => x.id === s.rubricId); return r ? `${r.emoji} ${name(r, locale)}` : '';
  };
  if (!d) return null;
  const searching = q.trim().length >= 2;
  const chosen = d.rubrics.find((r) => r.id === rubric) || null;
  const grid = (list) => <ul className="kd-grid">{list.map((x) => <KidCard key={x.id} x={x} t={t} />)}</ul>;
  return (
    <section className="kc" aria-label={t('kdMWatch')}>
      <form className="kc-search" role="search" onSubmit={(e) => e.preventDefault()}>
        <label className="sr-only" htmlFor="kc-q">{t('kcSearchLabel')}</label>
        <span aria-hidden="true" className="kc-glass">🔍</span>
        <input id="kc-q" name="q" type="search" autoComplete="off" maxLength={80} value={q} placeholder={t('kcSearchPh')} onChange={(e) => setQ(e.target.value)} />
      </form>
      <div className="kc-chips" role="group" aria-label={t('kcRubrics')}>
        <button type="button" className={!rubric ? 'kc-chip on' : 'kc-chip'} aria-pressed={!rubric} onClick={() => setRubric(null)}>{t('kcAll')}</button>
        {d.rubrics.map((r) => (
          <button key={r.id} type="button" data-rubric={r.slug} className={rubric === r.id ? 'kc-chip on' : 'kc-chip'} aria-pressed={rubric === r.id} onClick={() => setRubric(rubric === r.id ? null : r.id)}>
            <span aria-hidden="true">{r.emoji}</span> {name(r, locale)}
          </button>
        ))}
      </div>
      <label className="kc-age"><input type="checkbox" checked={mine} onChange={(e) => setMine(e.target.checked)} /> <span>{t('kcOnlyMyAge')}</span></label>

      {searching && (
        <div aria-live="polite">
          <h2>{t('kcResults')}</h2>
          {found === null ? <p className="meta">…</p> : found.filter(ageOk).length === 0 ? <p className="soon">{t('kcNothing')}</p> : grid(found.filter(ageOk))}
        </div>
      )}

      {!searching && chosen && (
        <div>
          <h2>{chosen.emoji} {name(chosen, locale)}</h2>
          {(() => { const list = d.talks.filter((x) => x.rubricIds.includes(chosen.id) && ageOk(x)); return list.length ? grid(list) : <p className="soon">{t('kcNothing')}</p>; })()}
        </div>
      )}

      {!searching && !chosen && (
        d.shelves.length === 0 ? <p className="soon">{t('kdEmpty')}</p> : d.shelves.map((s) => {
          const list = s.ids.map((i) => byId.get(i)).filter(Boolean).filter(ageOk);
          if (!list.length) return null;
          return (
            <section key={`${s.kind}-${s.rubricId || ''}`} className="kc-shelf" data-kind={s.kind} aria-label={title(s)}>
              <h2>{title(s)}</h2>
              <ul className="kc-row">{list.map((x) => <KidCard key={x.id} x={x} t={t} />)}</ul>
            </section>
          );
        })
      )}
    </section>
  );
}
