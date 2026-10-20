'use client';
// Administration → Rubriques Kids : créer, renommer (3 langues), changer le pictogramme, cacher, ordonner, supprimer.
import { useCallback, useEffect, useState } from 'react';
import { useApp } from '../../components/Providers';

function Row({ r, first, last, move, t, call, onChanged }) {
  const [f, setF] = useState({ fr: r.names.fr || '', en: r.names.en || '', ar: r.names.ar || '', emoji: r.emoji });
  const [msg, setMsg] = useState('');
  useEffect(() => { setF({ fr: r.names.fr || '', en: r.names.en || '', ar: r.names.ar || '', emoji: r.emoji }); }, [r]);
  const dirty = f.fr !== (r.names.fr || '') || f.en !== (r.names.en || '') || f.ar !== (r.names.ar || '') || f.emoji !== r.emoji;
  const save = async (e) => {
    e.preventDefault(); setMsg('');
    const x = await call(`/admin/kids/rubrics/${r.id}`, { method: 'PATCH', body: JSON.stringify({ names: { fr: f.fr, en: f.en, ar: f.ar }, emoji: f.emoji }) });
    if (x.ok) { setMsg(t('krSaved')); onChanged(); } else setMsg(x.data?.error || t('errGeneric'));
  };
  const toggle = async () => { const x = await call(`/admin/kids/rubrics/${r.id}`, { method: 'PATCH', body: JSON.stringify({ active: !r.active }) }); if (x.ok) onChanged(); };
  const del = async () => { if (!window.confirm(t('krDeleteAsk'))) return; const x = await call(`/admin/kids/rubrics/${r.id}`, { method: 'DELETE' }); if (x.ok) onChanged(); };
  return (
    <li className={r.active ? 'kr-row' : 'kr-row off'} data-slug={r.slug}>
      <form onSubmit={save} className="kr-form">
        <label className="fld kr-emoji"><span>{t('krEmoji')}</span><input name="emoji" maxLength={8} value={f.emoji} onChange={(e) => setF({ ...f, emoji: e.target.value })} /></label>
        <label className="fld"><span>{t('krNameFr')}</span><input name="fr" required maxLength={60} value={f.fr} onChange={(e) => setF({ ...f, fr: e.target.value })} /></label>
        <label className="fld"><span>{t('krNameEn')}</span><input name="en" maxLength={60} value={f.en} onChange={(e) => setF({ ...f, en: e.target.value })} /></label>
        <label className="fld"><span>{t('krNameAr')}</span><input name="ar" dir="rtl" maxLength={60} value={f.ar} onChange={(e) => setF({ ...f, ar: e.target.value })} /></label>
        <div className="kr-actions">
          <button className="btn" disabled={!dirty}>{t('krSave')}</button>
          <button type="button" className="btn ghost" aria-pressed={r.active} onClick={toggle}>{r.active ? t('krActive') : t('krInactive')}</button>
          <button type="button" className="btn ghost" disabled={first} onClick={() => move(-1)} aria-label={t('krUp')}>↑</button>
          <button type="button" className="btn ghost" disabled={last} onClick={() => move(1)} aria-label={t('krDown')}>↓</button>
          <button type="button" className="btn ghost danger" onClick={del}>{t('krDelete')}</button>
          <span className="meta small">{t('krTalksN').replace('{n}', r.talks ?? 0)}</span>
          {msg && <span className="meta small" role="status">{msg}</span>}
        </div>
      </form>
    </li>
  );
}

export default function RubricsAdmin() {
  const { t, call } = useApp();
  const [list, setList] = useState(null);
  const [nf, setNf] = useState({ fr: '', en: '', ar: '', emoji: '⭐' });
  const [err, setErr] = useState('');
  const load = useCallback(() => call('/admin/kids/rubrics').then((r) => setList(r.ok ? r.data : [])), [call]);
  useEffect(() => { load(); }, [load]);
  const add = async (e) => {
    e.preventDefault(); setErr('');
    const r = await call('/admin/kids/rubrics', { method: 'POST', body: JSON.stringify({ names: { fr: nf.fr, en: nf.en, ar: nf.ar }, emoji: nf.emoji || '⭐' }) });
    if (r.ok) { setNf({ fr: '', en: '', ar: '', emoji: '⭐' }); load(); } else setErr(r.data?.error || t('errGeneric'));
  };
  const move = async (i, d) => {
    const ids = list.map((x) => x.id); const j = i + d;
    [ids[i], ids[j]] = [ids[j], ids[i]];
    const r = await call('/admin/kids/rubrics/order', { method: 'PUT', body: JSON.stringify({ ids }) });
    if (r.ok) load();
  };
  if (!list) return null;
  return (
    <section className="kr-admin">
      <p className="meta">{t('krHelp')}</p>
      <ul className="kr-list">{list.map((r, i) => <Row key={r.id} r={r} first={i === 0} last={i === list.length - 1} move={(d) => move(i, d)} t={t} call={call} onChanged={load} />)}</ul>
      <form onSubmit={add} className="kr-form kr-new">
        <h2 className="panel-title">{t('krNew')}</h2>
        <label className="fld kr-emoji"><span>{t('krEmoji')}</span><input name="newEmoji" maxLength={8} value={nf.emoji} onChange={(e) => setNf({ ...nf, emoji: e.target.value })} /></label>
        <label className="fld"><span>{t('krNameFr')}</span><input name="newFr" required maxLength={60} value={nf.fr} onChange={(e) => setNf({ ...nf, fr: e.target.value })} /></label>
        <label className="fld"><span>{t('krNameEn')}</span><input name="newEn" maxLength={60} value={nf.en} onChange={(e) => setNf({ ...nf, en: e.target.value })} /></label>
        <label className="fld"><span>{t('krNameAr')}</span><input name="newAr" dir="rtl" maxLength={60} value={nf.ar} onChange={(e) => setNf({ ...nf, ar: e.target.value })} /></label>
        <div className="kr-actions"><button className="btn" disabled={!nf.fr.trim()}>{t('krAdd')}</button></div>
        {err && <p className="error" role="alert">{err}</p>}
      </form>
    </section>
  );
}
