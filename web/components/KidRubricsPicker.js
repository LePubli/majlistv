'use client';
// Rubriques Kids d'une conférence (Studio) : pastilles à cocher, enregistrées tout de suite. Rien ne s'affiche si le module Kids est éteint.
import { useEffect, useState } from 'react';
import { useApp } from './Providers';

export const rubricName = (r, locale) => r.names?.[locale] || r.names?.fr || r.slug;

// Liste des rubriques (pour les menus du Studio) ; null tant que ça charge, [] si le module Kids n'est pas disponible.
export function useRubrics(call) {
  const [list, setList] = useState(null);
  useEffect(() => { let on = true; call('/studio/kids/rubrics').then((r) => on && setList(r.ok ? r.data.filter((x) => x.active) : [])); return () => { on = false; }; }, [call]);
  return list;
}

export default function KidRubricsPicker({ talkId }) {
  const { t, call, locale } = useApp();
  const list = useRubrics(call);
  const [ids, setIds] = useState([]);
  const [msg, setMsg] = useState('');
  useEffect(() => { call(`/studio/talks/${talkId}/kid-rubrics`).then((r) => r.ok && setIds(r.data.rubricIds)); }, [call, talkId]);
  if (!list || list.length === 0) return null;
  const toggle = async (id) => {
    const next = ids.includes(id) ? ids.filter((x) => x !== id) : [...ids, id];
    setMsg('');
    const r = await call(`/studio/talks/${talkId}/kid-rubrics`, { method: 'PUT', body: JSON.stringify({ rubricIds: next }) });
    if (r.ok) setIds(r.data.rubricIds); else setMsg(r.data?.error || t('errGeneric'));
  };
  return (
    <div className="fld kr-pick" role="group" aria-label={t('krPick')}>
      <span>{t('krPick')}</span>
      <div className="pills">
        {list.map((r) => { const on = ids.includes(r.id); return (
          <button key={r.id} type="button" className={on ? 'pill on' : 'pill'} aria-pressed={on} onClick={() => toggle(r.id)}>{on ? '✓ ' : ''}{r.emoji} {rubricName(r, locale)}</button>
        ); })}
      </div>
      <span className="meta small">{t('krPickHelp')}</span>
      {msg && <span className="error" role="alert">{msg}</span>}
    </div>
  );
}
