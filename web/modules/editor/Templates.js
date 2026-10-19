'use client';
// Éditeur de montage (étape E3) — modèles de chaîne (colonne de gauche) : habillages prêts à l'emploi (Standard, Avec intro et fin),
// modèles enregistrés pour la chaîne de la conférence (ou pour toutes les chaînes, par un administrateur), et « Enregistrer le
// montage comme modèle ». Appliquer un modèle remplace l'habillage du montage (un seul geste à annuler) et garde les transitions
// propres à chaque extrait, qui n'ont pas de sens dans un modèle.
import { useCallback, useEffect, useState } from 'react';
import { useApp } from '../../components/Providers';
import { builtinTemplates, dressEmpty } from './ops';

export default function Templates({ projectId, canEdit, dress, onApply, channelName }) {
  const { t, call, user } = useApp();
  const [list, setList] = useState([]);
  const [msg, setMsg] = useState(null);
  const [name, setName] = useState('');
  const [scope, setScope] = useState('channel');
  const [open, setOpen] = useState(false);
  const load = useCallback(async () => {
    const r = await call(`/studio/editor/templates?project=${projectId}`);
    if (r.ok) setList(r.data.templates);
  }, [call, projectId]);
  useEffect(() => { load(); }, [load]);
  const builtin = builtinTemplates({ standard: t('mtTplStandard'), intro: t('mtTplIntro'), outroTitle: t('mtdOutroTitle'), outroSub: '' });
  const apply = (tpl) => {
    if (!dressEmpty(dress) && !window.confirm(t('mtdTplConfirm').replace('{n}', tpl.name))) return;
    onApply(tpl.dress); setMsg({ ok: true, text: t('mtdTplApplied').replace('{n}', tpl.name) });
  };
  const save = async (e) => {
    e.preventDefault();
    const r = await call('/studio/editor/templates', { method: 'POST', body: JSON.stringify({ projectId, name, scope, dress }) });
    if (!r.ok) { setMsg({ ok: false, text: r.data?.error || t('dbError') }); return; }
    setMsg({ ok: true, text: t('mtdTplSaved') }); setName(''); setOpen(false); load();
  };
  const del = async (tpl) => {
    if (!window.confirm(t('mtdTplDelConfirm').replace('{n}', tpl.name))) return;
    const r = await call(`/studio/editor/templates/${tpl.id}`, { method: 'DELETE' });
    setMsg(r.ok ? { ok: true, text: t('mtdTplDeleted') } : { ok: false, text: r.data?.error || t('dbError') });
    load();
  };
  return (
    <div className="mt-templates">
      {[...builtin, ...list].map((tpl) => (
        <div key={tpl.id} className="mt-tplrow">
          <button type="button" className="mt-add tpl on" disabled={!canEdit} onClick={() => apply(tpl)} data-tpl={tpl.id} title={tpl.scope === 'all' ? t('mtdTplAllHint') : tpl.channel ? t('mtdTplChannelHint').replace('{c}', channelName || '') : undefined}>
            <span dir="auto">{tpl.name}</span>{tpl.scope === 'all' ? <em>{t('mtdTplAll')}</em> : <b aria-hidden="true">+</b>}
          </button>
          {tpl.canDelete && <button type="button" className="mt-del" aria-label={t('mtDel')} title={t('mtDel')} onClick={() => del(tpl)}>×</button>}
        </div>
      ))}
      {canEdit && !open && <button type="button" className="mt-add tpl on" onClick={() => setOpen(true)} data-act="save-tpl"><span>{t('mtdTplSave')}</span><b aria-hidden="true">＋</b></button>}
      {canEdit && open && (
        <form className="mt-savetpl" onSubmit={save}>
          <label className="mt-field"><span className="meta small">{t('mtdTplName')}</span><input value={name} maxLength={80} onChange={(e) => setName(e.target.value)} required autoFocus /></label>
          {user?.role === 'admin' && (
            <select value={scope} onChange={(e) => setScope(e.target.value)} aria-label={t('mtdTplScope')}>
              <option value="channel">{t('mtdTplForChannel').replace('{c}', channelName || '—')}</option>
              <option value="all">{t('mtdTplForAll')}</option>
            </select>
          )}
          <div className="mt-actions">
            <button type="submit" className="btn sd-pill" disabled={!name.trim() || dressEmpty(dress)}>{t('mtdTplSaveBtn')}</button>
            <button type="button" className="btn ghost sd-pill" onClick={() => setOpen(false)}>{t('mtdCancel')}</button>
          </div>
          {dressEmpty(dress) && <p className="meta small">{t('mtdTplEmpty')}</p>}
        </form>
      )}
      {msg && <p className={msg.ok ? 'ok-msg small' : 'error small'} role="status">{msg.text}</p>}
    </div>
  );
}
