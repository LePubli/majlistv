'use client';
// Admin → Questions IA (étape 41B) : réponses de l'assistant signalées par les membres, historique des questions, volumes et coût (jetons).
// Les questions et réponses sont gardées ask_keep_days jours (Paramètres) puis supprimées automatiquement.
import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { clock } from '../lib/clock';
import { useApp } from './Providers';

const FILTERS = [['reported', 'À traiter (signalées)'], ['refused', 'Refus'], ['answered', 'Réponses'], ['all', 'Tout']];
const STATUS = { answered: 'Répondu', not_in_talk: 'Pas dans la conférence', off_topic: 'Hors sujet', religious_ruling: 'Question religieuse (refus)' };
const when = (s) => (s ? new Date(s).toLocaleString('fr-FR', { dateStyle: 'short', timeStyle: 'short' }) : '—');
const num = (n) => Number(n || 0).toLocaleString('fr-FR');

function Stat({ label, v }) {
  return (
    <div className="ask-adm-item">
      <b>{label}</b>
      <span>{num(v.questions)} question(s) · {num(v.answered)} réponse(s) · {num(v.refused)} refus</span>
      <span className="meta small">{num(v.members)} membre(s) · {num(v.tokensIn)} jetons envoyés · {num(v.tokensOut)} reçus</span>
    </div>
  );
}

export default function AskAdmin() {
  const { call } = useApp();
  const [filter, setFilter] = useState('reported');
  const [list, setList] = useState(null);
  const [stats, setStats] = useState(null);
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState('');

  const load = useCallback(async () => {
    const [a, b] = await Promise.all([call(`/admin/ask?filter=${filter}`), call('/admin/ask/stats')]);
    if (a.ok && b.ok) { setList(a.data); setStats(b.data); setErr(''); }
    else setErr(a.status === 404 || b.status === 404 ? "Cette fonction est coupée (Admin → Fonctions → « Questions sur la conférence »)." : (a.data?.error || b.data?.error || 'Chargement impossible.'));
  }, [call, filter]);
  useEffect(() => { load(); }, [load]);

  const act = async (id, action) => {
    if (action === 'delete' && !window.confirm('Supprimer définitivement cet échange ?')) return;
    setBusy(id);
    await call(`/admin/ask/${id}/review`, { method: 'PUT', body: JSON.stringify({ action }) });
    setBusy(''); load();
  };

  if (err) return <section className="billing"><h2>Questions IA</h2><p className="meta" role="status">{err}</p></section>;
  if (!list || !stats) return <p className="meta" role="status">Chargement…</p>;
  const eng = stats.engine;
  return (
    <section className="billing">
      <h2>Questions IA</h2>
      <p className="meta small">
        Moteur actuel : <b>{eng.ready ? `${eng.provider === 'deepseek' ? 'DeepSeek' : 'Claude'} (${eng.model})` : 'aucun (clé manquante)'}</b> · plafond {stats.limits.dailyMax} question(s) par membre et par jour, {num(stats.limits.globalDailyMax)} pour tout le site. Réglages : <Link className="link u" href="/admin?tab=settings">Paramètres → Questions sur la conférence</Link>.
      </p>
      <div className="ask-adm-grid">
        <Stat label="Aujourd'hui" v={stats.today} />
        <Stat label="7 derniers jours" v={stats.week} />
        <Stat label="30 derniers jours" v={stats.month} />
      </div>
      {stats.byModel.length > 0 && <p className="meta small">Par modèle (30 j) : {stats.byModel.map((m) => `${m.model} — ${num(m.questions)} q., ${num(m.tokensIn)} + ${num(m.tokensOut)} jetons`).join(' · ')}</p>}
      {stats.topTalks.length > 0 && <p className="meta small">Conférences les plus questionnées (30 j) : {stats.topTalks.map((t) => <span key={t.id}><Link className="link u" href={`/talks/${t.id}`}>{t.title}</Link> ({t.n}) </span>)}</p>}
      <p className="meta small">Le prix dépend du modèle et de ton contrat : les jetons ci-dessus sont à multiplier par le tarif de ton fournisseur.</p>

      <div className="tablist" role="tablist" aria-label="Filtre">
        {FILTERS.map(([k, label]) => (
          <button key={k} type="button" role="tab" aria-selected={filter === k} className={filter === k ? 'tab on' : 'tab'} onClick={() => setFilter(k)}>
            {label}{k === 'reported' && list.reportedOpen ? ` (${list.reportedOpen})` : ''}
          </button>
        ))}
      </div>
      {list.items.length === 0 ? <p className="meta" role="status">{filter === 'reported' ? '✓ Aucune réponse signalée à traiter.' : 'Rien à afficher.'}</p> : (
        <ul className="nf-list" style={{ display: 'grid', gap: 12 }}>
          {list.items.map((x) => (
            <li key={x.id} className="ask-adm-item">
              <div className="meta small">{when(x.createdAt)} · {x.userName} ({x.userEmail}) · <Link className="link u" href={`/talks/${x.talkId}`}>{x.talkTitle}</Link> · {STATUS[x.status] || x.status} · {x.model} · {num(x.tokensIn)}+{num(x.tokensOut)} jetons</div>
              <p><b>Question :</b> {x.question}</p>
              <p><b>Réponse :</b> {x.answer}</p>
              {x.sources.map((s, i) => <blockquote key={i}>« {s.text} » <span className="meta small">({clock(s.startMs)})</span></blockquote>)}
              {x.reportedAt && <p className="meta small">⚑ Signalée le {when(x.reportedAt)}{x.reportReason ? ` : « ${x.reportReason} »` : ''}{x.reviewedAt ? ` · traitée le ${when(x.reviewedAt)}` : ''}</p>}
              <div className="ask-actions">
                {x.reportedAt && !x.reviewedAt && <button type="button" className="btn small" disabled={busy === x.id} onClick={() => act(x.id, 'ok')}>Marquer comme traitée</button>}
                <button type="button" className="btn ghost small" disabled={busy === x.id} onClick={() => act(x.id, 'delete')}>Supprimer l'échange</button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
