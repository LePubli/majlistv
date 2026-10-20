'use client';
// Sélecteur de chaîne FACULTATIF pour une conférence, une série ou un import : il remplit le champ « Intervenant » avec la graphie
// qui rattache l'élément à la chaîne choisie. « Aucune chaîne » vide le champ : une vidéo n'a jamais l'obligation d'avoir une chaîne.
// Rien ne s'affiche si la personne n'a aucune chaîne (ou si le module Chaînes est éteint) : le champ libre reste alors seul.
import { useEffect, useState } from 'react';

export default function ChannelPicker({ value, onChange, t, call }) {
  const [list, setList] = useState([]);
  useEffect(() => {
    let alive = true;
    call('/studio/channels').then((r) => { if (alive && r.ok) setList(r.data.channels || []); }).catch(() => {});
    return () => { alive = false; };
  }, [call]);
  if (list.length === 0) return null;
  const cur = list.find((c) => c.keyName.trim().toLowerCase() === String(value || '').trim().toLowerCase());
  return (
    <label className="fld ch-picker"><span>{t('chPickLabel')}</span>
      <select value={cur ? cur.slug : ''} onChange={(e) => onChange(list.find((c) => c.slug === e.target.value)?.keyName || '')}>
        <option value="">{t('chPickNone')}</option>
        {list.map((c) => <option key={c.slug} value={c.slug}>{c.name}</option>)}
      </select>
      <small className="meta">{t('chPickHelp')}</small>
    </label>
  );
}
