'use client';
// Phase 5 (20/11) — filtres du Catalogue : langue, audio, sous-titres, durée, niveau, progression, ressources.
// Chaque choix vit dans l'adresse (/catalogue?lang=fr&duration=short) : on peut copier le lien, revenir en arrière, recharger.
// Les langues proposées viennent de GET /talks/filters (seulement celles qui existent vraiment). « Ma progression » n'est
// proposé qu'aux personnes connectées. Un bouton efface tous les filtres de cette phase (le format, le thème et la recherche restent).
import { useEffect, useMemo, useState } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useApp } from './Providers';
import { LEVELS, levelLabel } from '../lib/levels';

/** Clés d'adresse gérées ici (les mêmes que celles de l'API). */
export const FILTER_KEYS = ['lang', 'audio', 'subs', 'duration', 'level', 'progress', 'resources'];

/** Filtres actifs lus dans l'adresse : { lang: 'fr', … } (valeurs vides ignorées). */
export const filtersFrom = (sp) => Object.fromEntries(FILTER_KEYS.map((k) => [k, (sp.get(k) || '').trim()]).filter(([, v]) => /^[a-z]{1,10}$/.test(v)));

const DURATIONS = [['short', 'fltShort'], ['medium', 'fltMedium'], ['long', 'fltLong']];
const PROGRESS = [['todo', 'fltTodo'], ['started', 'fltStarted'], ['done', 'fltDone']];
const RESOURCES = [['quiz', 'fltResQuiz'], ['book', 'fltResBook'], ['any', 'fltResAny']];

export default function TalkFilters() {
  const { t, call, user, locale } = useApp();
  const sp = useSearchParams();
  const router = useRouter();
  const path = usePathname();
  const [opts, setOpts] = useState({ languages: [], audio: [], subtitles: [] });
  useEffect(() => { call('/talks/filters', {}, null).then((r) => r.ok && r.data && setOpts(r.data)); }, [call]);
  const active = filtersFrom(sp);
  const n = Object.keys(active).length;
  // Le bloc reste ouvert quand la page se reconstruit (ex. « effacer » ramène au Catalogue d'accueil) : mémorisé le temps de la visite.
  const [open, setOpen] = useState(n > 0);
  useEffect(() => { try { if (sessionStorage.getItem('tf-open') === '1') setOpen(true); } catch { /* navigation privée : pas grave */ } }, []);
  const toggle = () => { const v = !open; setOpen(v); try { sessionStorage.setItem('tf-open', v ? '1' : '0'); } catch { /* idem */ } };
  const names = useMemo(() => {
    try { return new Intl.DisplayNames([locale || 'fr'], { type: 'language' }); } catch { return null; }
  }, [locale]);
  const lang = (code) => { try { return names?.of(code) || code; } catch { return code; } };

  const set = (key, value) => {
    const q = new URLSearchParams(sp.toString());
    if (value) q.set(key, value); else q.delete(key);
    const s = q.toString();
    router.replace(s ? `${path}?${s}` : path, { scroll: false });
  };
  const clear = () => {
    const q = new URLSearchParams(sp.toString());
    FILTER_KEYS.forEach((k) => q.delete(k));
    const s = q.toString();
    router.replace(s ? `${path}?${s}` : path, { scroll: false });
  };
  const select = (key, label, items) => (
    <label className="tf-field" key={key}>
      <span>{label}</span>
      <select value={active[key] || ''} onChange={(e) => set(key, e.target.value)}>
        <option value="">{t('fltAny')}</option>
        {items.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
      </select>
    </label>
  );
  return (
    <div className="tf">
      <button type="button" className={n ? 'tf-toggle on' : 'tf-toggle'} aria-expanded={open} onClick={toggle}>
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true"><path d="M4 6h16M7 12h10M10 18h4" /></svg>
        {t('fltTitle')}{n > 0 && <span className="tf-count">{t('fltCount').replace('{n}', n)}</span>}
      </button>
      {open && (
        <div className="tf-panel">
          {opts.languages.length > 0 && select('lang', t('fltLang'), opts.languages.map((c) => [c, lang(c)]))}
          {opts.audio.length > 0 && select('audio', t('fltAudio'), opts.audio.map((c) => [c, lang(c)]))}
          {opts.subtitles.length > 0 && select('subs', t('fltSubs'), opts.subtitles.map((c) => [c, lang(c)]))}
          {select('duration', t('fltDuration'), DURATIONS.map(([v, k]) => [v, t(k)]))}
          {select('level', t('fltLevel'), LEVELS.map((l) => [l, levelLabel(l, t)]))}
          {user && select('progress', t('fltProgress'), PROGRESS.map(([v, k]) => [v, t(k)]))}
          {select('resources', t('fltResources'), RESOURCES.map(([v, k]) => [v, t(k)]))}
          {n > 0 && <button type="button" className="btn ghost tf-reset" onClick={clear}>{t('fltReset')}</button>}
        </div>
      )}
    </div>
  );
}
