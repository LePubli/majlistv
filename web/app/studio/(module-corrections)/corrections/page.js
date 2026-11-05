'use client';
// Studio → Corrections des sous-titres (amélioration 4.1) : suggestions des membres à relire, toutes vidéos confondues.
// On juge la correction, pas la personne : l'auteur n'est pas affiché. Accepter applique le texte à la phrase.
import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useApp } from '../../../../components/Providers';
import { langName } from '../../../../components/Transcript';

const clock = (ms) => {
  const s = Math.floor(ms / 1000), h = Math.floor(s / 3600);
  return `${h ? h + ':' : ''}${String(Math.floor((s % 3600) / 60)).padStart(h ? 2 : 1, '0')}:${String(s % 60).padStart(2, '0')}`;
};
const RTL = new Set(['ar', 'he', 'fa', 'ur']);

function Item({ c, t, call, locale, onDone }) {
  const [text, setText] = useState(c.suggestedText);
  const [edit, setEdit] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const pending = c.status === 'pending';
  const act = async (kind) => {
    setBusy(true); setErr('');
    const r = await call(`/studio/corrections/${c.id}/${kind}`, { method: 'POST', body: JSON.stringify(kind === 'accept' && edit ? { text } : {}) });
    setBusy(false);
    if (r.ok) onDone(c.id); else setErr(r.data?.error || t('corErr'));
  };
  const dir = RTL.has(c.lang) ? 'rtl' : 'ltr';
  return (
    <article className="cr-item">
      <header className="cr-item-head">
        <Link className="link u" href={`/talks/${c.talkId}?t=${Math.floor(c.startMs / 1000)}`}>{c.talkTitle}</Link>
        <span className="meta">{langName(c.lang, locale)} · {clock(c.startMs)}{c.isSource ? ` · ${t('corSource')}` : ''}</span>
      </header>
      {pending && c.changed && <p className="meta cr-changed">{t('corChanged')}</p>}
      <p className="cr-diff" dir={dir} aria-label={t('corDiffLabel')}>
        {c.diff.map((w, i) => <span key={i} className={w.kind === 'same' ? '' : w.kind === 'del' ? 'cr-del' : 'cr-add'}>{w.t} </span>)}
      </p>
      {c.comment && <p className="meta cr-comment">« {c.comment} »</p>}
      {pending ? (
        <>
          {edit && <textarea className="cr-edit" dir={dir} rows={3} maxLength={2000} value={text} onChange={(e) => setText(e.target.value)} />}
          {err && <p className="error" role="alert">{err}</p>}
          <div className="cr-actions">
            <button className="btn sm" disabled={busy || !text.trim()} onClick={() => act('accept')}>{t('corAccept')}</button>
            <button className="btn ghost sm" disabled={busy} onClick={() => setEdit((v) => !v)}>{edit ? t('corNoEdit') : t('corEdit')}</button>
            <button className="btn ghost sm" disabled={busy} onClick={() => act('reject')}>{t('corReject')}</button>
          </div>
        </>
      ) : <p className="meta">{c.status === 'accepted' ? t('corAccepted') : t('corRejected')}</p>}
    </article>
  );
}

export default function CorrectionsReview() {
  const { t, call, locale } = useApp();
  const [status, setStatus] = useState('pending');
  const [data, setData] = useState(null);
  const [err, setErr] = useState(false);
  const load = useCallback(() => {
    setErr(false);
    call(`/studio/corrections?status=${status}`).then((r) => { if (r.ok) setData(r.data); else setErr(true); });
  }, [call, status]);
  useEffect(() => { setData(null); load(); }, [load]);
  const done = (id) => setData((d) => d && ({ ...d, counts: { ...d.counts, [status]: Math.max(0, d.counts[status] - 1) }, items: d.items.filter((x) => x.id !== id) }));
  const groups = [];
  for (const x of data?.items || []) {
    const g = groups.find((y) => y.talkId === x.talkId);
    if (g) g.items.push(x); else groups.push({ talkId: x.talkId, title: x.talkTitle, items: [x] });
  }
  return (
    <main className="studio-page studio-narrow">
      <h1 className="studio-title">{t('corTitle')}</h1>
      <p className="meta">{t('corIntro')}</p>
      <div className="st-seg" role="tablist" aria-label={t('corTitle')}>
        {['pending', 'accepted', 'rejected'].map((s) => (
          <button key={s} role="tab" aria-selected={status === s} className={status === s ? 'on' : ''} onClick={() => setStatus(s)}>
            {t({ pending: 'corTabPending', accepted: 'corTabAccepted', rejected: 'corTabRejected' }[s])}{data ? ` (${data.counts[s]})` : ''}
          </button>
        ))}
      </div>
      {err && <p className="error">{t('stLoadErr')}</p>}
      {!data && !err && <p className="meta">…</p>}
      {data && data.items.length === 0 && <p className="soon">{t('corEmpty')}</p>}
      {groups.map((g) => (
        <section key={g.talkId} className="cr-group">
          <h2 className="panel-title">{g.title} <span className="meta">({g.items.length})</span></h2>
          {g.items.map((c) => <Item key={c.id} c={c} t={t} call={call} locale={locale} onDone={done} />)}
        </section>
      ))}
    </main>
  );
}
