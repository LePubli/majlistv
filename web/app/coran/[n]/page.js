'use client';
// Coran (étape 45B) : une sourate, verset par verset — texte arabe (Hafs), traduction, phonétique, tafsir. Réglages gardés sur l'appareil.
import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useApp } from '../../../components/Providers';

const KEY = 'qr-prefs';
const load = () => { try { return JSON.parse(localStorage.getItem(KEY) || '{}'); } catch { return {}; } };
const save = (p) => { try { localStorage.setItem(KEY, JSON.stringify(p)); } catch { /* stockage indisponible */ } };

export default function SuraPage() {
  const { n } = useParams();
  const num = Number(n);
  const { t, locale, call } = useApp();
  const [d, setD] = useState(null);
  const [missing, setMissing] = useState(false);
  const [prefs, setPrefs] = useState({ translation: undefined, ph: true, tafsir: '', size: 2 });
  const [tafsir, setTafsir] = useState(null); // { slug, items: Map }
  const [open, setOpen] = useState({});
  useEffect(() => { setPrefs((p) => ({ ...p, ...load() })); }, []);
  const set = (patch) => setPrefs((p) => { const x = { ...p, ...patch }; save(x); return x; });

  const fetchSura = useCallback(() => {
    const qs = new URLSearchParams({ lang: locale });
    if (prefs.translation) qs.set('translation', prefs.translation);
    if (!prefs.ph) qs.set('translit', 'none');
    return call(`/quran/suras/${num}?${qs}`, {}, null);
  }, [call, num, locale, prefs.translation, prefs.ph]);
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
        <label>{t('qrSize')}
          <input type="range" min="1" max="4" value={prefs.size} onChange={(e) => set({ size: Number(e.target.value) })} />
        </label>
      </section>
      <ol className={`qr-verses qr-size-${prefs.size}`}>
        {d.verses.map((v) => {
          const tf = tafsir?.items.get(v.aya);
          return (
            <li key={v.aya} id={`v${v.aya}`} className="qr-verse">
              <span className="qr-badge" aria-label={`${t('qrVerse')} ${v.aya}`}>{v.aya}</span>
              <p className="qr-ar" lang="ar" dir="rtl">{v.ar}</p>
              {v.ph && <p className="qr-ph" dir="ltr">{v.ph}</p>}
              {v.tr && <p className="qr-tr" dir={d.translation?.lang === 'ar' ? 'rtl' : 'ltr'}>{v.tr}</p>}
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
        <ul>{credits.map((c) => <li key={c.slug}>{c.name}{c.author ? ` — ${c.author}` : ''}{c.credit ? ` · ${c.credit}` : ''}{c.license ? ` · ${c.license}` : ''}{c.sourceUrl ? <> · <a className="link u" href={c.sourceUrl} target="_blank" rel="noopener noreferrer">{t('qrSource')}</a></> : null}</li>)}</ul>
      </footer>
    </main>
  );
}
