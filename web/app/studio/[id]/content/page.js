'use client';
// Studio → corriger la transcription (texte des segments, toutes langues) et le résumé / points clés / chapitres.
// Les corrections de la langue d'origine peuvent relancer la traduction des sous-titres et du résumé (cases à cocher).
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { useParams, useSearchParams, useRouter } from 'next/navigation';
import { useApp } from '../../../../components/Providers';
import { langName } from '../../../../components/Transcript';
import QuizEditor from '../../../../components/QuizEditor';
import PracticeEditor from '../../../../components/PracticeEditor';
import ThemesPicker from '../../../../components/ThemesPicker';
import RemindersEditor from '../../../../components/RemindersEditor';

const PAGE = 100;
const clock = (ms) => {
  const s = Math.floor(ms / 1000); const h = Math.floor(s / 3600); const m = Math.floor((s % 3600) / 60);
  const p = (n) => String(n).padStart(2, '0');
  return h ? `${h}:${p(m)}:${p(s % 60)}` : `${m}:${p(s % 60)}`;
};
// « 12:30 » ou « 1:02:30 » -> millisecondes (null si invalide).
const parseClock = (v) => {
  const m = String(v).trim().match(/^(?:(\d{1,2}):)?(\d{1,3}):(\d{2})$/);
  if (!m || Number(m[3]) > 59) return null;
  return ((Number(m[1] || 0) * 3600) + Number(m[2]) * 60 + Number(m[3])) * 1000;
};

/* ------------------------------------------------------------------ Transcription */
function TranscriptEditor({ id, t, call, locale, onDirty }) {
  const [data, setData] = useState(null); // { lang, sourceLang, languages, segments }
  const [state, setState] = useState('loading'); // loading | ready | notReady
  const [edits, setEdits] = useState({}); // idx -> texte modifié
  const [q, setQ] = useState('');
  const [find, setFind] = useState('');
  const [repl, setRepl] = useState('');
  const [page, setPage] = useState(0);
  const [retranslate, setRetranslate] = useState(true);
  const [regen, setRegen] = useState(true);
  const [nTr, setNTr] = useState(0);
  const [msg, setMsg] = useState(null);
  const [saving, setSaving] = useState(false);

  // Télécharge les sous-titres enregistrés de la langue affichée (fichier .vtt).
  const exportVtt = async () => {
    setMsg(null);
    try {
      const res = await fetch(`/api/talks/${id}/studio/subs/${data.lang}.vtt`, { headers: { Authorization: 'Bearer ' + localStorage.getItem('token') } });
      if (!res.ok) throw new Error('http ' + res.status);
      const a = document.createElement('a');
      a.href = URL.createObjectURL(await res.blob());
      a.download = `sous-titres-${data.lang}.vtt`;
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(a.href), 2000);
    } catch { setMsg({ ok: false, text: t("ctExportVttErr") }); }
  };

  const load = useCallback(async (lang) => {
    setState('loading');
    const r = await call(`/talks/${id}/studio/transcript${lang ? `?lang=${lang}` : ''}`);
    if (r.status === 409) { setState('notReady'); return; }
    if (r.ok) { setData(r.data); setEdits({}); setPage(0); setState('ready'); }
  }, [call, id]);
  useEffect(() => { load(); }, [load]);
  useEffect(() => { call('/me/talks').then((r) => { const x = r.ok && r.data.find((d) => d.id === id); if (x) setNTr((x.translations || []).filter((tr) => ['ready', 'failed'].includes(tr.status)).length); }); }, [call, id]);

  const orig = useMemo(() => new Map((data?.segments || []).map((s) => [s.idx, s.t])), [data]);
  const changed = useMemo(() => Object.entries(edits).filter(([i, v]) => orig.get(Number(i)) !== v), [edits, orig]);
  useEffect(() => { onDirty(changed.length > 0); }, [changed.length, onDirty]);
  const isSource = data && data.lang === data.sourceLang;

  const needle = q.trim().toLowerCase();
  const rows = useMemo(() => (data?.segments || []).filter((s) => !needle || (edits[s.idx] ?? s.t).toLowerCase().includes(needle)), [data, needle, edits]);
  const shown = rows.slice(page * PAGE, page * PAGE + PAGE);
  const val = (s) => (edits[s.idx] !== undefined ? edits[s.idx] : s.t);

  const replaceAll = () => {
    if (!find) return;
    const next = { ...edits };
    let n = 0;
    for (const s of data.segments) {
      const cur = next[s.idx] !== undefined ? next[s.idx] : s.t;
      if (cur.includes(find)) { next[s.idx] = cur.split(find).join(repl); n += 1; }
    }
    setEdits(next);
    setMsg({ ok: true, text: t('ctReplaced').replace('{n}', n) });
  };

  const save = async () => {
    setSaving(true); setMsg(null);
    const body = { lang: data.lang, changes: changed.map(([i, v]) => ({ idx: Number(i), text: v })), retranslate: isSource && retranslate && nTr > 0, regenerateInsights: isSource && regen };
    const r = await call(`/talks/${id}/studio/transcript`, { method: 'PUT', body: JSON.stringify(body) });
    setSaving(false);
    if (!r.ok) { setMsg({ ok: false, text: r.data?.error || t('errGeneric') }); return; }
    setMsg({ ok: true, text: `${t('ctSaved').replace('{n}', r.data.changed)}${r.data.retranslating || r.data.regenerating ? ` ${t('ctSavedFollow')}` : ''}` });
    load(data.lang);
  };

  if (state === 'loading') return <p className="meta">…</p>;
  if (state === 'notReady') return <p className="meta">{t('ctNotReady')}</p>;
  const from = rows.length ? page * PAGE + 1 : 0;
  const to = Math.min(rows.length, page * PAGE + PAGE);

  return (
    <div className="ct">
      <div className="ct-tools panel">
        <label className="fld"><span>{t('ctLang')}</span>
          <select value={data.lang} disabled={changed.length > 0} onChange={(e) => load(e.target.value)}>
            {data.languages.map((l) => <option key={l} value={l}>{langName(l, locale)}{l === data.sourceLang ? ` (${t('ctOrigin')})` : ''}</option>)}
          </select>
        </label>
        <button type="button" className="btn ghost" data-act="export-vtt" disabled={changed.length > 0} title={t('ctExportVttHint')} onClick={exportVtt}>{t('ctExportVtt')}</button>
        <label className="fld"><span>{t('ctSearchLbl')}</span>
          <input type="search" placeholder={t('ctSearch')} value={q} onChange={(e) => { setQ(e.target.value); setPage(0); }} /></label>
        <div className="ct-replace">
          <label className="fld"><span>{t('ctReplaceFind')}</span><input value={find} onChange={(e) => setFind(e.target.value)} /></label>
          <label className="fld"><span>{t('ctReplaceWith')}</span><input value={repl} onChange={(e) => setRepl(e.target.value)} /></label>
          <button type="button" className="btn ghost" disabled={!find} onClick={replaceAll}>{t('ctReplaceAll')}</button>
        </div>
        <p className="meta small">{isSource ? t('ctWarnOrigin') : t('ctWarnTrans')}</p>
      </div>

      {msg && <p className={msg.ok ? 'ok-msg' : 'error'} role="status">{msg.text}</p>}

      <ol className="segs">
        {shown.map((s) => {
          const dirty = edits[s.idx] !== undefined && edits[s.idx] !== s.t;
          return (
            <li key={s.idx} className={dirty ? 'seg dirty' : 'seg'}>
              <span className="seg-time">{clock(s.s)}</span>
              <textarea rows={Math.max(1, Math.ceil(val(s).length / 90))} value={val(s)} dir="auto" aria-label={`${clock(s.s)}`}
                onChange={(e) => setEdits({ ...edits, [s.idx]: e.target.value })} />
              {dirty && <button type="button" className="link seg-undo" title={t('ctRevert')} aria-label={t('ctRevert')}
                onClick={() => { const n = { ...edits }; delete n[s.idx]; setEdits(n); }}>↺</button>}
            </li>
          );
        })}
      </ol>
      {rows.length === 0 && <p className="meta">{t('noResults')}</p>}
      {rows.length > PAGE && (
        <div className="seg-pager">
          <button type="button" className="btn ghost" disabled={page === 0} onClick={() => setPage(page - 1)}>←</button>
          <span className="meta">{t('ctShown').replace('{a}', from).replace('{b}', to).replace('{n}', rows.length)}</span>
          <button type="button" className="btn ghost" disabled={to >= rows.length} onClick={() => setPage(page + 1)}>→</button>
        </div>
      )}

      <div className="savebar">
        <div className="savebar-opts">
          <strong>{changed.length ? t('ctChanges').replace('{n}', changed.length) : t('ctNoChanges')}</strong>
          {isSource && changed.length > 0 && (
            <>
              {nTr > 0 && <label className="check"><input type="checkbox" checked={retranslate} onChange={(e) => setRetranslate(e.target.checked)} /> {t('ctRetranslate').replace('{n}', nTr)}</label>}
              <label className="check"><input type="checkbox" checked={regen} onChange={(e) => setRegen(e.target.checked)} /> {t('ctRegenerate')}</label>
            </>
          )}
        </div>
        <button type="button" className="btn" disabled={!changed.length || saving} onClick={save}>{saving ? t('saving') : t('ctSave')}</button>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ Résumé, points clés, chapitres */
function InsightsEditor({ id, t, call, locale, onDirty }) {
  const [data, setData] = useState(null);
  const [lang, setLang] = useState(null);
  const [f, setF] = useState(null); // { summary, points: [], chapters: [{time, title}] }
  const base = useRef('');
  const [translateOthers, setTranslateOthers] = useState(false);
  const [msg, setMsg] = useState(null);
  const [saving, setSaving] = useState(false);
  const [badTimes, setBadTimes] = useState([]);

  const toForm = (row) => ({ summary: row?.summary || '', points: [...(row?.keyPoints || [])], chapters: (row?.chapters || []).map((c) => ({ time: clock(c.ms), title: c.title })) });
  const pick = useCallback((d, l) => {
    const row = d.insights.find((i) => i.lang === l);
    const form = toForm(row);
    setLang(l); setF(form); base.current = JSON.stringify(form); setBadTimes([]); setTranslateOthers(false);
  }, []);
  const load = useCallback(async (keep) => {
    const r = await call(`/talks/${id}/studio/insights`);
    if (!r.ok) return;
    setData(r.data);
    pick(r.data, keep || r.data.sourceLang);
  }, [call, id, pick]);
  useEffect(() => { load(); }, [load]);

  const dirty = f && JSON.stringify(f) !== base.current;
  useEffect(() => { onDirty(Boolean(dirty)); }, [dirty, onDirty]);
  if (!data || !f) return <p className="meta">…</p>;

  const row = data.insights.find((i) => i.lang === lang);
  const busy = row && ['pending', 'processing'].includes(row.status);
  const isSource = lang === data.sourceLang;
  const otherLangs = data.insights.filter((i) => i.lang !== data.sourceLang).length;
  const langs = [...new Set([data.sourceLang, ...data.insights.map((i) => i.lang)])];
  const up = (o) => { setMsg(null); setF({ ...f, ...o }); };

  const save = async () => {
    const times = f.chapters.map((c) => parseClock(c.time));
    const bad = times.map((v, i) => (v === null ? i : -1)).filter((i) => i >= 0);
    setBadTimes(bad);
    if (bad.length) { setMsg({ ok: false, text: t('ctBadTime') }); return; }
    setSaving(true); setMsg(null);
    const body = {
      summary: f.summary, keyPoints: f.points.map((p) => p.trim()).filter(Boolean),
      chapters: f.chapters.map((c, i) => ({ ms: times[i], title: c.title })).filter((c) => c.title.trim()),
      translateOthers: isSource && translateOthers && otherLangs > 0,
    };
    const r = await call(`/talks/${id}/studio/insights/${lang}`, { method: 'PUT', body: JSON.stringify(body) });
    setSaving(false);
    if (!r.ok) { setMsg({ ok: false, text: r.data?.error || t('errGeneric') }); return; }
    setMsg({ ok: true, text: `${t('ctSavedSummary')}${r.data.translating ? ` ${t('ctSavedFollow')}` : ''}` });
    load(lang);
  };

  return (
    <div className="ct">
      <div className="ct-tools panel">
        <label className="fld"><span>{t('ctLang')}</span>
          <select value={lang} disabled={dirty} onChange={(e) => pick(data, e.target.value)}>
            {langs.map((l) => <option key={l} value={l}>{langName(l, locale)}{l === data.sourceLang ? ` (${t('ctOrigin')})` : ''}</option>)}
          </select>
        </label>
        {row?.edited && <p className="meta small">✎ {t('ctEdited')}</p>}
        {row?.status === 'failed' && <p className="meta small">{t('ctFailedNote')} {row.error}</p>}
        {!row && <p className="meta small">{t('ctNoInsights')}</p>}
        {busy && <p className="meta small">{t('ctBusy')}</p>}
      </div>

      {msg && <p className={msg.ok ? 'ok-msg' : 'error'} role="status">{msg.text}</p>}

      <fieldset className="panel" disabled={busy}>
        <h2 className="panel-title">{t('ctSummaryLbl')}</h2>
        <textarea rows={7} dir="auto" maxLength={4000} value={f.summary} onChange={(e) => up({ summary: e.target.value })} aria-label={t('ctSummaryLbl')} />

        <h2 className="panel-title">{t('ctKeyPoints')}</h2>
        <ul className="rows">
          {f.points.map((p, i) => (
            <li key={i}>
              <input dir="auto" maxLength={400} placeholder={t('ctPointPh')} value={p} onChange={(e) => up({ points: f.points.map((x, j) => (j === i ? e.target.value : x)) })} />
              <button type="button" className="link u danger-link" onClick={() => up({ points: f.points.filter((_, j) => j !== i) })}>{t('ctRemove')}</button>
            </li>
          ))}
        </ul>
        <div><button type="button" className="btn ghost" onClick={() => up({ points: [...f.points, ''] })}>{t('ctAddPoint')}</button></div>

        <h2 className="panel-title">{t('ctChapters')}</h2>
        <ul className="rows">
          {f.chapters.map((c, i) => (
            <li key={i}>
              <input className={`time${badTimes.includes(i) ? ' bad' : ''}`} inputMode="numeric" placeholder="0:00" aria-label="min:s" value={c.time}
                onChange={(e) => up({ chapters: f.chapters.map((x, j) => (j === i ? { ...x, time: e.target.value } : x)) })} />
              <input dir="auto" maxLength={120} placeholder={t('ctChapterTitle')} value={c.title}
                onChange={(e) => up({ chapters: f.chapters.map((x, j) => (j === i ? { ...x, title: e.target.value } : x)) })} />
              <button type="button" className="link u danger-link" onClick={() => up({ chapters: f.chapters.filter((_, j) => j !== i) })}>{t('ctRemove')}</button>
            </li>
          ))}
        </ul>
        <div><button type="button" className="btn ghost" onClick={() => up({ chapters: [...f.chapters, { time: '', title: '' }] })}>{t('ctAddChapter')}</button></div>
      </fieldset>

      <div className="savebar">
        <div className="savebar-opts">
          <strong>{dirty ? t('ctUnsavedShort') : t('ctNoChanges')}</strong>
          {isSource && otherLangs > 0 && dirty && (
            <label className="check"><input type="checkbox" checked={translateOthers} onChange={(e) => setTranslateOthers(e.target.checked)} /> {t('ctTranslateOthers')}</label>
          )}
        </div>
        <button type="button" className="btn" disabled={!dirty || saving || busy} onClick={save}>{saving ? t('saving') : t('save')}</button>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ Page */
export default function ContentPage() {
  const { id } = useParams();
  const { t, call, locale } = useApp();
  const params = useSearchParams();
  const router = useRouter();
  const tab = ['summary', 'quiz', 'practice', 'reminders'].includes(params.get('tab')) ? params.get('tab') : 'transcript';
  const dirty = useRef(false);
  const [title, setTitle] = useState('');
  const onDirty = useCallback((v) => { dirty.current = v; }, []);

  useEffect(() => { call('/me/talks').then((r) => { const x = r.ok && r.data.find((d) => d.id === id); if (x) setTitle(x.title); }); }, [call, id]);
  useEffect(() => {
    const h = (e) => { if (dirty.current) { e.preventDefault(); e.returnValue = ''; } };
    window.addEventListener('beforeunload', h);
    return () => window.removeEventListener('beforeunload', h);
  }, []);
  const go = (next) => { if (dirty.current && !window.confirm(t('ctUnsaved'))) return; dirty.current = false; router.replace(`/studio/${id}/content?tab=${next}`); };

  return (
    <main className="studio-page studio-narrow">
      <Link href={`/studio/${id}`} className="back" onClick={(e) => { if (dirty.current && !window.confirm(t('ctUnsaved'))) e.preventDefault(); }}>← {t('ctBack')}</Link>
      <h1 className="studio-title">{t('ctTitle')}</h1>
      {title && <p className="meta">{title}</p>}
      <div className="pills tabs" role="tablist">
        <button type="button" role="tab" aria-selected={tab === 'transcript'} className={tab === 'transcript' ? 'pill on' : 'pill'} onClick={() => go('transcript')}>{t('ctTabTranscript')}</button>
        <button type="button" role="tab" aria-selected={tab === 'summary'} className={tab === 'summary' ? 'pill on' : 'pill'} onClick={() => go('summary')}>{t('ctTabSummary')}</button>
        <button type="button" role="tab" aria-selected={tab === 'quiz'} className={tab === 'quiz' ? 'pill on' : 'pill'} onClick={() => go('quiz')}>{t('qzTab')}</button>
        <button type="button" role="tab" aria-selected={tab === 'practice'} className={tab === 'practice' ? 'pill on' : 'pill'} onClick={() => go('practice')}>{t('pzTab')}</button>
        <button type="button" role="tab" aria-selected={tab === 'reminders'} className={tab === 'reminders' ? 'pill on' : 'pill'} onClick={() => go('reminders')}>{t('rmTab')}</button>
      </div>
      {tab === 'transcript' && <TranscriptEditor key="tr" id={id} t={t} call={call} locale={locale} onDirty={onDirty} />}
      {tab === 'summary' && <InsightsEditor key="in" id={id} t={t} call={call} locale={locale} onDirty={onDirty} />}
      {tab === 'quiz' && <QuizEditor key="qz" id={id} t={t} call={call} />}
      {tab === 'practice' && <><ThemesPicker key="th" id={id} t={t} call={call} /><PracticeEditor key="pz" id={id} t={t} call={call} /></>}
      {tab === 'reminders' && <RemindersEditor key="rm" id={id} t={t} call={call} />}
    </main>
  );
}
