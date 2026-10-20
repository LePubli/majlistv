'use client';
// Studio → modification en lot (étape 27.1) : on coche des conférences, on choisit les champs à changer, on applique.
// Seuls les champs cochés « modifier » sont envoyés ; tout est appliqué en une seule fois (tout ou rien).
import { useEffect, useState } from 'react';
import { useApp } from './Providers';
import { BANDS, bandLabel } from '../lib/kids';
import { LEVELS, levelLabel } from '../lib/levels';
import { useRubrics, rubricName } from './KidRubricsPicker';

export default function BulkEdit({ ids, onDone, onCancel }) {
  const { t, call, formats, locale } = useApp();
  const fmtLabel = (f) => f['name' + locale[0].toUpperCase() + locale.slice(1)] || f.nameFr;
  const [cats, setCats] = useState([]);
  const rubrics = useRubrics(call);
  const [kr, setKr] = useState({ ids: [], mode: 'add' }); // rubriques Kids à ajouter / remplacer / retirer
  const [on, setOn] = useState({});            // champs à modifier
  const [v, setV] = useState({ access: 'free', categoryId: '', formatId: '', level: '', publication: 'published', speaker: '', kidsBands: [], bandsMode: 'replace', showAdults: true });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  useEffect(() => { call('/categories', {}, null).then((r) => r.ok && setCats(r.data)); }, [call]);
  const toggle = (k) => setOn((o) => ({ ...o, [k]: !o[k] }));
  const set = (k, val) => { setV((x) => ({ ...x, [k]: val })); setOn((o) => ({ ...o, [k === 'bandsMode' ? 'kidsBands' : k]: true })); };

  const apply = async () => {
    const changes = {};
    if (on.access) changes.access = v.access;
    if (on.categoryId) changes.categoryId = v.categoryId ? Number(v.categoryId) : null;
    if (on.formatId && v.formatId) changes.formatId = Number(v.formatId);
    if (on.level) changes.level = v.level || null;
    if (on.publication) changes.publication = v.publication;
    if (on.speaker) changes.speaker = v.speaker.trim();
    if (on.kidsBands) changes.kidsBands = v.kidsBands;
    if (on.showAdults) changes.showAdults = v.showAdults;
    const rubricChange = on.kidRubrics && kr.ids.length > 0;
    if (!Object.keys(changes).length && !rubricChange) { setErr(t('bkNothing')); return; }
    if (!window.confirm(t('bkConfirm').replace('{n}', ids.length))) return;
    setBusy(true); setErr('');
    let r = { ok: true, data: { updated: ids.length } };
    if (Object.keys(changes).length) r = await call('/talks/bulk', { method: 'POST', body: JSON.stringify({ ids, changes, bandsMode: v.bandsMode }) });
    if (r.ok && rubricChange) { const x = await call('/studio/kids/rubrics/bulk', { method: 'POST', body: JSON.stringify({ ids, rubricIds: kr.ids, mode: kr.mode }) }); if (!x.ok) r = x; }
    setBusy(false);
    if (r.ok) onDone(r.data.updated ?? ids.length); else setErr(r.data?.error || t('errGeneric'));
  };

  const row = (k, label, control) => (
    <div className={on[k] ? 'bk-row on' : 'bk-row'}>
      <label className="bk-check"><input type="checkbox" checked={Boolean(on[k])} onChange={() => toggle(k)} /> {label}</label>
      <div className="bk-control">{control}</div>
    </div>
  );
  return (
    <section className="bk-panel" aria-label={t('bkEdit')}>
      <h2>{t('bkEdit')} — {t('bkSelected').replace('{n}', ids.length)}</h2>
      <p className="meta small">{t('bkHelp')}</p>
      {row('access', t('access'), (
        <select value={v.access} onChange={(e) => set('access', e.target.value)}><option value="free">{t('free')}</option><option value="premium">{t('premium')}</option></select>
      ))}
      {row('categoryId', t('bkCategory'), (
        <select value={v.categoryId} onChange={(e) => set('categoryId', e.target.value)}>
          <option value="">{t('bkNoCategory')}</option>
          {cats.map((c) => <option key={c.id} value={c.id}>{c.fullName || c.name}</option>)}
        </select>
      ))}
      {row('formatId', t('fmtLabel'), (
        <select value={v.formatId} onChange={(e) => set('formatId', e.target.value)}>
          <option value="">—</option>
          {formats.map((f) => <option key={f.id} value={f.id}>{fmtLabel(f)}</option>)}
        </select>
      ))}
      {row('level', t('lvLabel'), (
        <select value={v.level} onChange={(e) => set('level', e.target.value)}>
          <option value="">{t('lvAll')}</option>
          {LEVELS.map((l) => <option key={l} value={l}>{levelLabel(l, t)}</option>)}
        </select>
      ))}
      {row('publication', t('bkPublication'), (
        <select value={v.publication} onChange={(e) => set('publication', e.target.value)}><option value="published">{t('bkPublished')}</option><option value="draft">{t('bkDraft')}</option></select>
      ))}
      {row('speaker', t('dSpeaker'), <input type="text" maxLength={200} value={v.speaker} onChange={(e) => set('speaker', e.target.value)} />)}
      {row('kidsBands', 'Kids', (
        <div className="bk-kids">
          <select value={v.bandsMode} onChange={(e) => set('bandsMode', e.target.value)}>
            <option value="replace">{t('bkKidsReplace')}</option><option value="add">{t('bkKidsAdd')}</option><option value="remove">{t('bkKidsRemove')}</option>
          </select>
          {BANDS.map((b) => {
            const sel = v.kidsBands.includes(b);
            return <button key={b} type="button" className={sel ? 'pill on' : 'pill'} aria-pressed={sel}
              onClick={() => set('kidsBands', BANDS.filter((x) => (x === b ? !sel : v.kidsBands.includes(x))))}>{sel ? '✓ ' : ''}{bandLabel(b, t)}</button>;
          })}
        </div>
      ))}
      {rubrics && rubrics.length > 0 && row('kidRubrics', t('krPick'), (
        <div className="bk-kids">
          <select value={kr.mode} onChange={(e) => { setKr({ ...kr, mode: e.target.value }); setOn((o) => ({ ...o, kidRubrics: true })); }}>
            <option value="add">{t('krBulkAdd')}</option><option value="replace">{t('krBulkReplace')}</option><option value="remove">{t('krBulkRemove')}</option>
          </select>
          {rubrics.map((r) => { const sel = kr.ids.includes(r.id); return (
            <button key={r.id} type="button" className={sel ? 'pill on' : 'pill'} aria-pressed={sel}
              onClick={() => { setKr({ ...kr, ids: sel ? kr.ids.filter((x) => x !== r.id) : [...kr.ids, r.id] }); setOn((o) => ({ ...o, kidRubrics: true })); }}>{sel ? '✓ ' : ''}{r.emoji} {rubricName(r, locale)}</button>
          ); })}
        </div>
      ))}
      {row('showAdults', t('txShowAdults'), (
        <select value={v.showAdults ? '1' : '0'} onChange={(e) => set('showAdults', e.target.value === '1')}><option value="1">{t('bkYes')}</option><option value="0">{t('bkNo')}</option></select>
      ))}
      {err && <p className="error" role="alert">{err}</p>}
      <div className="panel-actions">
        <button type="button" className="btn" disabled={busy} onClick={apply}>{t('bkApply').replace('{n}', ids.length)}</button>
        <button type="button" className="btn ghost" disabled={busy} onClick={onCancel}>{t('cancelBtn')}</button>
      </div>
    </section>
  );
}
