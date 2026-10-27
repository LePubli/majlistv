'use client';
// Mon apprentissage → « Cartes » (étape 38) : séance de cartes mémoire recto/verso, tirées des questions de quiz validées.
// Accueil (compteurs) → séance (question, « voir la réponse », « je savais » / « à revoir ») → bilan.
// Les cartes ratées reviennent une fois en fin de séance. Le calendrier (1, 3, 7, 21 jours) est tenu par le serveur.
import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useApp } from './Providers';
import { requeue, replayHref } from '../lib/memoryCards';

export default function MemoryCards({ onCount }) {
  const { t, call } = useApp();
  const [data, setData] = useState(null);
  const [err, setErr] = useState('');
  const [mode, setMode] = useState('home'); // home | play | done
  const [queue, setQueue] = useState([]);
  const [total, setTotal] = useState(0);
  const [retried, setRetried] = useState(new Set());
  const [flipped, setFlipped] = useState(false);
  const [res, setRes] = useState({ known: 0, again: 0, mastered: 0 });
  const [busy, setBusy] = useState(false);
  const [free, setFree] = useState(false);
  const flipRef = useRef(null);
  const knownRef = useRef(null);

  const load = useCallback(async (isFree = false) => {
    const r = await call(`/me/cards${isFree ? '?free=1' : ''}`);
    if (!r.ok) { setErr(t('mcErr')); return null; }
    setErr(''); setData(r.data);
    if (!isFree && onCount) onCount(r.data.counts.due + r.data.counts.newAvailable);
    return r.data;
  }, [call, t, onCount]);
  useEffect(() => { load(); }, [load]);

  // Le focus suit la séance : bouton « voir la réponse », puis « je savais ».
  useEffect(() => { if (mode === 'play') (flipped ? knownRef : flipRef).current?.focus(); }, [mode, flipped, queue]);

  const start = async (isFree) => {
    const d = await load(isFree);
    if (!d || !d.session.cards.length) return;
    setFree(isFree); setQueue(d.session.cards); setTotal(d.session.cards.length); setRetried(new Set());
    setFlipped(false); setRes({ known: 0, again: 0, mastered: 0 }); setMode('play');
  };

  const answer = async (known) => {
    if (busy) return;
    const card = queue[0];
    setBusy(true);
    const r = await call(`/me/cards/${card.id}/answer`, { method: 'POST', body: JSON.stringify({ known }) });
    setBusy(false);
    if (!r.ok) { setErr(t('mcErr')); return; }
    setErr('');
    setRes((x) => ({ known: x.known + (known ? 1 : 0), again: x.again + (known ? 0 : 1), mastered: x.mastered + (r.data.mastered && known ? 1 : 0) }));
    const n = requeue(queue, card, known, retried);
    setRetried(n.retried); setQueue(n.queue); setFlipped(false);
    if (!n.queue.length) { setMode('done'); load(); }
  };

  if (!data) return err ? <p className="error" role="alert">{err}</p> : <p className="meta">…</p>;
  const c = data.counts;

  if (mode === 'play') {
    const card = queue[0];
    const all = total + retried.size; // les cartes ratées comptent une seconde fois
    const step = Math.min(all, res.known + res.again + 1);
    return (
      <section className="mc" aria-label={t('mcTitle')}>
        <div className="mc-top">
          <span className="meta" aria-live="polite">{t('mcProgress').replace('{i}', step).replace('{n}', all)}</span>
          <button type="button" className="lg-ghost" onClick={() => { setMode('home'); load(); }}>{t('mcQuit')}</button>
        </div>
        <div className="mc-bar" role="progressbar" aria-valuemin="0" aria-valuemax={all} aria-valuenow={step - 1}><span style={{ width: `${Math.round(((step - 1) / all) * 100)}%` }} /></div>
        <article className="mc-card" dir={card.lang === 'ar' ? 'rtl' : undefined} lang={card.lang}>
          <p className="mc-from">{card.isNew && <b className="mc-new">{t('mcNewBadge')}</b>} {t('mcFromTalk').replace('{t}', card.talkTitle)}</p>
          <h3 className="mc-front">{card.front}</h3>
          {flipped && (
            <div className="mc-back" aria-live="polite">
              <p className="mc-label">{t('mcAnswer')}</p>
              <p className="mc-answer">{card.answer}</p>
              {card.explanation && <><p className="mc-label">{t('mcWhy')}</p><p>{card.explanation}</p></>}
              {card.quote && <blockquote className="mc-quote"><span className="mc-label">{t('mcPassage')}</span>« {card.quote} »</blockquote>}
              <Link className="mc-replay" href={replayHref(card)} target="_blank" rel="noopener">{t('mcReplay')}</Link>
            </div>
          )}
        </article>
        {err && <p className="error" role="alert">{err}</p>}
        <div className="mc-actions">
          {!flipped ? (
            <button type="button" ref={flipRef} className="btn" onClick={() => setFlipped(true)}>{t('mcFlip')}</button>
          ) : (
            <>
              <button type="button" className="btn ghost" disabled={busy} onClick={() => answer(false)}>{t('mcAgain')}</button>
              <button type="button" ref={knownRef} className="btn" disabled={busy} onClick={() => answer(true)}>{t('mcKnown')}</button>
            </>
          )}
        </div>
        {free && <p className="meta small">{t('mcFreeNote')}</p>}
      </section>
    );
  }

  if (mode === 'done') {
    return (
      <section className="mc" aria-label={t('mcTitle')}>
        <h2>{t('mcDoneTitle')}</h2>
        <p className="lg-txt" role="status">{t('mcDoneText').replace('{k}', res.known).replace('{a}', res.again)}{res.mastered > 0 ? ` ${t('mcDoneMastered').replace('{n}', res.mastered)}` : ''}</p>
        {res.again > 0 && <p className="meta">{t('mcDoneAgain')}</p>}
        <div className="mc-actions"><button type="button" className="btn" onClick={() => { setMode('home'); load(); }}>{t('mcBack')}</button></div>
      </section>
    );
  }

  const todayN = data.session.cards.length;
  return (
    <section className="mc" aria-label={t('mcTitle')}>
      <h2>{t('mcTitle')}</h2>
      <p className="lg-txt">{t('mcIntro')}</p>
      <ul className="mc-stats">
        <li><b>{c.due}</b><span>{t('mcDue')}</span></li>
        <li><b>{c.newAvailable}</b><span>{t('mcNew')}</span></li>
        <li><b>{c.learning}</b><span>{t('mcLearning')}</span></li>
        <li><b>{c.mastered}</b><span>{t('mcMastered')}</span></li>
      </ul>
      {err && <p className="error" role="alert">{err}</p>}
      {c.total === 0 ? <p className="lg-txt">{t('mcNone')}</p> : todayN === 0 ? <p className="lg-txt">{t('mcNoneToday')}</p> : (
        <div className="mc-actions"><button type="button" className="btn" onClick={() => start(false)}>{t('mcStart').replace('{n}', todayN)}</button></div>
      )}
      {data.session.remaining > 0 && <p className="meta">{t('mcMore').replace('{n}', data.session.remaining)}</p>}
      {c.learning + c.mastered > 0 && (
        <div className="mc-free">
          <button type="button" className="lg-ghost" onClick={() => start(true)}>{t('mcFree')}</button>
          <p className="meta small">{t('mcFreeHint')}</p>
        </div>
      )}
    </section>
  );
}
