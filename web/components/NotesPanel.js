'use client';
// Onglet « Mes notes » (étape 17b) : marque-pages et notes personnelles liés à un instant de la vidéo.
// Les données vivent dans TalkClient (le bouton 🔖 du lecteur ajoute aussi un marque-page) ; ce composant affiche et édite.
import { useState } from 'react';
import { clock } from '../lib/clock';

export default function NotesPanel({ notes, onAdd, onSave, onDelete, onSeek, getPos, t }) {
  const [draft, setDraft] = useState('');
  const [edit, setEdit] = useState(null); // { id, body }
  const [busy, setBusy] = useState(false);
  const submit = async (e) => {
    e.preventDefault();
    if (!draft.trim() || busy) return;
    setBusy(true);
    const ok = await onAdd(draft.trim());
    setBusy(false);
    if (ok) setDraft('');
  };
  return (
    <div className="notes">
      <form className="notes-form" onSubmit={submit}>
        <label className="meta" htmlFor="note-draft">{t('ntAddAt').replace('{time}', clock(getPos()))}</label>
        <textarea id="note-draft" value={draft} maxLength={2000} rows={3} placeholder={t('ntPlaceholder')} onChange={(e) => setDraft(e.target.value)} />
        <div className="notes-actions">
          <button type="submit" className="btn" disabled={!draft.trim() || busy}>{t('ntSave')}</button>
          <button type="button" className="btn ghost" disabled={busy} onClick={() => onAdd('')}>🔖 {t('ntBookmark')}</button>
        </div>
      </form>
      {notes.length === 0 && <p className="meta">{t('ntEmpty')}</p>}
      <ul className="notes-list">
        {notes.map((n) => (
          <li key={n.id} className={n.body ? 'note' : 'note bm'}>
            <button type="button" className="note-time" onClick={() => onSeek(n.positionMs / 1000)} title={t('ntGo')}>{n.body ? '📝' : '🔖'} {clock(n.positionMs)}</button>
            {edit?.id === n.id ? (
              <div className="note-edit">
                <textarea value={edit.body} maxLength={2000} rows={3} onChange={(e) => setEdit({ id: n.id, body: e.target.value })} />
                <div className="notes-actions">
                  <button type="button" className="btn" onClick={async () => { await onSave(n.id, edit.body.trim()); setEdit(null); }}>{t('ntSave')}</button>
                  <button type="button" className="btn ghost" onClick={() => setEdit(null)}>{t('cancelBtn')}</button>
                </div>
              </div>
            ) : (
              <div className="note-body">
                {n.body ? <p>{n.body}</p> : <p className="meta">{t('ntBookmark')}</p>}
                <span className="note-btns">
                  <button type="button" className="link" onClick={() => setEdit({ id: n.id, body: n.body })}>{t('ntEdit')}</button>
                  <button type="button" className="link" onClick={() => onDelete(n.id)}>{t('ntDelete')}</button>
                </span>
              </div>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}
