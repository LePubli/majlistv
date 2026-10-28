'use client';
// Étape 41 — onglet « Poser une question » de la page d'une conférence (palier Apprentissage).
// La réponse vient de l'IA, uniquement à partir de la transcription ; chaque réponse montre le passage cité avec un bouton « Revoir à mm:ss ».
import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { clock } from '../lib/clock';
import { MAX_QUESTION, errorKey, pushTurn, validQuestion } from '../lib/ask';

export default function AskPanel({ talkId, t, call, onSeek }) {
  const [info, setInfo] = useState(undefined); // undefined = chargement ; { available, reason, remaining, dailyMax } ; { locked: true }
  const [q, setQ] = useState('');
  const [turns, setTurns] = useState([]);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const end = useRef(null);

  useEffect(() => {
    let alive = true;
    setInfo(undefined); setTurns([]); setErr('');
    call(`/talks/${talkId}/ask`).then((r) => {
      if (!alive) return;
      if (r.ok) setInfo(r.data);
      else if (r.data?.code === 'learning_required') setInfo({ locked: true });
      else setInfo({ available: false, reason: r.data?.code || 'ask_unavailable' });
    });
    return () => { alive = false; };
  }, [talkId, call]);

  const send = async (e) => {
    e?.preventDefault();
    if (busy || !validQuestion(q)) return;
    setBusy(true); setErr('');
    const question = q.trim();
    const r = await call(`/talks/${talkId}/ask`, { method: 'POST', body: JSON.stringify({ question }) });
    if (r.ok) {
      setTurns((x) => pushTurn(x, { question, ...r.data }));
      setInfo((i) => ({ ...i, remaining: r.data.remaining, dailyMax: r.data.dailyMax }));
      setQ('');
      setTimeout(() => end.current?.scrollIntoView({ block: 'nearest', behavior: 'smooth' }), 50);
    } else {
      setErr(t(errorKey(r.data?.code, r.status)));
      if (r.data?.code === 'ask_quota') setInfo((i) => ({ ...i, remaining: 0 }));
    }
    setBusy(false);
  };

  if (info === undefined) return <p className="meta" role="status">{t('askLoading')}</p>;
  if (info.locked) {
    return (
      <div className="ask-box">
        <h3>{t('askTitle')}</h3>
        <p className="meta">{t('askNeedLearning')}</p>
        <Link className="btn" href="/pricing">{t('askSeeOffer')}</Link>
      </div>
    );
  }
  if (!info.available) {
    return <div className="ask-box"><h3>{t('askTitle')}</h3><p className="meta" role="status">{t(errorKey(info.reason))}</p></div>;
  }
  const out = info.remaining <= 0;
  return (
    <div className="ask-box">
      <h3>{t('askTitle')}</h3>
      <p className="meta small">{t('askIntro')}</p>
      <ul className="ask-turns" aria-live="polite">
        {turns.map((x, i) => (
          <li key={i} className="ask-turn">
            <p className="ask-q">{x.question}</p>
            <p className={`ask-a ${x.status === 'answered' ? '' : 'ask-refusal'}`}>{x.answer}</p>
            {x.sources?.length > 0 && (
              <div className="ask-src">
                <span className="meta small">{t('askSources')}</span>
                {x.sources.map((s, j) => (
                  <blockquote key={j}>
                    <p>« {s.text} »</p>
                    <button type="button" className="link u small" onClick={() => onSeek?.(Math.floor(s.startMs / 1000))}>▶ {t('askReplay').replace('{t}', clock(s.startMs))}</button>
                  </blockquote>
                ))}
              </div>
            )}
          </li>
        ))}
      </ul>
      <form className="ask-form" onSubmit={send}>
        <label className="sr-only" htmlFor="ask-q">{t('askTitle')}</label>
        <textarea id="ask-q" rows={2} maxLength={MAX_QUESTION} value={q} placeholder={t('askPlaceholder')} disabled={busy || out}
          onChange={(e) => setQ(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) send(e); }} />
        <div className="ask-bar">
          <span className="meta small">{out ? t('askQuota') : t('askRemaining').replace('{n}', info.remaining).replace('{m}', info.dailyMax)}</span>
          <button type="submit" className="btn" disabled={busy || out || !validQuestion(q)}>{busy ? t('askThinking') : t('askSend')}</button>
        </div>
      </form>
      <p className="meta small" role="status">{err || ' '}</p>
      <p className="meta small ask-note">{t('askNote')}</p>
      <div ref={end} />
    </div>
  );
}
