'use client';
// Studio → fiche d'une conférence : chronologie du traitement (conversion, transcription, sous-titres, résumé, publication…).
import { useEffect, useState } from 'react';
import { langName } from './Transcript';
import { sourceLabel } from '../lib/talkState';

const TONE = { ready: 'ok', published: 'ok', failed: 'err', processing: 'run', edited: 'gold', scheduled: 'gold', draft: 'muted', pending: 'muted', unavailable: 'muted' };

export default function Timeline({ talkId, signature, t, call, locale }) {
  const [events, setEvents] = useState(null);
  const [all, setAll] = useState(false);
  // Recharge à chaque changement d'état de la conférence (signature) : la fiche se met à jour pendant le traitement.
  useEffect(() => { call(`/talks/${talkId}/studio/timeline`).then((r) => r.ok && setEvents(r.data.events)); }, [call, talkId, signature]);

  const when = (iso) => new Date(iso).toLocaleString(locale, { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
  const label = (e) => {
    if (e.kind === 'created') return t('tl_created').replace('{m}', sourceLabel(e.message) || t('fileMode'));
    if (e.kind === 'edited') return t('tl_edited_' + e.status);
    const key = `tl_${e.kind}_${e.status}`;
    return t(key)
      .replace('{l}', e.lang ? langName(e.lang, locale) : '')
      .replace('{d}', e.kind === 'publication' && e.message ? new Date(e.message).toLocaleString(locale, { dateStyle: 'medium', timeStyle: 'short' }) : '');
  };

  if (!events) return null;
  const list = all ? events : events.slice(0, 10);
  return (
    <section className="panel timeline">
      <h2 className="panel-title">{t('tl_title')}</h2>
      {events.length === 0 && <p className="meta">{t('tl_empty')}</p>}
      <ol className="tl">
        {list.map((e) => (
          <li key={e.id} className={`tone-${TONE[e.status] || 'muted'}`}>
            <i aria-hidden="true" />
            <div>
              <span className="tl-text">{label(e)}</span>
              {e.status === 'failed' && e.message && <span className="tl-msg">{e.message}</span>}
              <time dateTime={e.at}>{when(e.at)}</time>
            </div>
          </li>
        ))}
      </ol>
      {events.length > 10 && <button type="button" className="link u" onClick={() => setAll(!all)}>{all ? t('tl_less') : t('tl_more')}</button>}
    </section>
  );
}
