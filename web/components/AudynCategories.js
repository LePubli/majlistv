'use client';
// Studio → Audyn : catégories gérées.
//  - AudynCategoryPicker : liste déroulante (« Sans catégorie », les catégories, « + Nouvelle catégorie… » qui ouvre un champ) ;
//    utilisée sur la fiche d'un contenu, à la création et dans l'import d'une chaîne.
//  - AudynCategoryManager : panneau « Catégories » (ajouter, renommer, supprimer ; nombre de contenus par catégorie).
// Le contenu garde le nom de sa catégorie : renommer une catégorie renomme celle de ses contenus, la supprimer les laisse sans catégorie.
import { useCallback, useEffect, useState } from 'react';
import { useApp } from './Providers';

const NEW = '__new__';

export function useAudynCategories() {
  const { call } = useApp();
  const [cats, setCats] = useState(null);
  const reload = useCallback(() => call('/studio/audyn/categories').then((r) => setCats(r.ok ? r.data.categories : [])), [call]);
  useEffect(() => { reload(); }, [reload]);
  return [cats, reload];
}

export function AudynCategoryPicker({ value, onChange, id }) {
  const { t } = useApp();
  const [cats] = useAudynCategories();
  const names = (cats || []).map((c) => c.name);
  const known = !value || names.some((n) => n.toLowerCase() === value.toLowerCase());
  const [typing, setTyping] = useState(false);
  // Catégorie inconnue de la liste (ancienne valeur) : affichée dans le champ libre.
  const free = typing || (cats !== null && !known);
  return (
    <div className="fld ay-cat-pick">
      <span id={`${id || 'ay-cat'}-l`}>{t('ayCategory')}</span>
      <select id={id || 'ay-cat'} aria-labelledby={`${id || 'ay-cat'}-l`} value={free ? NEW : (names.find((n) => n.toLowerCase() === (value || '').toLowerCase()) || '')}
        onChange={(e) => {
          if (e.target.value === NEW) { setTyping(true); onChange(''); return; }
          setTyping(false); onChange(e.target.value);
        }}>
        <option value="">{t('ayCatNone')}</option>
        {names.map((n) => <option key={n} value={n}>{n}</option>)}
        <option value={NEW}>{t('ayCatNewOpt')}</option>
      </select>
      {free && (
        <input maxLength={80} value={value || ''} onChange={(e) => onChange(e.target.value)} placeholder={t('ayCatNewPh')}
          aria-label={t('ayCatNewPh')} autoFocus={typing} dir="auto" />
      )}
    </div>
  );
}

export function AudynCategoryManager({ onChange }) {
  const { t, call } = useApp();
  const [cats, reload] = useAudynCategories();
  const [name, setName] = useState('');
  const [edit, setEdit] = useState(null); // { id, name }
  const [err, setErr] = useState('');
  const after = async (r) => {
    if (!r.ok) { setErr(r.data?.error || t('errGeneric')); return false; }
    setErr(''); await reload(); onChange?.(); return true;
  };
  const add = async (e) => {
    e.preventDefault();
    if (await after(await call('/studio/audyn/categories', { method: 'POST', body: JSON.stringify({ name: name.trim() }) }))) setName('');
  };
  const rename = async (e) => {
    e.preventDefault();
    if (await after(await call(`/studio/audyn/categories/${edit.id}`, { method: 'PATCH', body: JSON.stringify({ name: edit.name.trim() }) }))) setEdit(null);
  };
  const del = async (c) => {
    if (!confirm(t('ayCatDelAsk').replace('{name}', c.name).replace('{n}', c.count))) return;
    await after(await call(`/studio/audyn/categories/${c.id}`, { method: 'DELETE' }));
  };
  return (
    <section className="panel ay-form" data-testid="audyn-categories">
      <h2 className="ay-h2">{t('ayCatTitle')}</h2>
      <p className="meta">{t('ayCatHelp')}</p>
      <form className="ay-link-row" onSubmit={add}>
        <input maxLength={80} required value={name} onChange={(e) => setName(e.target.value)} placeholder={t('ayCatNewPh')} aria-label={t('ayCatNewPh')} dir="auto" />
        <button className="btn" disabled={!name.trim()}>{t('ayCatAdd')}</button>
      </form>
      {err && <p className="error" role="alert">{err}</p>}
      {cats === null ? <p className="meta">{t('ayLoading')}</p> : cats.length === 0 ? <p className="meta">{t('ayCatEmpty')}</p> : (
        <ul className="ay-cat-list">
          {cats.map((c) => (
            <li key={c.id}>
              {edit?.id === c.id ? (
                <form className="ay-link-row" onSubmit={rename}>
                  <input maxLength={80} required value={edit.name} onChange={(e) => setEdit({ ...edit, name: e.target.value })} aria-label={t('ayCatRename')} dir="auto" autoFocus />
                  <button className="btn sm" disabled={!edit.name.trim()}>{t('save')}</button>
                  <button type="button" className="btn ghost sm" onClick={() => setEdit(null)}>{t('ayLinkCancel')}</button>
                </form>
              ) : (
                <>
                  <span className="ay-cat-name"><bdi>{c.name}</bdi></span>
                  <span className="meta small">{t('ayCatCount').replace('{n}', c.count)}</span>
                  <span className="ay-cat-btns">
                    <button type="button" className="btn ghost sm" onClick={() => setEdit({ id: c.id, name: c.name })}>{t('ayCatRename')}</button>
                    <button type="button" className="btn ghost sm ay-cat-del" onClick={() => del(c)}>{t('ayCatDel')}</button>
                  </span>
                </>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
