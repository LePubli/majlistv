'use client';
// Contrôle parental d'un profil : durée quotidienne et catalogue autorisé. Réservé au parent connecté (jamais accessible avec le jeton enfant).
import { useCallback, useEffect, useState } from 'react';
import { useApp } from './Providers';

const LIMITS = [null, 15, 30, 45, 60, 90, 120, 180];

export default function KidsControls({ profile, onClose }) {
  const { t, call } = useApp();
  const [c, setC] = useState(null);
  const [cat, setCat] = useState(null);
  const [msg, setMsg] = useState('');
  const load = useCallback(async () => {
    const [a, b] = await Promise.all([call(`/me/kids/profiles/${profile.id}/controls`), call(`/me/kids/profiles/${profile.id}/catalog`)]);
    if (a.ok) setC(a.data);
    if (b.ok) setCat(b.data);
  }, [call, profile.id]);
  useEffect(() => { load(); }, [load]);
  if (!c) return <div className="panel kd-ctrl" />;

  const flash = (m) => { setMsg(m); setTimeout(() => setMsg(''), 2500); };
  const put = async (body) => { const r = await call(`/me/kids/profiles/${profile.id}/controls`, { method: 'PUT', body: JSON.stringify(body) }); if (r.ok) { flash(t('kcSaved')); await load(); } };
  const setAllowed = async (ids, allowed) => { setCat((x) => (x ? { ...x, talks: x.talks.map((y) => (ids.includes(y.id) ? { ...y, allowed } : y)) } : x)); const r = await call(`/me/kids/profiles/${profile.id}/catalog`, { method: 'PUT', body: JSON.stringify({ talkIds: ids, allowed }) }); if (r.ok) flash(t('kcSaved')); await load(); };
  const talks = cat?.talks || [];
  const ids = talks.map((x) => x.id).slice(0, 200);
  const usedMin = Math.round(c.usedSec / 60);

  return (
    <div className="panel kd-ctrl" role="group" aria-label={t('kcTitle').replace('{name}', profile.name)}>
      <h3 className="panel-title">{t('kcTitle').replace('{name}', profile.name)}</h3>
      <label className="fld"><span>{t('kcTime')}</span>
        <select value={c.dailyLimitMin ?? ''} onChange={(e) => put({ dailyLimitMin: e.target.value === '' ? null : Number(e.target.value) })}>
          {LIMITS.map((m) => <option key={m ?? 'none'} value={m ?? ''}>{m == null ? t('kcNoLimit') : t('kcMin').replace('{n}', m)}</option>)}
        </select></label>
      <p className="meta small">{t('kcTimeHelp')} {t('kcUsedToday').replace('{n}', usedMin)}</p>

      <fieldset className="kd-pick"><legend>{t('kcCatalog')}</legend>
        <button type="button" className={c.catalogMode === 'all' ? 'pill on' : 'pill'} aria-pressed={c.catalogMode === 'all'} onClick={() => c.catalogMode !== 'all' && put({ catalogMode: 'all' })}>{t('kcModeAll')}</button>
        <button type="button" className={c.catalogMode === 'selected' ? 'pill on' : 'pill'} aria-pressed={c.catalogMode === 'selected'} onClick={() => c.catalogMode !== 'selected' && put({ catalogMode: 'selected' })}>{t('kcModeSel')}</button>
      </fieldset>
      <p className="meta small">{c.catalogMode === 'all' ? t('kcHelpAll') : t('kcHelpSel')}</p>
      {talks.length > 0 && (
        <>
          <p className="kd-row"><button type="button" className="btn ghost small" onClick={() => setAllowed(ids, true)}>{t('kcAllowAll')}</button>
            <button type="button" className="btn ghost small" onClick={() => setAllowed(ids, false)}>{t('kcBlockAll')}</button></p>
          <ul className="kd-catalog">
            {talks.map((x) => (
              <li key={x.id}><label className="kd-check"><input type="checkbox" checked={x.allowed} onChange={(e) => setAllowed([x.id], e.target.checked)} />
                <span><b>{x.title}</b>{x.speaker ? <span className="meta small"> · {x.speaker}</span> : null}</span></label></li>
            ))}
          </ul>
        </>
      )}
      {cat && talks.length === 0 && <p className="meta small">{t('kcEmpty')}</p>}
      <p className="meta small" role="status" aria-live="polite">{msg}</p>
      <div className="panel-actions"><button type="button" className="btn ghost" onClick={onClose}>{t('kcClose')}</button></div>
    </div>
  );
}
