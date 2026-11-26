'use client';
// Catégories automatiques — file de relecture compacte : une ligne par proposition, filtres, sélection et traitement par lot.
// Les propositions déjà appliquées automatiquement sont repliées (un clic pour les voir et les annuler).
import { useMemo, useState } from 'react';
import Link from 'next/link';

const PAGE = 30; // vidéos affichées à la fois
const CONFS = [0, 70, 80, 90];

const row = { display: 'grid', gridTemplateColumns: 'auto minmax(0, 1fr) auto auto', gap: 10, alignItems: 'center', padding: '6px 0', borderTop: '1px solid var(--line-soft, rgba(255,255,255,.08))' };
const clamp = { display: '-webkit-box', WebkitBoxOrient: 'vertical', WebkitLineClamp: 2, overflow: 'hidden', overflowWrap: 'anywhere', margin: 0 };

function Conf({ n, t }) {
  const hi = n >= 85;
  return <span className="pill" title={t('acConfidence')} style={{ fontWeight: 700, color: hi ? '#8fd0ad' : undefined }}>{n} %</span>;
}

// Boutons qui demandent une confirmation en deux temps (évite le clic de trop sur un lot).
function Confirm({ label, confirmLabel, disabled, onGo, primary }) {
  const [ask, setAsk] = useState(false);
  if (!ask) return <button type="button" className={primary ? 'btn' : 'btn ghost'} disabled={disabled} onClick={() => setAsk(true)}>{label}</button>;
  return (
    <span style={{ display: 'inline-flex', gap: 6 }}>
      <button type="button" className="btn" onClick={() => { setAsk(false); onGo(); }}>{confirmLabel}</button>
      <button type="button" className="btn ghost" onClick={() => setAsk(false)}>×</button>
    </span>
  );
}

export default function AutoCatReview({ items, applied, t, call, reload }) {
  const [sel, setSel] = useState(() => new Set());
  const [min, setMin] = useState(0);
  const [kind, setKind] = useState('all');
  const [q, setQ] = useState('');
  const [shown, setShown] = useState(PAGE);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState(null);

  const needle = q.trim().toLowerCase();
  const list = useMemo(() => items.filter((x) => x.confidence >= min && (kind === 'all' || x.catalogue === kind)
    && (!needle || x.talkTitle.toLowerCase().includes(needle) || x.category.toLowerCase().includes(needle))), [items, min, kind, needle]);
  const groups = useMemo(() => {
    const out = [];
    for (const x of list) {
      const g = out.find((y) => y.talkId === x.talkId);
      if (g) g.items.push(x); else out.push({ talkId: x.talkId, title: x.talkTitle, items: [x] });
    }
    return out;
  }, [list]);
  const visible = groups.slice(0, shown);
  const visibleIds = list.map((x) => x.id); // « tout sélectionner » prend toutes les propositions filtrées, pas seulement celles affichées
  const chosen = visibleIds.filter((id) => sel.has(id));
  const allChosen = visibleIds.length > 0 && chosen.length === visibleIds.length;

  const toggle = (ids, on) => setSel((p) => { const n = new Set(p); for (const id of ids) { if (on) n.add(id); else n.delete(id); } return n; });

  const bulk = async (ids, action) => {
    if (!ids.length) return;
    setBusy(true); setMsg(null);
    let done = 0; let skipped = 0;
    for (let i = 0; i < ids.length; i += 300) { // l'API traite 300 propositions au plus par appel
      const r = await call('/studio/categories-suggest/bulk', { method: 'POST', body: JSON.stringify({ ids: ids.slice(i, i + 300), action }) });
      if (!r.ok) { setBusy(false); setMsg({ ok: false, text: r.data?.error || t('acError') }); reload(); return; }
      done += r.data.done; skipped += r.data.skipped.length;
    }
    setBusy(false);
    setMsg({ ok: true, text: t('ac2BulkDone').replace('{n}', done) + (skipped ? t('ac2BulkSkipped').replace('{n}', skipped) : '') });
    setSel(new Set());
    reload();
  };

  const talks = new Set(items.map((x) => x.talkId)).size;
  return (
    <>
      <p className="meta" role="status"><b>{t('ac2Summary').replace('{p}', items.length).replace('{v}', talks)}</b> · {t('ac2Hint')}</p>

      {items.length > 0 && (
        <div className="panel" style={{ display: 'grid', gap: 10, position: 'sticky', top: 0, zIndex: 5 }}>
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
            <label className="meta small">{t('ac2MinConf')}{' '}
              <select value={min} onChange={(e) => { setMin(Number(e.target.value)); setShown(PAGE); }}>
                {CONFS.map((c) => <option key={c} value={c}>{c ? `${c} % +` : t('ac2All')}</option>)}
              </select>
            </label>
            <label className="meta small">{t('ac2Catalogue')}{' '}
              <select value={kind} onChange={(e) => { setKind(e.target.value); setShown(PAGE); }}>
                <option value="all">{t('ac2All')}</option><option value="adult">{t('ac2Adults')}</option><option value="kids">Kids</option>
              </select>
            </label>
            <input type="search" value={q} onChange={(e) => { setQ(e.target.value); setShown(PAGE); }} placeholder={t('ac2Search')} aria-label={t('ac2Search')} style={{ flex: '1 1 180px', minWidth: 0 }} />
          </div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
            <label className="db-check"><input type="checkbox" checked={allChosen} onChange={() => toggle(visibleIds, !allChosen)} /><span>{t('ac2SelectShown').replace('{n}', visibleIds.length)}</span></label>
            <Confirm primary disabled={busy || !chosen.length} label={t('ac2AcceptSel').replace('{n}', chosen.length)} confirmLabel={t('ac2Confirm').replace('{n}', chosen.length)} onGo={() => bulk(chosen, 'accept')} />
            <Confirm disabled={busy || !chosen.length} label={t('ac2RejectSel').replace('{n}', chosen.length)} confirmLabel={t('ac2Confirm').replace('{n}', chosen.length)} onGo={() => bulk(chosen, 'reject')} />
          </div>
          {msg && <p className={msg.ok ? 'ok-msg' : 'error'} role="status" style={{ margin: 0 }}>{msg.text}</p>}
        </div>
      )}

      {items.length > 0 && groups.length === 0 && <p className="meta">{t('ac2NoMatch')}</p>}

      {visible.map((g) => {
        const ids = g.items.map((x) => x.id);
        const all = ids.every((id) => sel.has(id));
        return (
          <section key={g.talkId} className="panel" style={{ padding: '10px 14px' }}>
            <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
              <input type="checkbox" checked={all} onChange={() => toggle(ids, !all)} aria-label={`${t('acSelect')} : ${g.title}`} />
              <b style={{ flex: '1 1 200px', minWidth: 0, overflowWrap: 'anywhere' }} dir="auto">{g.title}</b>
              <button type="button" className="btn ghost" disabled={busy} onClick={() => bulk(ids, 'accept')}>{t('ac2AcceptAll')}</button>
              <button type="button" className="btn ghost" disabled={busy} onClick={() => bulk(ids, 'reject')}>{t('ac2RejectAll')}</button>
              <Link className="link u meta small" href={`/studio/${g.talkId}/content?tab=categories`}>{t('acOpenTab')}</Link>
            </div>
            {g.items.map((x) => (
              <div key={x.id} style={row}>
                <input type="checkbox" checked={sel.has(x.id)} onChange={() => toggle([x.id], !sel.has(x.id))} aria-label={`${t('acSelect')} : ${x.category}`} />
                <div style={{ minWidth: 0 }}>
                  <b dir="auto" style={{ overflowWrap: 'anywhere' }}>{x.category}</b>
                  {x.reason && <p className="meta small" style={clamp} title={x.reason} dir="auto">{x.reason}</p>}
                </div>
                <Conf n={x.confidence} t={t} />
                <span style={{ display: 'inline-flex', gap: 6 }}>
                  <button type="button" className="btn" disabled={busy} onClick={() => bulk([x.id], 'accept')} aria-label={`${t('acAccept')} : ${x.category}`}>✓</button>
                  <button type="button" className="btn ghost" disabled={busy} onClick={() => bulk([x.id], 'reject')} aria-label={`${t('acReject')} : ${x.category}`}>✕</button>
                </span>
              </div>
            ))}
          </section>
        );
      })}
      {groups.length > shown && <button type="button" className="btn ghost" onClick={() => setShown((n) => n + PAGE)}>{t('ac2More').replace('{n}', Math.min(PAGE, groups.length - shown))}</button>}

      {applied.length > 0 && (
        <details className="panel" style={{ padding: '10px 14px' }}>
          <summary><b>{t('ac2AppliedSummary').replace('{n}', applied.length)}</b></summary>
          <p className="meta small">{t('acAppliedIntro')}</p>
          {applied.map((x) => (
            <div key={x.id} style={row}>
              <span aria-hidden="true">✓</span>
              <div style={{ minWidth: 0 }}>
                <b dir="auto" style={{ overflowWrap: 'anywhere' }}>{x.category}</b>
                <p className="meta small" style={clamp} dir="auto"><Link className="link u" href={`/studio/${x.talkId}/content?tab=categories`}>{x.talkTitle}</Link></p>
              </div>
              <Conf n={x.confidence} t={t} />
              <button type="button" className="btn ghost" disabled={busy} onClick={() => bulk([x.id], 'undo')}>{t('acUndo')}</button>
            </div>
          ))}
        </details>
      )}
    </>
  );
}
