'use client';
// « Mes petites actions » : le parent propose, l'enfant dit « je l'ai fait », le parent valide.
//   KidActions        côté enfant (accueil, onglet Agir, fin du quiz) : liste + bouton « Je l'ai fait » (jeton enfant).
//   KidActionsParent  côté parent (page de gestion des profils) : ajout, validation, suppression (jeton parent).
import { useCallback, useEffect, useState } from 'react';
import { useApp } from './Providers';

// limit : nombre maximal d'actions affichées ; onlyOpen : masquer les actions déjà validées (accueil, fin de quiz).
export function KidActions({ limit = 100, onlyOpen = false, hideEmpty = false, title = '', onChange }) {
  const { t, call } = useApp();
  const [d, setD] = useState(null);
  const load = useCallback(() => call('/kids/actions').then((r) => { if (r.ok) setD(r.data); }), [call]);
  useEffect(() => { load(); }, [load]);
  if (!d) return null;
  const list = d.actions.filter((a) => !onlyOpen || a.status !== 'validated').slice(0, limit);
  if (hideEmpty && list.length === 0) return null;
  const claim = async (id) => { const r = await call(`/kids/actions/${id}/claim`, { method: 'POST' }); if (r.ok) { await load(); onChange && onChange(); } };
  return (
    <div className="ka-list-wrap">
      {title && <h2 className="ka-title">{title}</h2>}
      {list.length === 0 && <p className="soon">{t('kaNone')}</p>}
      <ul className="ka-list">
        {list.map((a) => (
          <li key={a.id} className={`ka-item ${a.status}`}>
            <span className="ka-box" aria-hidden="true">{a.status === 'validated' ? '✓' : a.status === 'claimed' ? '…' : ''}</span>
            <span className="ka-text"><b>{a.title}</b>
              {a.status === 'claimed' && <small>{t('kaWait')}</small>}
              {a.status === 'validated' && <small>{t('kaValidated')}</small>}
            </span>
            {a.status === 'todo' && <button type="button" className="btn ka-done" onClick={() => claim(a.id)}>{t('kaDone')}</button>}
          </li>
        ))}
      </ul>
      <p className="meta small ka-note">{t('kaParentChecks')}</p>
    </div>
  );
}

export function KidActionsParent({ profile }) {
  const { t, call } = useApp();
  const [d, setD] = useState(null);
  const [title, setTitle] = useState('');
  const [err, setErr] = useState('');
  const base = `/me/kids/profiles/${profile.id}/actions`;
  const load = useCallback(() => call(base).then((r) => { if (r.ok) setD(r.data); }), [call, base]);
  useEffect(() => { load(); }, [load]);
  const add = async (e) => {
    e.preventDefault(); setErr('');
    const r = await call(base, { method: 'POST', body: JSON.stringify({ title }) });
    if (r.ok) { setTitle(''); load(); } else setErr(r.data?.error || t('errGeneric'));
  };
  const validate = async (id) => { const r = await call(`${base}/${id}/validate`, { method: 'POST' }); if (r.ok) load(); };
  const remove = async (id) => { const r = await call(`${base}/${id}`, { method: 'DELETE' }); if (r.ok) load(); };
  const STATE = { todo: t('kaStTodo'), claimed: t('kaStClaimed'), validated: t('kaStValidated') };
  return (
    <div className="panel kd-ctrl" role="group" aria-label={t('kaParentTitle').replace('{name}', profile.name)}>
      <h3 className="panel-title">{t('kaParentTitle').replace('{name}', profile.name)}</h3>
      <p className="meta small">{t('kaParentHelp')}</p>
      <form className="ka-add" onSubmit={add}>
        <label className="fld"><span>{t('kaPropose')}</span>
          <input type="text" value={title} maxLength={120} required placeholder={t('kaPlaceholder')} onChange={(e) => setTitle(e.target.value)} /></label>
        <button className="btn" disabled={!title.trim()}>{t('kaAdd')}</button>
      </form>
      {err && <p className="error" role="alert">{err}</p>}
      {d && d.actions.length === 0 && <p className="meta">{t('kaParentNone')}</p>}
      <ul className="ka-list">
        {(d?.actions || []).map((a) => (
          <li key={a.id} className={`ka-item ${a.status}`}>
            <span className="ka-text"><b>{a.title}</b><small>{STATE[a.status]}</small></span>
            {a.status !== 'validated' && <button type="button" className="btn" onClick={() => validate(a.id)}>{t('kaValidate')}</button>}
            <button type="button" className="link u small" onClick={() => remove(a.id)}>{t('delete')}</button>
          </li>
        ))}
      </ul>
    </div>
  );
}
