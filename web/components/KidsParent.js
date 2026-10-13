'use client';
// Mejliss Kids, côté parent : qui regarde ? (choix du profil), création et gestion des profils, code parental.
import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useApp } from './Providers';
import { AVATAR_EMOJI, BANDS, bandLabel } from '../lib/kids';
import KidsControls from './KidsControls';
import KidsReport from './KidsReport';

function Avatar({ a, size = 56 }) { return <span className="kd-avatar" style={{ fontSize: size * 0.7, width: size, height: size }} aria-hidden="true">{AVATAR_EMOJI[a] || '🦁'}</span>; }

function PinForm({ t, call, hasPin, onDone }) {
  const [cur, setCur] = useState('');
  const [code, setCode] = useState('');
  const [msg, setMsg] = useState(null);
  const save = async (e) => {
    e.preventDefault(); setMsg(null);
    const r = await call('/me/kids/pin', { method: 'PUT', body: JSON.stringify({ code, ...(hasPin ? { current: cur } : {}) }) });
    if (!r.ok) { setMsg({ ok: false, text: r.data?.code === 'bad_pin' ? t('kdPinBad') : r.data?.code === 'locked' ? r.data.error : (r.data?.error || t('errGeneric')) }); return; }
    setCur(''); setCode(''); setMsg({ ok: true, text: t('kdPinSaved') }); onDone();
  };
  return (
    <form className="panel kd-form" onSubmit={save}>
      <h2 className="panel-title">{t('kdPinTitle')}</h2>
      <p className="meta small">{hasPin ? t('kdPinHelp') : t('kdPinFirst')}</p>
      {hasPin && <label className="fld"><span>{t('kdPinCur')}</span><input type="password" inputMode="numeric" autoComplete="off" pattern="\d{4,6}" maxLength={6} required value={cur} onChange={(e) => setCur(e.target.value)} /></label>}
      <label className="fld"><span>{hasPin ? t('kdPinNew') : t('kdPinTitle')}</span><input type="password" inputMode="numeric" autoComplete="new-password" pattern="\d{4,6}" minLength={4} maxLength={6} required value={code} onChange={(e) => setCode(e.target.value)} /></label>
      {msg && <p className={msg.ok ? 'ok-msg' : 'error'} role="status">{msg.text}</p>}
      <div className="panel-actions"><button className="btn">{t('kdPinSave')}</button></div>
    </form>
  );
}

function ProfileForm({ t, call, p, bands, avatars, onDone, onCancel }) {
  const [f, setF] = useState({ name: p?.name || '', avatar: p?.avatar || avatars[0], band: p?.band || '3-6' });
  const [err, setErr] = useState('');
  const submit = async (e) => {
    e.preventDefault(); setErr('');
    const r = await call(p ? `/me/kids/profiles/${p.id}` : '/me/kids/profiles', { method: p ? 'PATCH' : 'POST', body: JSON.stringify(f) });
    if (!r.ok) { setErr(r.data?.code === 'duplicate' ? t('kdDuplicate') : r.data?.code === 'limit' ? t('kdLimitReached').replace('{n}', r.data.max).replace(/\{s\}/g, r.data.max > 1 ? 's' : '') : (r.data?.error || t('errGeneric'))); return; }
    onDone();
  };
  return (
    <form className="panel kd-form" onSubmit={submit}>
      <label className="fld"><span>{t('kdName')}</span><input required maxLength={30} value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} autoFocus /></label>
      <fieldset className="kd-pick"><legend>{t('kdAvatar')}</legend>
        {avatars.map((a) => <button key={a} type="button" className={f.avatar === a ? 'kd-opt on' : 'kd-opt'} aria-pressed={f.avatar === a} onClick={() => setF({ ...f, avatar: a })}><Avatar a={a} size={44} /></button>)}
      </fieldset>
      <fieldset className="kd-pick"><legend>{t('kdBand')}</legend>
        {bands.map((b) => <button key={b} type="button" className={f.band === b ? 'pill on' : 'pill'} aria-pressed={f.band === b} onClick={() => setF({ ...f, band: b })}>{bandLabel(b, t)}</button>)}
      </fieldset>
      <p className="meta small">{t('kdBandsHelp')}</p>
      {err && <p className="error" role="alert">{err}</p>}
      <div className="panel-actions"><button className="btn">{p ? t('save') : t('kdCreate')}</button>{onCancel && <button type="button" className="btn ghost" onClick={onCancel}>{t('kdCancel')}</button>}</div>
    </form>
  );
}

export default function KidsParent() {
  const { t, call, user, ready, enterKid } = useApp();
  const [d, setD] = useState(null);
  const [state, setState] = useState('loading'); // loading | ok | off
  const [manage, setManage] = useState(false);
  const [edit, setEdit] = useState(null); // profil en cours de modification, ou 'new'
  const [ctrl, setCtrl] = useState(null); // profil dont on règle le contrôle parental
  const [err, setErr] = useState('');
  const load = useCallback(async () => {
    const r = await call('/me/kids');
    if (r.ok) { setD(r.data); setState('ok'); } else setState(r.status === 404 ? 'off' : 'error');
  }, [call]);
  useEffect(() => { if (user) load(); }, [user, load]);

  if (!ready) return null;
  if (!user) return (
    <main className="page kd-page"><h1>{t('kdTitle')}</h1><p>{t('kdNeedLogin')}</p>
      <p><Link className="btn" href="/login?next=/kids">{t('login')}</Link> <Link className="btn ghost" href="/register?next=/kids">{t('register')}</Link></p></main>
  );
  if (state === 'loading') return <main className="page kd-page" />;
  if (state === 'off' || state === 'error') return <main className="page kd-page"><h1>{t('kdTitle')}</h1><p>{t('kdUnavailable')}</p></main>;
  if (!d.allowed) return (
    <main className="page kd-page"><h1>{t('kdTitle')}</h1><p>{t('kdNeedSub')}</p><p><Link className="btn" href="/pricing?from=/kids">{t('pricing')}</Link></p></main>
  );

  const enter = async (p) => {
    setErr('');
    const r = await call(`/me/kids/profiles/${p.id}/enter`, { method: 'POST' });
    if (!r.ok) { if (r.data?.code === 'pin_required') { setManage(true); setErr(t('kdPinFirst')); } else setErr(r.data?.error || t('errGeneric')); return; }
    enterKid(r.data.token, r.data.profile);
  };
  const del = async (p) => { if (window.confirm(t('kdDeleteConfirm').replace('{name}', p.name))) { await call(`/me/kids/profiles/${p.id}`, { method: 'DELETE' }); load(); } };
  const full = d.profiles.length >= d.max;

  return (
    <main className="page kd-page">
      <h1>{t('kdWho')}</h1>
      {err && <p className="error" role="alert">{err}</p>}
      {d.profiles.length === 0 && !manage && <p className="meta">{t('kdNoProfile')}</p>}
      <ul className="kd-profiles">
        {d.profiles.map((p) => (
          <li key={p.id}><button type="button" className="kd-profile" onClick={() => enter(p)}><Avatar a={p.avatar} size={88} /><b>{p.name}</b><span className="meta small">{bandLabel(p.band, t)}</span></button></li>
        ))}
      </ul>
      <p><button type="button" className="btn ghost" onClick={() => { setManage((v) => !v); setEdit(null); }} aria-expanded={manage}>{t('kdManage')}</button></p>
      {manage && (
        <section className="kd-manage" aria-label={t('kdManage')}>
          <PinForm t={t} call={call} hasPin={d.hasPin} onDone={load} />
          <div className="panel">
            <h2 className="panel-title">{t('kdProfiles')} ({d.profiles.length}/{d.max})</h2>
            {!d.learning && <p className="meta small">{t('kdLimitUpgrade')}</p>}
            <ul className="kd-list">
              {d.profiles.map((p) => (
                <li key={p.id}>
                  {edit === p.id ? <ProfileForm t={t} call={call} p={p} bands={d.bands} avatars={d.avatars} onDone={() => { setEdit(null); load(); }} onCancel={() => setEdit(null)} /> : (
                    <div className="kd-row"><Avatar a={p.avatar} size={40} /><span><b>{p.name}</b> · {bandLabel(p.band, t)}</span>
                      <button type="button" className="link u small" onClick={() => setCtrl(ctrl === p.id ? null : p.id)} aria-expanded={ctrl === p.id}>{t('kcOpen')}</button>
                      <button type="button" className="link u small" onClick={() => setEdit(p.id)}>{t('kdEdit')}</button>
                      <button type="button" className="link u small" onClick={() => del(p)}>{t('delete')}</button></div>
                  )}
                  {ctrl === p.id && <KidsControls profile={p} onClose={() => setCtrl(null)} />}
                </li>
              ))}
            </ul>
            {edit === 'new' ? <ProfileForm t={t} call={call} bands={d.bands} avatars={d.avatars} onDone={() => { setEdit(null); load(); }} onCancel={() => setEdit(null)} />
              : <button type="button" className="btn" disabled={full} onClick={() => setEdit('new')}>{t('kdAdd')}</button>}
            {full && <p className="meta small">{t('kdLimitReached').replace('{n}', d.max).replace(/\{s\}/g, d.max > 1 ? 's' : '')}</p>}
          </div>
        </section>
      )}
      <KidsReport hasProfiles={d.profiles.length > 0} />
    </main>
  );
}
