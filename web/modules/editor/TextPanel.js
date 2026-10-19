'use client';
// Éditeur de montage (étape E5a) — « Texte » : montage par la transcription, dans la colonne de droite (élargie).
//   - Le texte de la conférence, dans l'ordre de la vidéo d'origine ; les mots coupés du montage sont barrés.
//   - Clic sur un mot : la vidéo y va. Glisser, ou Maj + clic : sélection. « Couper la sélection » (ou Suppr) retire le passage
//     de la vidéo ; « Rétablir » le remet. Tout s'annule avec Ctrl+Z, comme les autres gestes.
//   - Langue parlée : mot à mot (place précise si Whisper a horodaté les mots, sinon estimée dans la phrase).
//     Traduction (ex. français d'une conférence en arabe) : phrase par phrase.
//   - Recherche dans le texte (sans accents ni majuscules) : chaque résultat se sélectionne, prêt à couper.
import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useApp } from '../../components/Providers';
import { cutRange, restoreRange, wordSpan, wordKept, srcToT, findWords, fmtTime } from './ops';

// Une phrase : ses unités (mots, ou la phrase entière en mode « phrase »), mémorisée pour que la lecture (T change à chaque image)
// ne redessine que la phrase en cours.
const Sentence = memo(function Sentence({ seg, first, units, kept, selA, selB, cur, hits, rtl, onDown, onEnter }) {
  return (
    <p className="mtw-seg" dir={rtl ? 'rtl' : 'auto'} data-seg={seg.idx}>
      <span className="mtw-time" dir="ltr" aria-hidden="true">{fmtTime(seg.s)}</span>
      {units.map((u, k) => {
        const i = first + k;
        const cls = ['mtw-w'];
        if (!kept[k]) cls.push('cut');
        if (i >= selA && i <= selB) cls.push('sel');
        if (i === cur) cls.push('cur');
        if (hits && hits.has(i)) cls.push('hit');
        return [
          k > 0 ? ' ' : null,
          <span key={i} className={cls.join(' ')} data-i={i} data-cut={kept[k] ? undefined : '1'} onMouseDown={(e) => onDown(e, i)} onMouseEnter={() => onEnter(i)}>
            {u.w}
          </span>,
        ];
      })}
    </p>
  );
}, (a, b) => a.seg === b.seg && a.kept === b.kept && a.rtl === b.rtl && a.onDown === b.onDown && a.onEnter === b.onEnter && a.hits === b.hits
  && inRange(a, b) && a.cur === b.cur);
// Même sélection vue de cette phrase (on ne redessine pas une phrase que la sélection ne touche pas).
function inRange(a, b) {
  const last = a.first + a.units.length - 1;
  const touchA = !(a.selB < a.first || a.selA > last); const touchB = !(b.selB < b.first || b.selA > last);
  if (!touchA && !touchB) return true;
  return a.selA === b.selA && a.selB === b.selB;
}

const RTL = ['ar', 'fa', 'he', 'ur'];

export default function TextPanel({ projectId, clips, commit, canEdit, srcAt, setT, duration, apiRef }) {
  const { t, call } = useApp();
  const [data, setData] = useState(null);
  const [err, setErr] = useState('');
  const [lang, setLang] = useState('');
  const [sel, setSel] = useState(null); // { a, b } indices d'unités (a ≤ b)
  const [msg, setMsg] = useState(null);
  const [query, setQuery] = useState('');
  const [hitN, setHitN] = useState(0);
  const anchor = useRef(null);
  const drag = useRef(false);
  const box = useRef(null);
  const selRef = useRef(null); selRef.current = sel;

  const load = useCallback(async (l) => {
    setErr('');
    const r = await call(`/studio/editor/projects/${projectId}/words${l ? `?lang=${encodeURIComponent(l)}` : ''}`);
    if (!r.ok) { setErr(r.data?.error || t('dbError')); return; }
    setData(r.data); setLang(r.data.lang || ''); setSel(null); setMsg(null);
  }, [call, projectId, t]);
  useEffect(() => { load(''); }, [load]);

  // Étape E5c : « Préciser la place des mots » — demande au serveur, puis suivi (toutes les 4 s) jusqu'à la fin.
  const [align, setAlign] = useState(null);
  const [alignErr, setAlignErr] = useState('');
  const alignStatus = (align || data?.align)?.status;
  const alignNow = align || data?.align || null;
  const busyAlign = alignStatus === 'pending' || alignStatus === 'processing';
  const askAlign = async () => {
    setAlignErr('');
    const r = await call(`/studio/editor/projects/${projectId}/words/align`, { method: 'POST', body: '{}' });
    if (r.ok || r.data?.align) setAlign(r.data.align); else setAlignErr(r.data?.error || t('dbError'));
  };
  useEffect(() => {
    if (!busyAlign) return undefined;
    const h = setTimeout(async () => {
      const r = await call(`/studio/editor/projects/${projectId}/words${lang ? `?lang=${encodeURIComponent(lang)}` : ''}`);
      if (!r.ok) return;
      if (r.data.align?.status === 'done') { setAlign(null); setData(r.data); setLang(r.data.lang || ''); return; }
      setAlign(r.data.align);
      if (r.data.align?.status === 'failed') setData((d) => ({ ...d, align: r.data.align }));
    }, 4000);
    return () => clearTimeout(h);
  }, [busyAlign, align, call, projectId, lang]);

  // Langue parlée : mot à mot. Traduction : phrase par phrase.
  const spoken = Boolean(data?.lang && data?.origin && (data.lang === data.origin || String(data.origin).startsWith(data.lang)));
  const wordMode = spoken || (data?.langs?.length === 1);
  const rtl = RTL.includes(String(data?.lang || '').slice(0, 2));

  // Unités à plat (ordre source) + première unité de chaque phrase.
  const { units, firsts, words, wordUnit } = useMemo(() => {
    const segs = data?.segments || [];
    const u = []; const f = []; const w = []; const wu = [];
    segs.forEach((seg, si) => {
      f.push(u.length);
      if (wordMode) seg.words.forEach((x) => { wu.push(u.length); w.push(x); u.push({ ...x, si }); });
      else { seg.words.forEach((x) => { wu.push(u.length); w.push(x); }); u.push({ s: seg.s, e: seg.e, w: seg.text, si }); }
    });
    return { units: u, firsts: f, words: w, wordUnit: wu };
  }, [data, wordMode]);

  // Gardé / coupé : recalculé seulement quand le montage change.
  const keptAll = useMemo(() => units.map((u) => wordKept(clips, u)), [units, clips]);
  const keptBySeg = useMemo(() => (data?.segments || []).map((_, si) => {
    const a = firsts[si]; const b = si + 1 < firsts.length ? firsts[si + 1] : units.length;
    return keptAll.slice(a, b);
  }), [data, firsts, units.length, keptAll]);
  // Mémoïsation stable : une phrase dont l'état n'a pas changé garde le même tableau.
  const keptRef = useRef([]);
  const keptStable = keptBySeg.map((k, si) => {
    const old = keptRef.current[si];
    return old && old.length === k.length && old.every((x, i) => x === k[i]) ? old : k;
  });
  keptRef.current = keptStable;
  const cutCount = keptAll.filter((k) => !k).length;

  // Unité en cours de lecture (recherche dichotomique dans l'ordre source).
  const cur = useMemo(() => {
    if (srcAt == null || !units.length) return -1;
    let lo = 0; let hi = units.length - 1; let ans = -1;
    while (lo <= hi) { const m = (lo + hi) >> 1; if (units[m].s <= srcAt + 1e-6) { ans = m; lo = m + 1; } else hi = m - 1; }
    return ans >= 0 && srcAt < units[ans].e + 0.05 ? ans : -1;
  }, [srcAt, units]);
  // La lecture fait défiler le texte (sauf pendant une sélection à la souris).
  useEffect(() => {
    if (cur < 0 || drag.current || !box.current) return;
    const el = box.current.querySelector(`[data-i="${cur}"]`);
    if (!el) return;
    const b = box.current.getBoundingClientRect(); const r = el.getBoundingClientRect();
    if (r.top < b.top || r.bottom > b.bottom) box.current.scrollTop += r.top - b.top - b.height / 3;
  }, [cur]);

  // Recherche.
  const hitsList = useMemo(() => {
    if (!query.trim()) return [];
    return findWords(words, query).map((h) => ({ a: wordUnit[h.i], b: wordUnit[h.j] }))
      .filter((h, i, all) => !i || h.a !== all[i - 1].a);
  }, [query, words, wordUnit]);
  const hitSet = useMemo(() => { const s = new Set(); for (const h of hitsList) for (let i = h.a; i <= h.b; i += 1) s.add(i); return s.size ? s : null; }, [hitsList]);
  const goHit = (n) => {
    if (!hitsList.length) return;
    const k = ((n % hitsList.length) + hitsList.length) % hitsList.length;
    setHitN(k); const h = hitsList[k]; setSel({ a: h.a, b: h.b }); anchor.current = h.a;
    const at = srcToT(clips, units[h.a].s); if (at != null) setT(at);
    const el = box.current?.querySelector(`[data-i="${h.a}"]`);
    if (el && box.current) { const b = box.current.getBoundingClientRect(); const r = el.getBoundingClientRect(); box.current.scrollTop += r.top - b.top - b.height / 3; }
  };
  useEffect(() => { setHitN(0); }, [query]);

  // Souris : appui = début de sélection (Maj = prolonger), survol en glissant = étendre, relâché = fin.
  const onDown = useCallback((e, i) => {
    if (e.button !== 0) return;
    e.preventDefault(); // pas de sélection de texte du navigateur
    // La recherche garde sinon le clavier : Suppr effacerait une lettre au lieu de couper.
    if (document.activeElement?.matches?.('input, textarea, select')) document.activeElement.blur();
    if (e.shiftKey && anchor.current != null) { const a = anchor.current; setSel({ a: Math.min(a, i), b: Math.max(a, i) }); return; }
    anchor.current = i; drag.current = true; setSel({ a: i, b: i }); setMsg(null);
  }, []);
  const onEnter = useCallback((i) => { if (drag.current && anchor.current != null) { const a = anchor.current; setSel({ a: Math.min(a, i), b: Math.max(a, i) }); } }, []);
  useEffect(() => {
    const up = () => {
      if (!drag.current) return;
      drag.current = false;
      // Un simple clic : la vidéo va à ce mot (s'il est encore dans le montage).
      const s = selRef.current;
      if (s && s.a === s.b && anchor.current === s.a) { const at = srcToT(clips, units[s.a]?.s ?? 0); if (at != null) setT(at); }
    };
    window.addEventListener('mouseup', up);
    return () => window.removeEventListener('mouseup', up);
  }, [clips, units, setT]);

  const span = sel ? wordSpan(units, sel.a, sel.b) : null;
  const selKept = sel ? keptAll.slice(sel.a, sel.b + 1) : [];
  const canCut = canEdit && selKept.some(Boolean);
  const canRestore = canEdit && selKept.some((k) => !k);

  const doCut = useCallback(() => {
    if (!span || !canCut) return false;
    const r = cutRange(clips, span.s, span.e);
    if (!r.done) { setMsg({ kind: 'info', text: r.reason === 'all' ? t('mtwAll') : t('mtwNothing') }); return true; }
    commit(r.clips); setMsg({ kind: 'ok', text: t('mtwCutDone').replace('{d}', fmtTime(r.removed, { tenths: true })) });
    return true;
  }, [span, canCut, clips, commit, t]);
  const doRestore = useCallback(() => {
    if (!span || !canRestore) return false;
    const r = restoreRange(clips, span.s, span.e, duration || Infinity);
    if (r.done) { commit(r.clips); setMsg({ kind: 'ok', text: t('mtwRestored') }); }
    return true;
  }, [span, canRestore, clips, commit, duration, t]);
  // L'éditeur passe la touche Suppr au texte quand une sélection y existe.
  useEffect(() => {
    if (!apiRef) return undefined;
    apiRef.current = { hasSel: Boolean(sel), cut: doCut, clear: () => { setSel(null); anchor.current = null; } };
    return () => { apiRef.current = null; };
  }, [apiRef, sel, doCut]);

  if (err) return <div className="mt-panel"><h3 id="mt-sel-title">{t('mtwTitle')}</h3><p className="error" role="alert">{err}</p></div>;
  if (!data) return <div className="mt-panel"><h3 id="mt-sel-title">{t('mtwTitle')}</h3><p className="meta">{t('mtwLoading')}</p></div>;

  const precision = !wordMode ? t('mtwSentenceMode')
    : data.precise === data.total ? t('mtwPrecise')
      : data.precise === 0 ? t('mtwEstimated') : t('mtwPartial').replace('{n}', data.precise).replace('{c}', data.total);
  const selText = sel ? (wordMode ? t('mtwSel') : t('mtwSelS')).replace('{n}', sel.b - sel.a + 1).replace('{d}', fmtTime(span ? span.e - span.s : 0, { tenths: true })) : '';

  return (
    <div className="mt-panel mtw">
      <h3 id="mt-sel-title">{t('mtwTitle')}</h3>
      {!data.segments.length ? <p className="mt-hint">{t('mtwEmpty')}</p> : (
        <>
          <div className="mtw-bar">
            {data.langs.length > 1 && (
              <label className="mtw-lang">
                <span className="sr-only">{t('mtwLang')}</span>
                <select value={lang} onChange={(e) => load(e.target.value)} aria-label={t('mtwLang')}>
                  {data.langs.map((l) => <option key={l} value={l}>{l === data.origin || String(data.origin || '').startsWith(l) ? t('mtwSpoken').replace('{l}', l.toUpperCase()) : l.toUpperCase()}</option>)}
                </select>
              </label>
            )}
            <input type="search" className="mtw-search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder={t('mtwSearch')} aria-label={t('mtwSearch')}
              onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); goHit(e.shiftKey ? hitN - 1 : (sel && hitsList[hitN]?.a === sel.a ? hitN + 1 : hitN)); } }} />
            {query.trim() && (
              <span className="mtw-hits meta small" role="status">
                {hitsList.length ? t('mtwHits').replace('{n}', hitN + 1).replace('{c}', hitsList.length) : t('mtwNoHit')}
                {hitsList.length > 1 && <>
                  <button type="button" className="mtw-arrow" onClick={() => goHit(hitN - 1)} aria-label={t('mtwPrev')}>‹</button>
                  <button type="button" className="mtw-arrow" onClick={() => goHit(hitN + 1)} aria-label={t('mtwNext')}>›</button>
                </>}
              </span>
            )}
          </div>
          <div className="mt-actions mtw-actions">
            <button type="button" className="btn sd-pill" onClick={doCut} disabled={!canCut} data-act="text-cut" title={t('mtDeleteKey')}>{t('mtwCut')}</button>
            <button type="button" className="btn ghost sd-pill" onClick={doRestore} disabled={!canRestore} data-act="text-restore">{t('mtwRestore')}</button>
          </div>
          {/* Ligne d'état toujours présente (hauteur fixe) : le texte ne bouge pas sous la souris pendant une sélection. */}
          <p className={`mtw-status${msg ? ` mtw-msg ${msg.kind}` : ''}`} role="status" title={msg ? msg.text : selText}>{msg ? msg.text : sel ? <span className="mtw-selinfo">{selText}</span> : '\u00a0'}</p>
          <div className="mtw-text" ref={box} lang={data.lang || undefined} aria-label={t('mtwTitle')}>
            {data.segments.map((seg, si) => (
              <Sentence key={seg.idx} seg={seg} first={firsts[si]} units={units.slice(firsts[si], si + 1 < firsts.length ? firsts[si + 1] : units.length)}
                kept={keptStable[si]} selA={sel ? sel.a : -1} selB={sel ? sel.b : -2}
                cur={cur >= firsts[si] && (si + 1 >= firsts.length || cur < firsts[si + 1]) ? cur : -1}
                hits={hitSet} rtl={rtl} onDown={onDown} onEnter={onEnter} />
            ))}
          </div>
          {wordMode && data.alignable && (data.precise < data.total || alignNow) && (
            <div className="mtw-align" data-align={alignStatus || 'none'}>
              <button type="button" className="btn ghost sd-pill" onClick={askAlign} disabled={!canEdit || busyAlign} data-act="text-align" title={t('mtwAlignHelp')}>{t('mtwAlign')}</button>
              <small className="meta" role="status">
                {alignErr || (alignStatus === 'pending' ? t('mtwAlignPending')
                  : alignStatus === 'processing' ? t('mtwAlignRunning').replace('{n}', alignNow.progress || 0)
                    : alignStatus === 'failed' ? t('mtwAlignFailed').replace('{e}', alignNow.error || '')
                      : alignStatus === 'done' ? t('mtwAlignDone').replace('{n}', alignNow.aligned ?? 0).replace('{c}', alignNow.total ?? 0)
                        : t('mtwAlignHelp'))}
              </small>
            </div>
          )}
          <p className="meta small mtw-foot">{t('mtwStats').replace('{n}', cutCount).replace('{c}', units.length)} · {precision}</p>
          <p className="mt-hint">{canEdit ? t('mtwHelp') : t('mtwReadOnly')}</p>
        </>
      )}
    </div>
  );
}
