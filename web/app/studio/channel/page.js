'use client';
// Studio → Ma chaîne (étape C). Organisateur : ses chaînes (nom, présentation). Modérateur et administrateur : toutes les chaînes,
// avec attribution du propriétaire. Les conférences, séries et épisodes restent gérés depuis le Studio par l'organisateur qui les a créés.
import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useApp } from '../../../components/Providers';
import ChannelAvatar from '../../../components/ChannelAvatar';
import ChannelImages from '../../../components/ChannelImages';

function Channel({ c, owners, canAssign, t, call, onSaved }) {
  const [name, setName] = useState(c.name);
  const [bio, setBio] = useState(c.bio);
  const [owner, setOwner] = useState(c.ownerId || '');
  const [msg, setMsg] = useState(null);
  const [busy, setBusy] = useState(false);
  const dirty = name !== c.name || bio !== c.bio;
  const save = async (e) => {
    e.preventDefault(); setBusy(true); setMsg(null);
    const r = await call(`/studio/channels/${c.slug}`, { method: 'PUT', body: JSON.stringify({ name, bio }) });
    setBusy(false);
    if (r.ok) { setMsg({ ok: true, text: t('chSaved') }); onSaved(); } else setMsg({ ok: false, text: r.data?.error || t('errGeneric') });
  };
  const assign = async () => {
    setBusy(true); setMsg(null);
    const r = await call(`/studio/channels/${c.slug}/owner`, { method: 'PUT', body: JSON.stringify({ ownerId: owner || null }) });
    setBusy(false);
    if (r.ok) { setMsg({ ok: true, text: t('chAssigned') }); onSaved(); } else setMsg({ ok: false, text: r.data?.error || t('errGeneric') });
  };
  return (
    <li className="ch-card">
      <div className="ch-card-head">
        <ChannelAvatar name={c.name} url={c.avatarUrl} />
        <div className="ch-li-text">
          <b>{c.name}</b>
          <span className="meta">{t(c.talks > 1 ? 'chTalksN' : 'chTalks1').replace('{n}', c.talks)} · {t(c.followers > 1 ? 'chFolN' : 'chFol1').replace('{n}', c.followers)}{c.mine && canAssign ? ` · ${t('chMine')}` : ''}</span>
        </div>
        <Link className="link u small" href={`/chaines/${c.slug}`} target="_blank">{t('chView')}</Link>
      </div>
      <ChannelImages c={c} t={t} call={call} onSaved={onSaved} />
      <form onSubmit={save} className="ch-form">
        <label className="fld"><span>{t('chName')}</span><input value={name} maxLength={120} required onChange={(e) => setName(e.target.value)} /></label>
        <label className="fld"><span>{t('chBio')}</span><textarea rows={4} maxLength={3000} value={bio} placeholder={t('chBioPh')} onChange={(e) => setBio(e.target.value)} /></label>
        <div className="panel-actions"><button className="btn" disabled={!dirty || busy}>{t('chSave')}</button></div>
      </form>
      {canAssign && (
        <div className="ch-owner">
          <label className="fld"><span>{t('chOwner')}</span>
            <select value={owner} onChange={(e) => setOwner(e.target.value)}>
              <option value="">{t('chNoOwner')}</option>
              {owners.map((o) => <option key={o.id} value={o.id}>{o.name || o.email} ({t('role_' + o.role)})</option>)}
            </select>
          </label>
          <button type="button" className="btn ghost" disabled={busy || owner === (c.ownerId || '')} onClick={assign}>{t('chAssign')}</button>
        </div>
      )}
      {msg && <p className={msg.ok ? 'ok-msg' : 'error'} role="status">{msg.text}</p>}
    </li>
  );
}

export default function StudioChannel() {
  const { t, call, user } = useApp();
  const [d, setD] = useState(null);
  const [owners, setOwners] = useState([]);
  const [q, setQ] = useState('');
  const load = useCallback(() => call('/studio/channels').then((r) => setD(r.ok ? r.data : { channels: [], canAssign: false })), [call]);
  useEffect(() => { if (user) load(); }, [user, load]);
  useEffect(() => { if (d?.canAssign) call('/studio/channel-owners').then((r) => r.ok && setOwners(r.data)); }, [d?.canAssign, call]);
  if (!d) return null;
  const list = d.channels.filter((c) => !q.trim() || c.name.toLowerCase().includes(q.trim().toLowerCase()));
  return (
    <main className="studio-page ch-studio">
      <h1>{d.canAssign ? t('chStudioAll') : t('chStudioTitle')}</h1>
      <p className="meta">{d.canAssign ? t('chIntroStaff') : t('chIntro')}</p>
      {d.canAssign && d.channels.length > 6 && <label className="fld ch-filter"><span>{t('chFilter')}</span><input type="search" value={q} onChange={(e) => setQ(e.target.value)} /></label>}
      {d.channels.length === 0 && <p className="soon">{d.canAssign ? t('chEmptyStaff') : t('chEmpty')}</p>}
      <ul className="ch-list">
        {list.map((c) => <Channel key={c.slug} c={c} owners={owners} canAssign={d.canAssign} t={t} call={call} onSaved={load} />)}
      </ul>
    </main>
  );
}
