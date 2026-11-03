'use client';
// Coran (étapes 45B et 45B2) : une sourate, verset par verset — texte arabe (Hafs), traduction, phonétique, tafsir, récitation (lue chez la source),
// mot à mot (sens de chaque mot au toucher) et couleurs du tajwid. Réglages gardés sur l'appareil.
import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useApp } from '../../../components/Providers';
import { reciterUrl, wordsParam } from '../../../lib/quranAudio';

const KEY = 'qr-prefs';
const load = () => { try { return JSON.parse(localStorage.getItem(KEY) || '{}'); } catch { return {}; } };
const save = (p) => { try { localStorage.setItem(KEY, JSON.stringify(p)); } catch { /* stockage indisponible */ } };

// Tajwid : une couleur par famille de règles (les noms de règles viennent du fichier importé ; une règle inconnue reste affichée avec sa couleur neutre).
const TJ = {
  ghunnah: ['#4ade80', { fr: 'Ghunna', en: 'Ghunna', ar: 'غنة' }],
  idghaam_ghunnah: ['#38bdf8', { fr: 'Idgham', en: 'Idgham', ar: 'إدغام' }], idghaam_wo_ghunnah: ['#38bdf8'], idghaam_mutajaanisayn: ['#38bdf8'], idghaam_mutaqaribayn: ['#38bdf8'], idghaam_shafawi: ['#38bdf8'],
  ikhfa: ['#f472b6', { fr: 'Ikhfa', en: 'Ikhfa', ar: 'إخفاء' }], ikhfa_shafawi: ['#f472b6'],
  iqlab: ['#a78bfa', { fr: 'Iqlab', en: 'Iqlab', ar: 'إقلاب' }],
  qalqalah: ['#fb923c', { fr: 'Qalqala', en: 'Qalqala', ar: 'قلقلة' }],
  madd_2: ['#facc15', { fr: 'Madd', en: 'Madd', ar: 'مد' }], madd_246: ['#facc15'], madd_6: ['#facc15'], madd_munfasil: ['#facc15'], madd_muttasil: ['#facc15'],
  hamzat_wasl: ['#9ca3af', { fr: 'Hamzat al-wasl', en: 'Hamzat al-wasl', ar: 'همزة الوصل' }], lam_shamsiyyah: ['#9ca3af'],
  silent: ['#6b7280', { fr: 'Lettre muette', en: 'Silent letter', ar: 'حرف لا يُنطق' }],
};
const tjColor = (r) => (TJ[r] ? TJ[r][0] : '#d1d5db');
// Découpe un morceau [from, to) du verset (en caractères) en tronçons de même règle.
function paint(cps, marks, from, to) {
  const rule = new Array(cps.length).fill(null);
  for (const [r, a, b] of marks || []) for (let i = a; i < Math.min(b, cps.length); i++) rule[i] = r;
  const out = [];
  for (let i = from; i < to;) {
    let j = i + 1;
    while (j < to && rule[j] === rule[i]) j++;
    const txt = cps.slice(i, j).join('');
    out.push(rule[i] ? <span key={i} style={{ color: tjColor(rule[i]) }} data-rule={rule[i]}>{txt}</span> : txt);
    i = j;
  }
  return out;
}
// Mots du verset : séparés par les espaces ; le mot à mot n'est proposé que si le nombre de mots correspond exactement.
function tokens(cps) {
  const out = []; let st = -1;
  cps.forEach((c, i) => { if (/\s/.test(c)) { if (st >= 0) out.push([st, i]); st = -1; } else if (st < 0) st = i; });
  if (st >= 0) out.push([st, cps.length]);
  return out;
}

export default function SuraPage() {
  const { n } = useParams();
  const num = Number(n);
  const { t, locale, call } = useApp();
  const [d, setD] = useState(null);
  const [missing, setMissing] = useState(false);
  const [prefs, setPrefs] = useState({ translation: undefined, ph: true, tafsir: '', size: 2, reciter: '', chain: true, wbw: false, wbwLang: '', taj: false });
  const [reciters, setReciters] = useState([]);
  const [playing, setPlaying] = useState(null); // numéro du verset en cours de lecture
  const [audioErr, setAudioErr] = useState(false);
  const [sel, setSel] = useState(null); // { aya, i } : mot touché
  const audioRef = useRef(null);
  const [tafsir, setTafsir] = useState(null); // { slug, items: Map }
  const [open, setOpen] = useState({});
  useEffect(() => { setPrefs((p) => ({ ...p, ...load() })); }, []);
  const set = (patch) => setPrefs((p) => { const x = { ...p, ...patch }; save(x); return x; });

  const fetchSura = useCallback(() => {
    const qs = new URLSearchParams({ lang: locale });
    if (prefs.translation) qs.set('translation', prefs.translation);
    if (!prefs.ph) qs.set('translit', 'none');
    // Mot à mot (étape A1 bis) : langue de l'interface en français / anglais ; en arabe, seulement si une langue est choisie.
    const w = wordsParam(locale, prefs);
    if (w) qs.set('words', w);
    if (prefs.taj) qs.set('tajweed', '1');
    return call(`/quran/suras/${num}?${qs}`, {}, null);
  }, [call, num, locale, prefs.translation, prefs.ph, prefs.wbw, prefs.wbwLang, prefs.taj]);
  useEffect(() => { call('/quran/reciters', {}, null).then((r) => { if (r.ok) setReciters(r.data); }); }, [call]);
  const reciter = reciters.find((x) => x.slug === prefs.reciter) || reciters[0] || null;
  // Adresse du verset : {sura3}{aya3}, {sura}/{aya} ou {ayahg} (numéro de 1 à 6236, étape A1).
  const urlOf = useCallback((aya) => reciter && reciterUrl(reciter.urlTemplate, num, aya), [reciter, num]);
  const stop = useCallback(() => { const a = audioRef.current; if (a) { a.pause(); a.removeAttribute('src'); a.load(); } setPlaying(null); }, []);
  const play = useCallback((aya) => {
    const a = audioRef.current; const url = urlOf(aya);
    if (!a || !url) return;
    setAudioErr(false); setPlaying(aya);
    a.src = url;
    a.play().catch(() => { setAudioErr(true); setPlaying(null); });
    document.getElementById(`v${aya}`)?.scrollIntoView({ block: 'center', behavior: 'smooth' });
  }, [urlOf]);
  useEffect(() => () => { const a = audioRef.current; if (a) a.pause(); }, []);
  useEffect(() => { stop(); setSel(null); }, [num, prefs.reciter]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (!(num >= 1 && num <= 114)) { setMissing(true); return undefined; }
    let dead = false;
    fetchSura().then((r) => { if (dead) return; if (r.ok) { setD(r.data); setMissing(false); } else setMissing(true); });
    return () => { dead = true; };
  }, [fetchSura, num]);
  useEffect(() => {
    if (!prefs.tafsir || !d) { setTafsir(null); return undefined; }
    let dead = false;
    call(`/quran/tafsir/${prefs.tafsir}/${num}`, {}, null).then((r) => { if (!dead) setTafsir(r.ok ? { slug: prefs.tafsir, items: new Map(r.data.items.map((i) => [i.aya, i.text])) } : null); });
    return () => { dead = true; };
  }, [prefs.tafsir, num, call, d?.sura?.n]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { // aller au verset demandé (#v5) une fois la sourate affichée
    if (!d || typeof window === 'undefined' || !window.location.hash) return;
    document.getElementById(window.location.hash.slice(1))?.scrollIntoView({ block: 'center' });
  }, [d]);

  if (missing) return <main className="page"><Link href="/coran" className="back">← {t('qrTitle')}</Link><p className="soon">{t('qrNotFound')}</p></main>;
  if (!d) return <main className="page"><p className="meta">…</p></main>;
  const credits = [d.text, d.translation, d.transliteration, ...(tafsir ? d.tafsirs.filter((x) => x.slug === tafsir.slug) : [])].filter(Boolean);
  return (
    <main className="page qr-page">
      <Link href="/coran" className="back">← {t('qrTitle')}</Link>
      <header className="qr-head">
        <p className="meta small">{t('qrSura')} {d.sura.n}</p>
        <h1><span lang="ar" dir="rtl" className="qr-ar">{d.sura.ar}</span> · {d.sura.en}</h1>
      </header>
      <section className="qr-options" aria-label={t('qrOptions')}>
        {d.translations.length > 0 && (
          <label>{t('qrTranslation')}
            <select value={prefs.translation || d.translation?.slug || 'none'} onChange={(e) => set({ translation: e.target.value })}>
              {d.translations.map((x) => <option key={x.slug} value={x.slug}>{x.name} ({x.lang})</option>)}
              <option value="none">{t('qrNone')}</option>
            </select>
          </label>
        )}
        {d.transliterations.length > 0 && <label className="chk"><input type="checkbox" checked={prefs.ph} onChange={(e) => set({ ph: e.target.checked })} /> {t('qrPhonetic')}</label>}
        {d.tafsirs.length > 0 && (
          <label>{t('qrTafsir')}
            <select value={prefs.tafsir} onChange={(e) => { set({ tafsir: e.target.value }); setOpen({}); }}>
              <option value="">{t('qrNone')}</option>
              {d.tafsirs.map((x) => <option key={x.slug} value={x.slug}>{x.name} ({x.lang})</option>)}
            </select>
          </label>
        )}
        {reciters.length > 0 && (
          <label>{t('qrReciter')}
            <select value={reciter?.slug || ''} onChange={(e) => set({ reciter: e.target.value })}>
              {reciters.map((x) => <option key={x.slug} value={x.slug}>{x.name}</option>)}
            </select>
          </label>
        )}
        {reciters.length > 0 && <label className="chk"><input type="checkbox" checked={prefs.chain} onChange={(e) => set({ chain: e.target.checked })} /> {t('qrChain')}</label>}
        {d.wordsMeta && locale !== 'ar' && <label className="chk"><input type="checkbox" checked={prefs.wbw} onChange={(e) => set({ wbw: e.target.checked })} /> {t('qrWbw')}</label>}
        {/* Interface arabe : pas de sens des mots par défaut ; option pour choisir une langue (fr, en…). */}
        {d.wordsList?.length > 0 && locale === 'ar' && (
          <label>{t('qrWbwLang')}
            <select value={prefs.wbwLang || ''} onChange={(e) => set({ wbwLang: e.target.value })}>
              <option value="">{t('qrNone')}</option>
              {[...new Set(d.wordsList.map((x) => x.lang))].map((l) => <option key={l} value={l}>{l === 'fr' ? 'Français' : l === 'en' ? 'English' : l}</option>)}
            </select>
          </label>
        )}
        {d.tajweedMeta && <label className="chk"><input type="checkbox" checked={prefs.taj} onChange={(e) => set({ taj: e.target.checked })} /> {t('qrTajweed')}</label>}
        <label>{t('qrSize')}
          <input type="range" min="1" max="4" value={prefs.size} onChange={(e) => set({ size: Number(e.target.value) })} />
        </label>
      </section>
      {audioErr && <p className="error" role="alert">{t('qrAudioErr')}</p>}
      {prefs.taj && d.tajweed && <TajLegend d={d} locale={locale} t={t} />}
      <audio ref={audioRef} preload="none" onEnded={() => { const next = playing + 1; if (prefs.chain && d.verses.some((x) => x.aya === next)) play(next); else setPlaying(null); }} onError={() => { if (playing) { setAudioErr(true); setPlaying(null); } }} />
      <ol className={`qr-verses qr-size-${prefs.size}`}>
        {d.verses.map((v) => {
          const tf = tafsir?.items.get(v.aya);
          return (
            <li key={v.aya} id={`v${v.aya}`} className={`qr-verse${playing === v.aya ? ' is-playing' : ''}`}>
              <span className="qr-badge" aria-label={`${t('qrVerse')} ${v.aya}`}>{v.aya}</span>
              {reciter && (
                <button type="button" className="qr-play" aria-pressed={playing === v.aya} aria-label={`${playing === v.aya ? t('qrStop') : t('qrListen')} — ${t('qrVerse')} ${v.aya}`} onClick={() => (playing === v.aya ? stop() : play(v.aya))}>{playing === v.aya ? '■' : '▶'}</button>
              )}
              <Arabic v={v} words={d.words?.[v.aya]} marks={prefs.taj ? d.tajweed?.[v.aya] : null} sel={sel?.aya === v.aya ? sel.i : null} onPick={(i) => setSel(sel?.aya === v.aya && sel.i === i ? null : { aya: v.aya, i })} onText={reciter && !d.words?.[v.aya] ? () => (playing === v.aya ? stop() : play(v.aya)) : null} />
              {v.ph && <p className="qr-ph" dir="ltr">{v.ph}</p>}
              {v.tr && <p className="qr-tr" dir={d.translation?.lang === 'ar' ? 'rtl' : 'ltr'}>{v.tr}</p>}
              {v.tn && (
                <details className="qr-notes"><summary>{t('qrNotes')}</summary><p dir={d.translation?.lang === 'ar' ? 'rtl' : 'ltr'}>{v.tn}</p></details>
              )}
              {tf && (
                <>
                  <button type="button" className="link u small" aria-expanded={Boolean(open[v.aya])} onClick={() => setOpen({ ...open, [v.aya]: !open[v.aya] })}>
                    {open[v.aya] ? t('qrHideTafsir') : t('qrShowTafsir')}
                  </button>
                  {open[v.aya] && <p className="qr-tf" dir={d.tafsirs.find((x) => x.slug === tafsir.slug)?.lang === 'ar' ? 'rtl' : 'ltr'}>{tf}</p>}
                </>
              )}
            </li>
          );
        })}
      </ol>
      <nav className="qr-nav" aria-label={t('qrTitle')}>
        {num > 1 ? <Link className="btn ghost" href={`/coran/${num - 1}`}>← {t('qrPrev')}</Link> : <span />}
        {num < 114 ? <Link className="btn ghost" href={`/coran/${num + 1}`}>{t('qrNext')} →</Link> : <span />}
      </nav>
      <footer className="qr-credits meta small">
        <b>{t('qrSources')}</b>
        <ul>{credits.concat(reciter ? [{ slug: 'rc', name: reciter.name, credit: reciter.credit, license: reciter.license, sourceUrl: reciter.sourceUrl }] : [], prefs.wbw && d.wordsMeta ? [d.wordsMeta] : [], prefs.taj && d.tajweedMeta ? [d.tajweedMeta] : []).map((c) => <li key={c.slug}>{c.name}{c.author ? ` — ${c.author}` : ''}{c.credit ? ` · ${c.credit}` : ''}{c.license ? ` · ${c.license}` : ''}{c.sourceUrl ? <> · <a className="link u" href={c.sourceUrl} target="_blank" rel="noopener noreferrer">{t('qrSource')}</a></> : null}</li>)}</ul>
      </footer>
    </main>
  );
}

// Texte arabe d'un verset : simple, coloré (tajwid) et/ou mot à mot (le sens du mot touché s'affiche sous le verset).
function Arabic({ v, words, marks, sel, onPick, onText }) {
  const cps = [...v.ar];
  const toks = words ? tokens(cps) : null;
  const wordMode = toks && toks.length === words.length;
  if (!wordMode) {
    return (
      <p className={`qr-ar${onText ? ' is-click' : ''}`} lang="ar" dir="rtl" onClick={onText || undefined}>{marks ? paint(cps, marks, 0, cps.length) : v.ar}</p>
    );
  }
  return (
    <div className="qr-ar qr-words" lang="ar" dir="rtl">
      {/* Mot sans sens (basmala du verset 1) : affiché sans bouton. */}
      {toks.map(([a, b], i) => (words[i]
        ? <button type="button" key={a} className={`qr-w${sel === i ? ' on' : ''}`} aria-pressed={sel === i} onClick={() => onPick(i)}>{paint(cps, marks, a, b)}</button>
        : <span key={a} className="qr-w">{paint(cps, marks, a, b)}</span>
      ))}
      {sel !== null && words[sel] && <p className="qr-wm" dir="auto" role="status"><span lang="ar" dir="rtl">{cps.slice(...toks[sel]).join('')}</span> — {words[sel]}</p>}
    </div>
  );
}

function TajLegend({ d, locale, t }) {
  const seen = new Map();
  for (const marks of Object.values(d.tajweed || {})) for (const [r] of marks) if (!seen.has(tjColor(r))) seen.set(tjColor(r), r);
  const label = (r) => { const e = TJ[r]?.[1] || Object.values(TJ).find((x) => x[0] === tjColor(r) && x[1])?.[1]; return e ? (e[locale] || e.fr) : r; };
  return (
    <p className="qr-legend" aria-label={t('qrLegend')}>
      {[...seen].map(([c, r]) => <span key={c} className="qr-leg"><i style={{ background: c }} aria-hidden="true" /> {label(r)}</span>)}
    </p>
  );
}
