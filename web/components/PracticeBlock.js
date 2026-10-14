'use client';
// « Et maintenant, que faire ? » : propositions d'action tirées de la conférence. Visible par tous.
// Membre Apprentissage : il peut s'engager (intention, échéance) ; les autres peuvent lire et copier la proposition.
import { forwardRef, useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { clock } from '../lib/clock';

const dots = (n) => '●'.repeat(n);
const DUES = ['today', 'week', 'month'];

const PracticeBlock = forwardRef(function PracticeBlock({ talkId, t, call, user, onSeek, highlight }, ref) {
  const [d, setD] = useState(undefined); // undefined = chargement, null = pas d'écran pour cette conférence
  const [pick, setPick] = useState(null); // id d'une proposition, ou 'own'
  const [own, setOwn] = useState('');
  const [niyya, setNiyya] = useState('');
  const [due, setDue] = useState(null);
  const [consent, setConsent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState(null);
  const [copied, setCopied] = useState(false);

  const load = useCallback(() => call(`/talks/${talkId}/practice`).then((r) => setD(r.ok ? r.data : null)), [call, talkId]);
  useEffect(() => { setD(undefined); setPick(null); setMsg(null); load(); }, [load, user?.email]);
  if (!d) return null;

  const chosen = pick === 'own' ? own.trim() : d.suggestions.find((s) => s.id === pick)?.text || '';
  const commit = async () => {
    setBusy(true); setMsg(null);
    const body = { niyya: niyya.trim(), due, ...(pick === 'own' ? { text: own.trim() } : { suggestionId: pick }), ...(d.consent ? {} : { consent }) };
    const r = await call(`/talks/${talkId}/practice/commitments`, { method: 'POST', body: JSON.stringify(body) });
    setBusy(false);
    if (!r.ok) {
      setMsg({ ok: false, text: r.data?.code === 'consent_required' ? t('pzNeedConsent') : r.data?.error || t('errGeneric') });
      return;
    }
    setMsg({ ok: true, text: t('pzSaved') });
    setPick(null); setOwn(''); setNiyya(''); setDue(null);
    load();
  };
  const copy = async () => {
    try { await navigator.clipboard.writeText(chosen); setCopied(true); setTimeout(() => setCopied(false), 2500); } catch { /* copie non disponible : le texte reste affiché */ }
  };

  return (
    <section ref={ref} id="practice" tabIndex={-1} className={`pz-block${highlight ? ' pz-hl' : ''}`} aria-labelledby="pz-title">
      <h2 id="pz-title" className="pz-title">{t('pzTitle')}</h2>
      <p className="meta">{t('pzIntro')}</p>
      <ul className="pz-list">
        {d.suggestions.map((s) => (
          <li key={s.id}>
            <label className={`pz-item${pick === s.id ? ' on' : ''}`}>
              <input type="radio" name="pz-pick" checked={pick === s.id} onChange={() => { setPick(s.id); setMsg(null); }} />
              <span className="pz-body">
                <span className="pz-text"><span className="pz-size" title={t(`pzSize${s.size}`)} aria-label={t(`pzSize${s.size}`)}>{dots(s.size)}</span> {s.text}</span>
                {s.reference && <span className="meta small">{s.reference}</span>}
              </span>
            </label>
            {s.evidenceMs != null && onSeek && pick === s.id && (
              <button type="button" className="link u small pz-seek" onClick={() => onSeek(Math.floor(s.evidenceMs / 1000))}>▶ {t('pzReplay').replace('{m}', clock(s.evidenceMs))}</button>
            )}
          </li>
        ))}
        {d.tier && (
          <li>
            <label className={`pz-item${pick === 'own' ? ' on' : ''}`}>
              <input type="radio" name="pz-pick" checked={pick === 'own'} onChange={() => { setPick('own'); setMsg(null); }} />
              <span className="pz-body"><span className="pz-text">{t('pzWrite')}</span></span>
            </label>
            {pick === 'own' && <textarea className="pz-own" rows={2} maxLength={300} value={own} placeholder={t('pzWritePh')} aria-label={t('pzWrite')} onChange={(e) => setOwn(e.target.value)} />}
          </li>
        )}
      </ul>

      {pick && d.tier && (
        <div className="pz-commit">
          <label className="fld"><span>{t('pzNiyya')}</span>
            <textarea rows={2} maxLength={500} value={niyya} placeholder={t('pzNiyyaPh')} onChange={(e) => setNiyya(e.target.value)} /></label>
          <div className="fld" role="group" aria-label={t('pzDue')}>
            <span>{t('pzDue')}</span>
            <div className="pills">
              <button type="button" aria-pressed={due === null} className={due === null ? 'pill on' : 'pill'} onClick={() => setDue(null)}>{t('pzDueNone')}</button>
              {DUES.map((k) => <button key={k} type="button" aria-pressed={due === k} className={due === k ? 'pill on' : 'pill'} onClick={() => setDue(k)}>{t(`pzDue_${k}`)}</button>)}
            </div>
          </div>
          {!d.consent && (
            <label className="pz-consent"><input type="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)} /> <span>{t('pzConsent')}</span></label>
          )}
          <div className="panel-actions">
            <button type="button" className="btn" disabled={busy || chosen.length < 3 || (!d.consent && !consent)} onClick={commit}>{busy ? t('saving') : t('pzCommit')}</button>
          </div>
        </div>
      )}

      {pick && !d.tier && (
        <div className="pz-commit">
          <p className="pz-chosen">{chosen}</p>
          <div className="panel-actions">
            <button type="button" className="btn ghost" onClick={copy}>{copied ? t('pzCopied') : t('pzCopy')}</button>
          </div>
          <p className="meta small pz-upsell">
            {t('pzUpsell')}{' '}
            {d.signedIn ? <Link className="link u" href="/pricing">{t('pzUpsellLink')}</Link> : <Link className="link u" href="/login">{t('pzLogin')}</Link>}
          </p>
        </div>
      )}

      {msg && <p className={msg.ok ? 'ok-msg' : 'error'} role={msg.ok ? 'status' : 'alert'}>{msg.text} {msg.ok && <Link className="link u" href="/learning#engagements">{t('pzSeeMine')}</Link>}</p>}
      {d.tier && d.mine.length > 0 && (
        <p className="meta small">{t('pzMineHere').replace('{n}', d.mine.length)} <Link className="link u" href="/learning#engagements">{t('pzSeeMine')}</Link></p>
      )}
      <p className="meta small pz-note">{t('pzAiNote')}</p>
    </section>
  );
});

export default PracticeBlock;
