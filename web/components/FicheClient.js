'use client';
// Amélioration 3.3 — Fiche imprimable d'une vidéo : titre, intervenant, résumé, points clés, chapitres et notes personnelles du membre.
// « Imprimer » ouvre la fenêtre d'impression du navigateur : « Enregistrer au format PDF » donne le PDF (aucun fichier fabriqué par le serveur).
// Mêmes droits que la page de la vidéo : sans accès complet (vidéo réservée aux abonnés), seul le résumé d'aperçu est repris, jamais les chapitres.
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useApp } from './Providers';
import { clock } from '../lib/clock';

const nf = (locale) => (locale === 'ar' ? 'ar-u-nu-latn' : locale);

export default function FicheClient({ id }) {
  const { t, locale, call, user, feat, appName } = useApp();
  const [talk, setTalk] = useState(undefined);   // undefined = chargement, null = introuvable
  const [ins, setIns] = useState(null);
  const [notes, setNotes] = useState([]);

  useEffect(() => {
    let off = false;
    call(`/talks/${id}`).then((r) => { if (!off) setTalk(r.ok ? r.data : null); });
    return () => { off = true; };
  }, [id, call]);

  useEffect(() => {
    if (!talk || !talk.playbackToken) return undefined;
    let off = false;
    fetch(`/api/talks/${id}/insights?lang=${encodeURIComponent(locale)}&t=${encodeURIComponent(talk.playbackToken)}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => { if (!off) setIns(d || { summary: '', keyPoints: [], chapters: [] }); })
      .catch(() => { if (!off) setIns({ summary: '', keyPoints: [], chapters: [] }); });
    return () => { off = true; };
  }, [talk, id, locale]);

  useEffect(() => {
    if (!user || !feat('notes')) return;
    call(`/talks/${id}/notes`).then((r) => r.ok && setNotes(r.data));
  }, [id, user, feat, call]);

  if (talk === undefined) return <p className="meta" role="status">…</p>;
  if (talk === null) return <p className="meta">{t('errGeneric')}</p>;

  const locked = Boolean(talk.locked);
  const minutes = talk.durationSeconds ? `${Math.max(1, Math.round(talk.durationSeconds / 60))} ${t('minutes')}` : '';
  const day = new Intl.DateTimeFormat(nf(locale), { day: 'numeric', month: 'long', year: 'numeric' }).format(new Date());
  const empty = ins && !ins.summary && !(ins.keyPoints || []).length && !(ins.chapters || []).length;
  const written = notes.filter((n) => n.body);
  const marks = notes.filter((n) => !n.body);

  return (
    <article className="fc">
      <div className="fc-bar fc-noprint">
        <Link className="btn ghost" href={`/talks/${id}`}>← {t('fcBack')}</Link>
        <button type="button" className="btn" onClick={() => window.print()}>{t('fcPrint')}</button>
      </div>
      <p className="meta small fc-noprint">{t('fcHint')}</p>

      <div className="fc-head">
        <p className="fc-kicker">{t('fcTitle')}</p>
        <h1>{talk.title}</h1>
        <p className="meta">{[talk.speaker, talk.category, minutes].filter(Boolean).join(' · ')}</p>
      </div>

      {locked && <p className="fc-note">{t('fcLocked')}</p>}
      {ins === null && !locked && <p className="meta" role="status">…</p>}
      {empty && <p className="meta">{t('fcNone')}</p>}

      {ins && ins.summary ? <section><h2>{t('summary')}</h2><p className="fc-summary">{ins.summary}</p></section> : null}
      {ins && (ins.keyPoints || []).length > 0 && (
        <section><h2>{t('keyPoints')}</h2><ul>{ins.keyPoints.map((p, i) => <li key={i}>{p}</li>)}</ul></section>
      )}
      {ins && (ins.chapters || []).length > 0 && (
        <section><h2>{t('chapters')}</h2>
          <ol className="fc-chapters">{ins.chapters.map((c, i) => <li key={i}><b dir="ltr">{clock(c.s)}</b> <span>{c.t}</span></li>)}</ol>
        </section>
      )}
      {user && feat('notes') && (written.length > 0 || marks.length > 0) && (
        <section><h2>{t('fcNotes')}</h2>
          <ul className="fc-notes">
            {written.map((n) => <li key={n.id}><b dir="ltr">{clock(n.positionMs)}</b> <span>{n.body}</span></li>)}
            {marks.map((n) => <li key={n.id} className="fc-mark"><b dir="ltr">{clock(n.positionMs)}</b> <span>{t('fcBookmark')}</span></li>)}
          </ul>
        </section>
      )}

      <p className="meta small fc-foot">{t('fcFooter').replace('{date}', day).replace('{site}', appName)}</p>
    </article>
  );
}
