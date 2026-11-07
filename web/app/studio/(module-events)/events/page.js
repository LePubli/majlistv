'use client';
// Studio → Événements en direct : créer, modifier, publier, annuler, rattacher la rediffusion.
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useApp } from '../../../../components/Providers';
import StudioTabs from '../../../../components/StudioTabs';
import { evDate } from '../../../../components/EventBits';
import { fromLocalInput, toLocalInput } from '../../../../lib/events';

const LANGS = ['fr', 'en', 'ar'];
const blank = () => { const d = new Date(Date.now() + 7 * 86400000); d.setMinutes(0, 0, 0); return { title: '', speaker: '', description: '', language: 'fr', url: '', start: toLocalInput(d.toISOString()), durationMinutes: 60, status: 'draft', talkId: '' }; };

export default function StudioEvents() {
  const { t, call, locale } = useApp();
  const [list, setList] = useState(null);
  const [talks, setTalks] = useState([]);
  const [f, setF] = useState(null); // formulaire ouvert : { id?, … }
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');
  const load = () => call('/studio/events').then((r) => setList(r.ok ? r.data : []));
  useEffect(() => { load(); call('/me/talks').then((r) => r.ok && setTalks(r.data)); }, []); // eslint-disable-line react-hooks/exhaustive-deps
  const edit = (e) => { setMsg(''); setF({ id: e.id, title: e.title, speaker: e.speaker, description: e.description, language: e.language, url: e.url, start: toLocalInput(e.startsAt), durationMinutes: e.durationMinutes, status: e.status, talkId: e.talkId || '' }); };
  const set = (k) => (e) => setF((x) => ({ ...x, [k]: k === 'durationMinutes' ? Number(e.target.value) : e.target.value }));
  const save = async (e) => {
    e.preventDefault(); setBusy(true); setMsg('');
    const body = { title: f.title, speaker: f.speaker, description: f.description, language: f.language, url: f.url, startsAt: fromLocalInput(f.start), durationMinutes: f.durationMinutes, status: f.status };
    let r = await call(f.id ? `/studio/events/${f.id}` : '/studio/events', { method: f.id ? 'PATCH' : 'POST', body: JSON.stringify(body) });
    if (r.ok && f.id) r = await call(`/studio/events/${f.id}`, { method: 'PATCH', body: JSON.stringify({ talkId: f.talkId || null }) });
    setBusy(false);
    if (!r.ok) { setMsg(r.data?.error || t('errGeneric')); return; }
    setMsg(t('evnSaved')); setF(f.id ? { ...f } : null); load();
  };
  const del = async () => {
    if (!window.confirm(t('evnConfirmDel'))) return; // eslint-disable-line no-alert
    const r = await call(`/studio/events/${f.id}`, { method: 'DELETE' });
    if (r.ok) { setF(null); load(); }
  };
  const date = (iso) => evDate(iso, locale);
  return (
    <main className="page evn-page">
      <StudioTabs group="contents" />
      <h1>{t('evnTitle')}</h1>
      {!f && <p><button type="button" className="btn" onClick={() => { setMsg(''); setF(blank()); }}>＋ {t('evnNew')}</button></p>}
      {f && (
        <form className="evn-form card" onSubmit={save}>
          <h2>{f.id ? t('evnEdit') : t('evnNew')}</h2>
          <label>{t('evnFTitle')}<input required maxLength={200} value={f.title} onChange={set('title')} /></label>
          <label>{t('evnFSpeaker')}<input maxLength={200} value={f.speaker} onChange={set('speaker')} /></label>
          <label>{t('evnFUrl')}<input required type="url" maxLength={500} value={f.url} onChange={set('url')} placeholder="https://www.youtube.com/watch?v=…" /><small className="meta">{t('evnFUrlHelp')}</small></label>
          <div className="evn-row">
            <label>{t('evnFStart')}<input required type="datetime-local" value={f.start} onChange={set('start')} /></label>
            <label>{t('evnFDur')}<input required type="number" min={5} max={600} value={f.durationMinutes} onChange={set('durationMinutes')} /></label>
            <label>{t('evnFLang')}<select value={f.language} onChange={set('language')}>{LANGS.map((l) => <option key={l} value={l}>{l.toUpperCase()}</option>)}</select></label>
            <label>{t('evnFStatus')}<select value={f.status} onChange={set('status')}><option value="draft">{t('evnStDraft')}</option><option value="published">{t('evnStPub')}</option><option value="cancelled">{t('evnStCanc')}</option></select></label>
          </div>
          <label>{t('evnFDesc')}<textarea rows={4} maxLength={4000} value={f.description} onChange={set('description')} /></label>
          {f.id && <label>{t('evnReplayPick')}<select value={f.talkId} onChange={set('talkId')}><option value="">{t('evnReplayNone')}</option>{talks.map((x) => <option key={x.id} value={x.id}>{x.title}</option>)}</select></label>}
          {msg && <p role="status" className={msg === t('evnSaved') ? 'meta' : 'err'}>{msg}</p>}
          <div className="evn-actions">
            <button type="submit" className="btn" disabled={busy}>{t('evnSave')}</button>
            <button type="button" className="btn ghost" onClick={() => setF(null)}>{t('evnClose')}</button>
            {f.id && <Link className="btn ghost" href={`/events/${f.id}`}>{t('evnPublicLink')}</Link>}
            {f.id && <button type="button" className="btn ghost danger" onClick={del}>{t('evnDelete')}</button>}
          </div>
        </form>
      )}
      {!list ? <p className="meta">…</p> : list.length === 0 ? <p className="meta">{t('evnStudioEmpty')}</p> : (
        <ul className="evn-list">
          {list.map((e) => (
            <li key={e.id} className="evn-card">
              <div className="evn-head"><span className={`evn-badge${e.status === 'published' ? ' soon' : e.status === 'cancelled' ? ' off' : ''}`}>{t(e.status === 'published' ? 'evnStPub' : e.status === 'cancelled' ? 'evnStCanc' : 'evnStDraft')}</span><span className="meta">{date(e.startsAt)}</span></div>
              <h2>{e.title}</h2>
              <p className="meta">{t('evnReminders').replace('{n}', e.reminders)}{e.talkId ? ` · ${t('evnHasReplay')}` : ''}</p>
              <div className="evn-actions"><button type="button" className="btn ghost" onClick={() => edit(e)}>{t('evnEdit')}</button></div>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
