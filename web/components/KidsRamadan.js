'use client';
// Circuit de Ramadan des enfants (étape 45F2).
//   KidRamadan        côté enfant (accueil de l'espace Kids, pendant Ramadan) : actions du jour + « Je l'ai fait » (jeton enfant).
//   KidRamadanParent  côté parent (gestion des profils) : 7 derniers jours, validation (jeton parent). Aucune comparaison entre enfants.
import { useCallback, useEffect, useState } from 'react';
import { useApp } from './Providers';

export function KidRamadan() {
  const { t, call, locale, feat } = useApp();
  const [d, setD] = useState(null);
  const load = useCallback(() => call(`/kids/ramadan?lang=${locale}`).then((r) => setD(r.ok ? r.data : null)), [call, locale]);
  useEffect(() => { if (feat('ramadan')) load(); }, [load, feat]);
  if (!d || !d.status.active || !d.items.length) return null;
  const claim = async (id) => { const r = await call('/kids/ramadan/claim', { method: 'POST', body: JSON.stringify({ itemId: id }) }); if (r.ok) load(); };
  return (
    <section className="ka-home kz" aria-labelledby="kz-t">
      <h2 id="kz-t" className="ka-title">🌙 {t('kzTitle').replace('{n}', d.status.day)}</h2>
      <ul className="ka-list">
        {d.items.map((a) => (
          <li key={a.id} className={`ka-item ${a.state}`}>
            <span className="ka-box" aria-hidden="true">{a.state === 'validated' ? '✓' : a.state === 'claimed' ? '…' : ''}</span>
            <span className="ka-text"><b>{a.title}</b>{a.text && <small>{a.text}</small>}
              {a.state === 'claimed' && <small>{t('kaWait')}</small>}
              {a.state === 'validated' && <small>{t('kaValidated')}</small>}
            </span>
            {a.state === 'todo' && <button type="button" className="btn ka-done" onClick={() => claim(a.id)}>{t('kaDone')}</button>}
          </li>
        ))}
      </ul>
      <p className="meta small ka-note">⭐ {t('kzCount').replace('{n}', d.validated)} · {t('kaParentChecks')}</p>
    </section>
  );
}

export function KidRamadanParent({ profile }) {
  const { t, call, locale } = useApp();
  const [d, setD] = useState(null);
  const base = `/me/kids/profiles/${profile.id}/ramadan`;
  const load = useCallback(() => call(`${base}?lang=${locale}`).then((r) => setD(r.ok ? r.data : null)), [call, base, locale]);
  useEffect(() => { load(); }, [load]);
  if (!d) return null;
  const validate = async (day, itemId) => { const r = await call(`${base}/validate`, { method: 'POST', body: JSON.stringify({ day, itemId }) }); if (r.ok) load(); };
  const STATE = { todo: t('kaStTodo'), claimed: t('kaStClaimed'), validated: t('kaStValidated') };
  return (
    <div className="panel kd-ctrl" role="group" aria-label={t('kzParent').replace('{name}', profile.name)}>
      <h3 className="panel-title">{t('kzParent').replace('{name}', profile.name)}</h3>
      {!d.status.active ? <p className="meta">{t('kzOff')}</p> : d.days.every((x) => !x.items.length) ? <p className="meta">{t('kzNone')}</p> : d.days.map((x) => (
        <div key={x.day}>
          <p className="meta small"><b>{t('rzDay').replace('{n}', x.day)}</b></p>
          <ul className="ka-list">
            {x.items.map((a) => (
              <li key={a.id} className={`ka-item ${a.state}`}>
                <span className="ka-text"><b>{a.title}</b><small>{STATE[a.state]}</small></span>
                {a.state !== 'validated' && <button type="button" className="btn" onClick={() => validate(x.day, a.id)}>{t('kaValidate')}</button>}
              </li>
            ))}
          </ul>
        </div>
      ))}
    </div>
  );
}
