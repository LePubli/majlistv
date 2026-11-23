'use client';
// Studio → Sous-titres → Qualité : pour chacun de mes contenus, la note de lisibilité et de complétude de chaque langue de sous-titres
// (API : GET /studio/subtitles/quality). Mesures FORMELLES seulement (vitesse de lecture, longueur, durée, chevauchement, traduction
// incomplète ou non traduite) : aucune confiance de reconnaissance vocale n'est enregistrée, l'écran ne juge donc pas si le texte est juste.
// Troisième onglet de la rubrique (components/SubtitleTabs.js). Lecture seule : on corrige dans la fiche du contenu (« Gérer »).
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useApp } from '../../../../components/Providers';
import { langName } from '../../../../components/Transcript';
import SubtitleTabs from '../../../../components/SubtitleTabs';
import { Page as BmPage, Badge as BmBadge, Btn as BmBtn, Metrics as BmMetrics, Panel as BmPanel, Table as BmTable, c as bmc } from '../../../../components/backoffice/Kit';

const LEVELS = ['all', 'fix', 'check', 'good'];
const TONE = { good: 'green', check: 'amber', fix: 'red', none: 'blue' };
const clock = (ms) => { const s = Math.floor(ms / 1000); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`; };

export default function SubtitleQuality() {
  const { t, call, locale, skin } = useApp();
  const [data, setData] = useState(null);
  const [err, setErr] = useState(false);
  const [filter, setFilter] = useState('all');
  const [q, setQ] = useState('');
  const [open, setOpen] = useState(null); // { id, lang, title, items | null }

  useEffect(() => {
    let alive = true;
    call('/studio/subtitles/quality').then((r) => { if (!alive) return; if (r.ok) setData(r.data); else setErr(true); });
    return () => { alive = false; };
  }, [call]);

  const lname = (l) => langName(String(l || '').split('-')[0], locale) || l;
  const norms = data?.norms || { maxCps: 21, maxChars: 84, maxSeconds: 8 };
  const label = (k) => t('sqIssue_' + k).replace('{cps}', norms.maxCps).replace('{chars}', norms.maxChars).replace('{s}', norms.maxSeconds);
  const needle = q.trim().toLowerCase();
  const talks = data?.talks || [];
  const shown = talks.filter((r) => (filter === 'all' || r.level === filter) && (!needle || `${r.title} ${r.speaker}`.toLowerCase().includes(needle)));
  const tot = data?.totals;

  const show = async (talk, lang) => {
    setOpen({ id: talk.id, lang, title: talk.title, items: null });
    const r = await call(`/studio/subtitles/quality/${talk.id}?lang=${encodeURIComponent(lang)}`);
    setOpen((o) => (o && o.id === talk.id && o.lang === lang ? { ...o, items: r.ok ? r.data.items : [], failed: !r.ok } : o));
  };

  const langBadges = (r) => (
    <span style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
      {r.langs.map((l) => (
        <button key={l.lang} type="button" onClick={() => show(r, l.lang)} aria-label={`${lname(l.lang)} : ${l.score ?? '—'} / 100`}
          style={{ background: 'none', border: 0, padding: 0, cursor: 'pointer', font: 'inherit' }}>
          <BmBadge tone={TONE[l.level]}>{lname(l.lang)} {l.score ?? '—'}</BmBadge>
        </button>
      ))}
    </span>
  );
  const problems = (r) => {
    const sum = {};
    for (const l of r.langs) for (const [k, v] of Object.entries(l.counts)) if (v) sum[k] = (sum[k] || 0) + v;
    const keys = Object.keys(sum);
    return keys.length ? keys.map((k) => `${label(k)} : ${sum[k]}`).join(' · ') : '—';
  };

  const detail = open && (
    <BmPanel title={`${open.title} — ${lname(open.lang)}`} extra={open.items ? `${open.items.length}` : ''}>
      <p className="meta">{t('sqDetailIntro')}</p>
      {open.items == null && <p className="meta">…</p>}
      {open.failed && <p className="meta">{t('sqLoadFailed')}</p>}
      {open.items && open.items.length === 0 && !open.failed && <p className="meta">{t('sqNoIssue')}</p>}
      {open.items && open.items.length > 0 && (
        <BmTable headers={[t('sqColTime'), `${t('sqColText')} · ${t('sqColIssues')}`]}
          rows={open.items.map((it) => [
            clock(it.startMs),
            <span key="t" dir="auto">{it.text || '—'}<br /><small>{it.chars} {t('sqChars')} · {it.seconds} s{it.cps != null ? ` · ${it.cps} ${t('sqCps')}` : ''}</small>
              <span style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 6 }}>{it.issues.map((k) => <BmBadge key={k} tone="amber">{label(k)}</BmBadge>)}</span></span>,
          ])} />
      )}
      <p style={{ marginTop: 12 }}><Link href={`/studio/${open.id}`} className="btn ghost">{t('manage')}</Link> <button type="button" className="btn ghost" onClick={() => setOpen(null)}>{t('corClose')}</button></p>
    </BmPanel>
  );

  const body = (kind) => {
    if (err) return <p className="meta">{t('sqLoadFailed')}</p>;
    if (!data) return <p className="meta">…</p>;
    return null;
  };

  if (skin === 'premium') {
    return (
      <main className="studio-page">
        <BmPage title={t('sdSubs')} sub={t('sqIntro')}>
          <BmMetrics items={tot ? [
            { icon: 'captions', label: t('sqM_analysed'), value: tot.analysed },
            { icon: 'check', tone: 'green', label: t('sqF_good'), value: tot.good },
            { icon: 'clock', tone: 'amber', label: t('sqF_check'), value: tot.check },
            { icon: 'alert', tone: 'red', label: t('sqF_fix'), value: tot.fix },
          ] : []} />
          <SubtitleTabs />
          {body() || (
            <>
              <BmPanel title={t('sqTitle')} extra={`${shown.length}`}>
                <p className="meta">{t('sqNorms').replace('{cps}', norms.maxCps).replace('{chars}', norms.maxChars).replace('{s}', norms.maxSeconds)}</p>
                <div className={bmc('inline-tools')}>
                  <label className={bmc('search-field')}><input type="search" placeholder={t('studioSearch')} value={q} onChange={(e) => setQ(e.target.value)} /></label>
                  <select value={filter} onChange={(e) => setFilter(e.target.value)} aria-label={t('filterBy')}>
                    {LEVELS.map((k) => <option key={k} value={k}>{t('sqF_' + k)}{k === 'all' ? ` (${talks.length})` : ` (${tot[k]})`}</option>)}
                  </select>
                </div>
                <BmTable empty={talks.length === 0 ? t('sqEmpty') : t('noResults')}
                  headers={[t('colTalk'), t('sqColScore'), t('sdSubLangs'), t('sqColIssues'), '']}
                  rows={shown.map((r) => [
                    <span key="a"><Link href={`/studio/${r.id}`} dir="auto"><b>{r.title}</b></Link><br /><small>{r.speaker}</small></span>,
                    <BmBadge key="s" tone={TONE[r.level]}>{r.score ?? '—'} / 100</BmBadge>,
                    langBadges(r),
                    <small key="p">{problems(r)}{r.pendingCorrections ? ` · ${t('sqPending').replace('{n}', r.pendingCorrections)}` : ''}</small>,
                    <BmBtn key="m" primary={false} href={`/studio/${r.id}`}>{t('manage')}</BmBtn>,
                  ])} />
                {tot.withoutText > 0 && <p className="meta" style={{ marginTop: 10 }}>{t('sqWithout').replace('{n}', tot.withoutText)}</p>}
              </BmPanel>
              {detail}
            </>
          )}
        </BmPage>
      </main>
    );
  }
  return (
    <main className="studio-page">
      <div className="studio-head"><h1 className="studio-title">{t('sdSubs')}</h1></div>
      <SubtitleTabs />
      <p className="meta">{t('sqIntro')}</p>
      {body() || (
        <>
          <p className="meta">{t('sqNorms').replace('{cps}', norms.maxCps).replace('{chars}', norms.maxChars).replace('{s}', norms.maxSeconds)}</p>
          <div className="admin-cards">
            {[['analysed', tot.analysed], ['good', tot.good], ['check', tot.check], ['fix', tot.fix]].map(([k, v]) => (
              <div key={k} className="admin-card"><div className="admin-num">{v}</div><div className="meta">{t(k === 'analysed' ? 'sqM_analysed' : 'sqF_' + k)}</div></div>
            ))}
          </div>
          <div className="studio-tools" style={{ margin: '12px 0' }}>
            <input type="search" placeholder={t('studioSearch')} value={q} onChange={(e) => setQ(e.target.value)} />
            <select value={filter} onChange={(e) => setFilter(e.target.value)} aria-label={t('filterBy')}>
              {LEVELS.map((k) => <option key={k} value={k}>{t('sqF_' + k)}</option>)}
            </select>
          </div>
          {shown.length === 0 ? <p className="meta">{talks.length === 0 ? t('sqEmpty') : t('noResults')}</p> : (
            <table className="st-table">
              <thead><tr><th>{t('colTalk')}</th><th>{t('sqColScore')}</th><th>{t('sdSubLangs')}</th><th>{t('sqColIssues')}</th></tr></thead>
              <tbody>
                {shown.map((r) => (
                  <tr key={r.id}>
                    <td data-label={t('colTalk')}><Link href={`/studio/${r.id}`} dir="auto"><b>{r.title}</b></Link><br /><small>{r.speaker}</small></td>
                    <td data-label={t('sqColScore')}><b>{r.score ?? "—"} / 100</b></td>
                    <td data-label={t('sdSubLangs')}>{r.langs.map((l) => <button key={l.lang} type="button" className="btn ghost" style={{ marginInlineEnd: 6 }} onClick={() => show(r, l.lang)}>{lname(l.lang)} {l.score ?? '—'}</button>)}</td>
                    <td data-label={t('sqColIssues')}><small>{problems(r)}</small></td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          {tot.withoutText > 0 && <p className="meta">{t('sqWithout').replace('{n}', tot.withoutText)}</p>}
          {open && (
            <section className="admin-card" style={{ marginTop: 16 }}>
              <h2>{open.title} — {lname(open.lang)}</h2>
              <p className="meta">{t('sqDetailIntro')}</p>
              {open.items == null && <p className="meta">…</p>}
              {open.items && open.items.length === 0 && <p className="meta">{open.failed ? t('sqLoadFailed') : t('sqNoIssue')}</p>}
              {open.items && open.items.length > 0 && (
                <table className="st-table">
                  <thead><tr><th>{t('sqColTime')}</th><th>{t('sqColText')}</th><th>{t('sqColIssues')}</th></tr></thead>
                  <tbody>{open.items.map((it) => (
                    <tr key={it.idx}><td>{clock(it.startMs)}</td><td dir="auto">{it.text || '—'}<br /><small>{it.chars} {t('sqChars')} · {it.seconds} s{it.cps != null ? ` · ${it.cps} ${t('sqCps')}` : ''}</small></td><td><small>{it.issues.map((k) => label(k)).join(' · ')}</small></td></tr>
                  ))}</tbody>
                </table>
              )}
              <p><Link href={`/studio/${open.id}`} className="btn ghost">{t('manage')}</Link> <button type="button" className="btn ghost" onClick={() => setOpen(null)}>{t('corClose')}</button></p>
            </section>
          )}
        </>
      )}
    </main>
  );
}
