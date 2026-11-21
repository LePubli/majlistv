'use client';
// Studio → Sous-titres : pour chacun de mes contenus, la langue transcrite et l'état de chaque langue de sous-titres.
// Les sous-titres se demandent, se relisent et se corrigent dans la fiche du contenu (bouton « Gérer »).
// Second onglet de la rubrique : « Corrections des membres » (components/SubtitleTabs.js).
import { useState } from 'react';
import Link from 'next/link';
import { useApp } from '../../../components/Providers';
import useMyTalks from '../../../components/useMyTalks';
import { langName } from '../../../components/Transcript';
import SubtitleTabs from '../../../components/SubtitleTabs';
import { Page as BmPage, Badge as BmBadge, Btn as BmBtn, Metrics as BmMetrics, Panel as BmPanel, Table as BmTable, c as bmc } from '../../../components/backoffice/Kit';

const FILTERS = ['all', 'run', 'err', 'none'];

export default function StudioSubtitles() {
  const { t, locale, skin } = useApp();
  const { rows, loaded } = useMyTalks();
  const [filter, setFilter] = useState('all');
  const [q, setQ] = useState('');
  const busy = (s) => ['pending', 'processing'].includes(s);
  const kindOf = (r) => {
    const tr = r.translations || [];
    if (tr.some((x) => x.status === 'failed')) return 'err';
    if (tr.some((x) => busy(x.status))) return 'run';
    return tr.length ? 'ok' : 'none';
  };
  const withKind = rows.map((r) => ({ ...r, sub: kindOf(r) }));
  const count = (f) => (f === 'all' ? withKind.length : withKind.filter((r) => r.sub === f).length);
  const needle = q.trim().toLowerCase();
  const shown = withKind.filter((r) => (filter === 'all' || r.sub === filter) && (!needle || `${r.title} ${r.speaker}`.toLowerCase().includes(needle)));
  const lname = (l) => langName(String(l || '').split('-')[0], locale) || l;

  if (skin === 'premium') {
    return (
      <main className="studio-page">
        <BmPage title={t('sdSubs')} sub={t('sdSubsIntro')}>
          <BmMetrics items={loaded ? [
            { icon: 'captions', label: t('sdSubF_all'), value: withKind.length },
            { icon: 'clock', label: t('sdSubF_run'), value: count('run') },
            { icon: 'alert', tone: 'amber', label: t('sdSubF_err'), value: count('err') },
            { icon: 'file', label: t('sdSubF_none'), value: count('none') },
          ] : []} />
          <SubtitleTabs />
          <BmPanel title={t('sdSubs')} extra={loaded ? `${shown.length}` : ''}>
            <div className={bmc('inline-tools')}>
              <label className={bmc('search-field')}><input type="search" placeholder={t('studioSearch')} value={q} onChange={(e) => setQ(e.target.value)} /></label>
              <select value={filter} onChange={(e) => setFilter(e.target.value)} aria-label={t('filterBy')}>
                {FILTERS.map((k) => <option key={k} value={k}>{t('sdSubF_' + k)}{loaded ? ` (${count(k)})` : ''}</option>)}
              </select>
            </div>
            <BmTable empty={loaded ? (rows.length === 0 ? t('studioEmpty') : t('noResults')) : '…'}
              headers={[t('colTalk'), t('sdSubSource'), t('sdSubLangs'), '']}
              rows={shown.map((r) => [
                <span key="a"><Link href={`/studio/${r.id}`} dir="auto"><b>{r.title}</b></Link><br /><small>{r.speaker}</small></span>,
                r.transcriptStatus === 'ready' ? lname(r.transcriptLanguage) : (r.transcriptStatus === 'failed' ? t('step_err') : '—'),
                <span key="l" style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                  {(r.translations || []).length === 0 && <span style={{ color: 'var(--muted)' }}>{t('sdSubNone')}</span>}
                  {(r.translations || []).map((x) => (
                    <BmBadge key={x.lang} tone={x.status === 'failed' ? 'red' : busy(x.status) ? 'blue' : 'green'}>
                      {lname(x.lang)}{busy(x.status) && x.progress != null ? ` ${x.progress} %` : x.status === 'failed' ? ' !' : ' ✓'}
                    </BmBadge>
                  ))}
                </span>,
                <BmBtn key="m" primary={false} href={`/studio/${r.id}`}>{t('manage')}</BmBtn>,
              ])} />
          </BmPanel>
        </BmPage>
      </main>
    );
  }
  return (
    <main className="studio-page">
      <div className="studio-head"><h1 className="studio-title">{t('sdSubs')}</h1></div>
      <SubtitleTabs />
      <p className="meta">{t('sdSubsIntro')}</p>
      <div className="studio-tools">
        <label className="studio-search">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden="true"><circle cx="11" cy="11" r="7" /><path d="M20 20l-3.5-3.5" /></svg>
          <span className="sr-only">{t('search')}</span>
          <input type="search" placeholder={t('studioSearch')} value={q} onChange={(e) => setQ(e.target.value)} />
        </label>
        <div className="pills" role="group" aria-label={t('filterBy')}>
          {FILTERS.map((k) => (
            <button key={k} type="button" aria-pressed={filter === k} className={filter === k ? 'pill on' : 'pill'} onClick={() => setFilter(k)}>
              {t('sdSubF_' + k)}{loaded ? ` (${count(k)})` : ''}
            </button>
          ))}
        </div>
      </div>
      {loaded && rows.length === 0 && <div className="studio-empty"><p>{t('studioEmpty')}</p><Link href="/studio/new" className="btn">+ {t('newTalk')}</Link></div>}
      {loaded && rows.length > 0 && shown.length === 0 && <p className="meta">{t('noResults')}</p>}
      {shown.length > 0 && (
        <div className="studio-table-wrap">
          <table className="studio-table">
            <thead><tr><th>{t('colTalk')}</th><th>{t('sdSubSource')}</th><th>{t('sdSubLangs')}</th><th><span className="sr-only">{t('colActions')}</span></th></tr></thead>
            <tbody>
              {shown.map((r) => (
                <tr key={r.id}>
                  <td><Link href={`/studio/${r.id}`} className="studio-talk"><span className="studio-talk-text"><b>{r.title}</b><small>{r.speaker}</small></span></Link></td>
                  <td>{r.transcriptStatus === 'ready' ? lname(r.transcriptLanguage) : <span className="muted">{r.transcriptStatus === 'failed' ? t('step_err') : '—'}</span>}</td>
                  <td>
                    {(r.translations || []).length === 0 && <span className="muted">{t('sdSubNone')}</span>}
                    <span className="sd-chips">
                      {(r.translations || []).map((x) => (
                        <span key={x.lang} className={`sd-chip ${x.status === 'failed' ? 'err' : busy(x.status) ? 'run' : 'ok'}`} title={x.error || undefined}>
                          {lname(x.lang)}{busy(x.status) && x.progress != null ? ` ${x.progress} %` : x.status === 'failed' ? ' !' : ' ✓'}
                        </span>
                      ))}
                    </span>
                  </td>
                  <td className="end"><Link href={`/studio/${r.id}`} className="manage">{t('manage')}</Link></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </main>
  );
}
