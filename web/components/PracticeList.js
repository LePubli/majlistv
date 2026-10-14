'use client';
// Espace Apprentissage → « Mes engagements » : les actions que le membre a choisies après une conférence, avec leur état.
// Aucun total ni pourcentage de réussite : l'objectif est de se souvenir et de reprendre, pas de se comparer.
import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';

const STATUSES = ['todo', 'doing', 'done', 'not_yet'];
const dots = (n) => '●'.repeat(n);

function Item({ x, t, call, locale, onChange, onRemove }) {
  const [note, setNote] = useState(x.note);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(null);
  const patch = async (body) => {
    setBusy(true); setErr(null);
    const r = await call(`/me/practice/${x.id}`, { method: 'PATCH', body: JSON.stringify(body) });
    setBusy(false);
    if (!r.ok) { setErr(r.data?.error || t('errGeneric')); return; }
    onChange(r.data);
  };
  const remove = async () => {
    if (!window.confirm(t('pzRemoveConfirm'))) return;
    const r = await call(`/me/practice/${x.id}`, { method: 'DELETE' });
    if (r.ok) onRemove(x.id);
  };
  const due = x.dueOn ? new Date(x.dueOn + 'T12:00:00').toLocaleDateString(locale, { weekday: 'long', day: 'numeric', month: 'long' }) : null;
  return (
    <li className={`pz-commit-item st-${x.status}`}>
      <p className="pz-ctext">{x.size ? <span className="pz-size" title={t(`pzSize${x.size}`)} aria-label={t(`pzSize${x.size}`)}>{dots(x.size)} </span> : null}{x.text}</p>
      {x.niyya && <p className="meta small pz-niyya">{t('pzNiyyaShort')} : {x.niyya}</p>}
      <p className="meta small">
        {due && <>{t('pzFor').replace('{d}', due)}{x.overdue ? <> · <b className="pz-overdue">{t('pzOverdue')}</b></> : null}</>}
      </p>
      <div className="pills" role="group" aria-label={t('pzStatus')}>
        {STATUSES.map((s) => <button key={s} type="button" disabled={busy} aria-pressed={x.status === s} className={x.status === s ? `pill on pz-st-${s}` : 'pill'} onClick={() => x.status !== s && patch({ status: s })}>{t(`pzSt_${s}`)}</button>)}
      </div>
      {open ? (
        <div className="pz-note">
          <textarea rows={3} maxLength={1000} value={note} placeholder={t('pzNotePh')} aria-label={t('pzNote')} onChange={(e) => setNote(e.target.value)} />
          <div className="panel-actions">
            <button type="button" className="btn" disabled={busy} onClick={async () => { await patch({ note }); setOpen(false); }}>{t('save')}</button>
            <button type="button" className="btn ghost" onClick={() => { setNote(x.note); setOpen(false); }}>{t('cancelBtn')}</button>
          </div>
        </div>
      ) : (
        <>
          {x.note && <p className="pz-notetext">{x.note}</p>}
          <div className="pz-tools">
            <button type="button" className="link u small" onClick={() => setOpen(true)}>{x.note ? t('pzNoteEdit') : t('pzNoteAdd')}</button>
            <button type="button" className="link u small" onClick={remove}>{t('pzRemove')}</button>
          </div>
        </>
      )}
      {err && <p className="error" role="alert">{err}</p>}
    </li>
  );
}

export default function PracticeList({ t, call, locale }) {
  const [d, setD] = useState(null);
  const load = useCallback(() => call('/me/practice').then((r) => r.ok && setD(r.data)), [call]);
  useEffect(() => { load(); }, [load]);
  useEffect(() => { // lien « Mes engagements » depuis la page d'une conférence
    if (d && typeof window !== 'undefined' && window.location.hash === '#engagements') document.getElementById('engagements')?.scrollIntoView({ block: 'start' });
  }, [d === null]); // eslint-disable-line react-hooks/exhaustive-deps
  if (!d) return null;

  const replace = (n) => setD((v) => ({ ...v, items: v.items.map((i) => (i.id === n.id ? n : i)) }));
  const drop = (id) => setD((v) => ({ ...v, items: v.items.filter((i) => i.id !== id) }));
  const groups = [];
  for (const x of d.items) {
    const key = x.talkId || 'none';
    const g = groups.find((y) => y.key === key);
    if (g) g.items.push(x); else groups.push({ key, talkId: x.talkId, title: x.talkTitle, items: [x] });
  }
  const exportData = async () => {
    const r = await call('/me/practice/export');
    if (!r.ok) return;
    const url = URL.createObjectURL(new Blob([JSON.stringify(r.data, null, 2)], { type: 'application/json' }));
    const a = document.createElement('a'); a.href = url; a.download = 'mes-engagements.json'; a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };
  const eraseAll = async () => {
    if (!window.confirm(t('pzEraseConfirm'))) return;
    const r = await call('/me/practice', { method: 'DELETE' });
    if (r.ok) load();
  };
  const c = d.counts;

  return (
    <section className="lr-block pz-mine" id="engagements" aria-labelledby="pz-mine-title">
      <h2 id="pz-mine-title">{t('pzMineTitle')}</h2>
      <p className="meta">{t('pzMineIntro')}</p>
      {d.items.length === 0 ? <p className="soon">{t('pzMineEmpty')}</p> : (
        <>
          <p className="meta small">{t('pzCounts').replace('{a}', c.todo + c.doing).replace('{b}', c.done)}</p>
          {groups.map((g) => (
            <div key={g.key} className="pz-group">
              <h3>{g.talkId ? <Link href={`/talks/${g.talkId}`}>{g.title}</Link> : t('pzTalkGone')}</h3>
              <ul className="pz-clist">{g.items.map((x) => <Item key={x.id} x={x} t={t} call={call} locale={locale} onChange={replace} onRemove={drop} />)}</ul>
            </div>
          ))}
        </>
      )}
      <p className="meta small">{t('pzPrivacy')}</p>
      {d.items.length > 0 && (
        <div className="pz-tools">
          <button type="button" className="link u small" onClick={exportData}>{t('pzExport')}</button>
          <button type="button" className="link u small" onClick={eraseAll}>{t('pzErase')}</button>
        </div>
      )}
    </section>
  );
}
