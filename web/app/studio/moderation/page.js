'use client';
// Étape 20 — Modération (modérateurs et administrateurs) : conférences à relire et signalements des spectateurs.
// Chaque décision est enregistrée dans le journal des actions. Écran interne, en français.
import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useApp } from '../../../components/Providers';

const REASON = { copyright: "Droits d'auteur", inappropriate: 'Contenu inapproprié', misleading: 'Trompeur ou erroné', doctrinal: 'Contenu doctrinal douteux', technical: 'Problème technique', other: 'Autre' };
const when = (d) => (d ? new Date(d).toLocaleString('fr-FR', { dateStyle: 'short', timeStyle: 'short' }) : '—');
const clock = (s) => (s ? `${Math.floor(s / 60)} min` : '');

function Review({ item, call, onDone }) {
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(null);
  const decide = async (decision) => {
    if (decision === 'reject' && note.trim().length < 5) { setErr('Expliquez le motif du refus (5 caractères au moins).'); return; }
    setBusy(true); setErr(null);
    const r = await call(`/moderation/talks/${item.id}/decision`, { method: 'POST', body: JSON.stringify({ decision, note }) });
    setBusy(false);
    if (!r.ok) { setErr(r.data?.error || 'Erreur'); return; }
    onDone();
  };
  return (
    <li className="md-item">
      <div className="md-head">
        <Link href={`/talks/${item.id}`} target="_blank" className="md-title">{item.title}</Link>
        <span className="meta small">{[item.speaker, item.source === 'upload' ? 'Vidéo envoyée' : item.source, clock(item.durationSeconds), item.access === 'premium' ? 'Premium' : 'Gratuit'].filter(Boolean).join(' · ')}</span>
        <span className="meta small">Organisateur : {item.organizerName} ({item.organizerEmail}) · soumise le {when(item.submittedAt)}{item.openReports > 0 ? ` · ${item.openReports} signalement(s) ouvert(s)` : ''}</span>
        {item.reviewStatus === 'rejected' && <span className="meta small">Refusée le {when(item.reviewedAt)} : {item.reviewNote}</span>}
      </div>
      <label className="fld"><span>Message à l'organisateur (obligatoire pour un refus)</span>
        <textarea rows={2} maxLength={1000} value={note} onChange={(e) => setNote(e.target.value)} />
      </label>
      {err && <p className="error" role="alert">{err}</p>}
      <div className="panel-actions">
        <button type="button" className="btn" disabled={busy} onClick={() => decide('approve')}>Valider et mettre en ligne</button>
        {item.reviewStatus === 'pending' && <button type="button" className="btn ghost" disabled={busy} onClick={() => decide('reject')}>Refuser</button>}
      </div>
    </li>
  );
}

function Report({ r, call, onDone }) {
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(null);
  const act = async (action) => {
    if (action === 'unpublish' && note.trim().length < 5) { setErr("Expliquez le motif du retrait à l'organisateur (5 caractères au moins)."); return; }
    if (action === 'unpublish' && !window.confirm('Retirer cette conférence du site ?')) return;
    setBusy(true); setErr(null);
    const x = await call(`/moderation/reports/${r.id}/resolve`, { method: 'POST', body: JSON.stringify({ action, note }) });
    setBusy(false);
    if (!x.ok) { setErr(x.data?.error || 'Erreur'); return; }
    onDone();
  };
  return (
    <li className="md-item">
      <div className="md-head">
        <Link href={`/talks/${r.talkId}`} target="_blank" className="md-title">{r.title}</Link>
        <span className="meta small"><b>{REASON[r.reason] || r.reason}</b> · {when(r.createdAt)} · {r.reporterEmail || 'visiteur sans compte'}{r.openOnTalk > 1 ? ` · ${r.openOnTalk} signalements ouverts sur cette conférence` : ''}</span>
        {r.details && <p className="md-details">{r.details}</p>}
        {r.reviewStatus === 'rejected' && <span className="meta small">Cette conférence est déjà retirée du site.</span>}
      </div>
      <label className="fld"><span>Note (obligatoire pour un retrait ; envoyée à l'organisateur dans ce cas)</span>
        <textarea rows={2} maxLength={1000} value={note} onChange={(e) => setNote(e.target.value)} />
      </label>
      {err && <p className="error" role="alert">{err}</p>}
      <div className="panel-actions">
        <button type="button" className="btn ghost" disabled={busy} onClick={() => act('dismiss')}>Classer sans suite</button>
        <button type="button" className="btn ghost" disabled={busy} onClick={() => act('resolve')}>Réglé (sans retrait)</button>
        {r.reviewStatus !== 'rejected' && <button type="button" className="btn" disabled={busy} onClick={() => act('unpublish')}>Retirer la conférence</button>}
      </div>
    </li>
  );
}

export default function Moderation() {
  const { call, user, ready } = useApp();
  const [tab, setTab] = useState('pending');
  const [sum, setSum] = useState(null);
  const [items, setItems] = useState(null);
  const staff = user && ['moderator', 'admin'].includes(user.role);
  const load = useCallback(async () => {
    setItems(null);
    const [s, l] = await Promise.all([
      call('/moderation/summary'),
      call(tab === 'pending' || tab === 'rejected' ? `/moderation/queue?status=${tab}` : `/moderation/reports?status=${tab === 'handled' ? 'handled' : 'open'}`),
    ]);
    if (s.ok) setSum(s.data);
    setItems(l.ok ? l.data.items : []);
  }, [call, tab]);
  useEffect(() => { if (staff) load(); }, [staff, load]);
  if (!ready || !user) return null;
  if (!staff) return <main className="studio-page"><p>Cette page est réservée à l'équipe de modération.</p></main>;
  const tabs = [['pending', `À relire${sum ? ` (${sum.pending})` : ''}`], ['reports', `Signalements${sum ? ` (${sum.reports})` : ''}`], ['rejected', 'Refusées'], ['handled', 'Signalements traités']];
  return (
    <main className="studio-page studio-narrow">
      <h1 className="studio-title">Modération</h1>
      <p className="meta">Toutes vos décisions sont enregistrées dans le journal des actions.</p>
      <div className="pills tabs" role="tablist">
        {tabs.map(([k, label]) => <button key={k} type="button" role="tab" aria-selected={tab === k} className={tab === k ? 'pill on' : 'pill'} onClick={() => setTab(k)}>{label}</button>)}
      </div>
      {items === null && <p className="meta">…</p>}
      {items && items.length === 0 && <p className="meta">Rien à traiter ici.</p>}
      {items && items.length > 0 && (
        <ul className="md-list">
          {(tab === 'pending' || tab === 'rejected') && items.map((x) => <Review key={x.id} item={x} call={call} onDone={load} />)}
          {tab === 'reports' && items.map((x) => <Report key={x.id} r={x} call={call} onDone={load} />)}
          {tab === 'handled' && items.map((x) => (
            <li key={x.id} className="md-item">
              <Link href={`/talks/${x.talkId}`} target="_blank" className="md-title">{x.title}</Link>
              <span className="meta small">{REASON[x.reason] || x.reason} · {{ dismissed: 'classé sans suite', resolved: 'réglé', actioned: 'conférence retirée' }[x.status]} par {x.handledBy || '—'} le {when(x.handledAt)}{x.note ? ` — ${x.note}` : ''}</span>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
