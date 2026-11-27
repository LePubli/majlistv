'use client';
// Sélecteur de chaîne FACULTATIF pour une vidéo, une série ou un import : il remplit le champ « Intervenant » avec la graphie
// qui rattache l'élément à la chaîne choisie. « Aucune chaîne » vide le champ : une vidéo n'a jamais l'obligation d'avoir une chaîne.
// Dernière option : « Créer une nouvelle chaîne… » (nom à saisir, la chaîne est créée puis choisie aussitôt).
// Rien ne s'affiche si le module Chaînes est éteint (la liste ne peut pas être lue) : le champ libre reste alors seul.
import { useEffect, useState } from 'react';

const NEW = '__new__';

export default function ChannelPicker({ value, onChange, t, call }) {
  const [list, setList] = useState([]);
  const [ready, setReady] = useState(false); // la liste a pu être lue : le module Chaînes est actif
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState('');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    let alive = true;
    call('/studio/channels').then((r) => { if (alive && r.ok) { setList(r.data.channels || []); setReady(true); } }).catch(() => {});
    return () => { alive = false; };
  }, [call]);
  if (!ready) return null;
  const cur = list.find((c) => c.keyName.trim().toLowerCase() === String(value || '').trim().toLowerCase());
  const create = async () => {
    const n = name.trim();
    if (!n || busy) return;
    setBusy(true); setErr('');
    const r = await call('/studio/channels', { method: 'POST', body: JSON.stringify({ name: n }) });
    setBusy(false);
    if (!r.ok) { setErr(r.data?.error || t('errGeneric')); return; }
    const made = { slug: r.data.slug, name: r.data.name, keyName: r.data.name };
    setList((l) => [...l, made].sort((a, b) => a.name.localeCompare(b.name)));
    setCreating(false); setName('');
    onChange(made.keyName);
  };
  return (
    <div className="fld ch-picker">
      <label><span>{t('chPickLabel')}</span>
        <select value={creating ? NEW : (cur ? cur.slug : '')} onChange={(e) => {
          if (e.target.value === NEW) { setCreating(true); return; }
          setCreating(false); setErr('');
          onChange(list.find((c) => c.slug === e.target.value)?.keyName || '');
        }}>
          <option value="">{t('chPickNone')}</option>
          {list.map((c) => <option key={c.slug} value={c.slug}>{c.name}</option>)}
          <option value={NEW}>{t('chPickNew')}</option>
        </select>
      </label>
      {creating && (
        <div className="ch-new">
          <input value={name} maxLength={120} placeholder={t('chPickNewName')} aria-label={t('chPickNewName')} autoFocus
            onChange={(e) => setName(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); create(); } }} />
          <button type="button" className="btn" disabled={busy || !name.trim()} onClick={create}>{busy ? '…' : t('chPickCreate')}</button>
          <button type="button" className="btn ghost" onClick={() => { setCreating(false); setErr(''); }}>{t('chPickCancel')}</button>
        </div>
      )}
      {err && <p className="error" role="alert">{err}</p>}
      <small className="meta">{t('chPickHelp')}</small>
    </div>
  );
}
