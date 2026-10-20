'use client';
// Studio → Ma chaîne. Une personne peut avoir PLUSIEURS chaînes (sélecteur en haut) et en créer de nouvelles, même vides.
// Sections : Identité (nom, accroche, présentation), Images, Contact et liens, Informations (pays, langue, conférence à la une), Équipe.
// Propriétaire : tout, y compris l'équipe d'éditeurs. Éditeur : la page de la chaîne seulement. Modérateur / administrateur : toutes les chaînes
// et l'attribution du propriétaire. Une vidéo n'a jamais l'obligation d'avoir une chaîne.
import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useApp } from '../../../../components/Providers';
import ChannelAvatar from '../../../../components/ChannelAvatar';
import ChannelImages from '../../../../components/ChannelImages';

const SOCIALS = [['youtube', 'YouTube'], ['instagram', 'Instagram'], ['x', 'X'], ['facebook', 'Facebook'], ['tiktok', 'TikTok']];
const LANGS = ['fr', 'en', 'ar'];

// Équipe d'éditeurs (propriétaire, modérateur, administrateur).
function Team({ c, t, call }) {
  const [team, setTeam] = useState(null);
  const [email, setEmail] = useState('');
  const [msg, setMsg] = useState(null);
  useEffect(() => { call(`/studio/channels/${c.slug}/members`).then((r) => setTeam(r.ok ? r.data : [])); }, [c.slug, call]);
  const add = async (e) => {
    e.preventDefault(); setMsg(null);
    const r = await call(`/studio/channels/${c.slug}/members`, { method: 'POST', body: JSON.stringify({ email }) });
    if (r.ok) { setTeam(r.data); setEmail(''); } else setMsg(r.data?.error || t('errGeneric'));
  };
  const remove = async (id) => {
    const r = await call(`/studio/channels/${c.slug}/members/${id}`, { method: 'DELETE' });
    if (r.ok) setTeam((v) => v.filter((m) => m.userId !== id)); else setMsg(r.data?.error || t('errGeneric'));
  };
  return (
    <section className="ch-sec" aria-labelledby={`team-${c.slug}`}>
      <h2 id={`team-${c.slug}`}>{t('chTeam')}</h2>
      <p className="meta">{t('chTeamHelp')}</p>
      <ul className="ch-team">
        <li><b>{c.ownerName || c.ownerEmail || '—'}</b> <span className="meta">{t('chRoleOwner')}</span></li>
        {(team || []).map((m) => (
          <li key={m.userId}><b>{m.name || m.email}</b> <span className="meta">{t('chRoleEditor')} · {m.email}</span>
            <button type="button" className="btn ghost small" onClick={() => remove(m.userId)}>{t('chTeamRemove')}</button></li>
        ))}
        {team && team.length === 0 && <li className="meta">{t('chTeamEmpty')}</li>}
      </ul>
      <form onSubmit={add} className="ch-owner">
        <label className="fld"><span>{t('chTeamEmail')}</span><input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} /></label>
        <button className="btn ghost" disabled={!email.trim()}>{t('chTeamAdd')}</button>
      </form>
      {msg && <p className="error" role="alert">{msg}</p>}
    </section>
  );
}

function Channel({ c, owners, canAssign, t, call, locale, onSaved, onDeleted }) {
  // Valeurs enregistrées : ne change que si les champs modifiables changent (pas quand une image est rechargée).
  const key = JSON.stringify([c.name, c.bio, c.tagline, c.website, c.contactEmail, c.country, c.mainLanguage, c.featuredTalkId, c.socials]);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const init = useMemo(() => ({
    name: c.name, bio: c.bio || '', tagline: c.tagline || '', website: c.website || '', contactEmail: c.contactEmail || '',
    country: c.country || '', mainLanguage: c.mainLanguage || '', featuredTalkId: c.featuredTalkId || '',
    socials: Object.fromEntries(SOCIALS.map(([k]) => [k, c.socials?.[k] || ''])),
  }), [key]);
  const [f, setF] = useState(init);
  const [owner, setOwner] = useState(c.ownerId || '');
  const [talks, setTalks] = useState([]);
  const [msg, setMsg] = useState(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => { setF(init); setOwner(c.ownerId || ''); setMsg(null); }, [init, c.ownerId]);
  // Conférences publiées de cette chaîne : candidates pour la « une ».
  useEffect(() => { call(`/talks?speaker=${c.slug}&limit=100`).then((r) => setTalks(r.ok ? r.data : [])); }, [c.slug, call]);
  const set = (k, v) => setF((o) => ({ ...o, [k]: v }));
  const dirty = JSON.stringify(f) !== JSON.stringify(init);
  const isOwnerish = c.myRole === 'owner' || c.myRole === 'staff';
  const langName = (code) => { try { return new Intl.DisplayNames([locale], { type: 'language' }).of(code); } catch { return code; } };
  const save = async (e) => {
    e.preventDefault(); setBusy(true); setMsg(null);
    const body = { ...f, featuredTalkId: f.featuredTalkId || null };
    const r = await call(`/studio/channels/${c.slug}`, { method: 'PUT', body: JSON.stringify(body) });
    setBusy(false);
    if (r.ok) { setMsg({ ok: true, text: t('chSaved') }); onSaved(); } else setMsg({ ok: false, text: r.data?.error || t('errGeneric') });
  };
  const assign = async () => {
    setBusy(true); setMsg(null);
    const r = await call(`/studio/channels/${c.slug}/owner`, { method: 'PUT', body: JSON.stringify({ ownerId: owner || null }) });
    setBusy(false);
    if (r.ok) { setMsg({ ok: true, text: t('chAssigned') }); onSaved(); } else setMsg({ ok: false, text: r.data?.error || t('errGeneric') });
  };
  const del = async () => {
    if (!window.confirm(t('chDeleteAsk'))) return;
    const r = await call(`/studio/channels/${c.slug}`, { method: 'DELETE' });
    if (r.ok) onDeleted(); else setMsg({ ok: false, text: r.data?.error || t('errGeneric') });
  };
  return (
    <article className="ch-card" data-slug={c.slug}>
      <div className="ch-card-head">
        <ChannelAvatar name={c.name} url={c.avatarUrl} />
        <div className="ch-li-text">
          <b>{c.name}</b>
          <span className="meta">{t(c.talks > 1 ? 'chTalksN' : 'chTalks1').replace('{n}', c.talks)} · {t(c.followers > 1 ? 'chFolN' : 'chFol1').replace('{n}', c.followers)} · {t(c.myRole === 'editor' ? 'chRoleEditor' : 'chRoleOwner')}</span>
          <span className="meta small">{t('chKeyHelp').replace('{name}', c.keyName)}</span>
        </div>
        {c.talks > 0 && <Link className="link u small" href={`/chaines/${c.slug}`} target="_blank">{t('chView')}</Link>}
      </div>
      {c.talks === 0 && <p className="meta">{t('chPubEmptyNote')}</p>}

      <section className="ch-sec" aria-labelledby={`img-${c.slug}`}>
        <h2 id={`img-${c.slug}`}>{t('chSecImages')}</h2>
        <ChannelImages c={c} t={t} call={call} onSaved={onSaved} />
      </section>

      <form onSubmit={save} className="ch-form">
        <section className="ch-sec" aria-labelledby={`id-${c.slug}`}>
          <h2 id={`id-${c.slug}`}>{t('chSecIdentity')}</h2>
          <label className="fld"><span>{t('chName')}</span><input name="name" value={f.name} maxLength={120} required onChange={(e) => set('name', e.target.value)} /></label>
          <label className="fld"><span>{t('chTagline')}</span><input name="tagline" value={f.tagline} maxLength={100} placeholder={t('chTaglinePh')} onChange={(e) => set('tagline', e.target.value)} /></label>
          <label className="fld"><span>{t('chBio')}</span><textarea name="bio" rows={5} maxLength={3000} value={f.bio} placeholder={t('chBioPh')} onChange={(e) => set('bio', e.target.value)} /></label>
        </section>

        <section className="ch-sec" aria-labelledby={`lk-${c.slug}`}>
          <h2 id={`lk-${c.slug}`}>{t('chSecLinks')}</h2>
          <label className="fld"><span>{t('chWebsite')}</span><input name="website" type="url" inputMode="url" maxLength={200} placeholder="https://" value={f.website} onChange={(e) => set('website', e.target.value)} /></label>
          <label className="fld"><span>{t('chContact')}</span><input name="contactEmail" type="email" maxLength={160} value={f.contactEmail} onChange={(e) => set('contactEmail', e.target.value)} /></label>
          <fieldset className="ch-socials"><legend>{t('chSocials')}</legend>
            {SOCIALS.map(([k, label]) => (
              <label className="fld" key={k}><span>{label}</span>
                <input name={`social-${k}`} type="url" inputMode="url" maxLength={200} placeholder="https://" value={f.socials[k]} onChange={(e) => setF((o) => ({ ...o, socials: { ...o.socials, [k]: e.target.value } }))} /></label>
            ))}
          </fieldset>
        </section>

        <section className="ch-sec" aria-labelledby={`in-${c.slug}`}>
          <h2 id={`in-${c.slug}`}>{t('chSecInfo')}</h2>
          <div className="ch-two">
            <label className="fld"><span>{t('chCountry')}</span><input name="country" maxLength={80} value={f.country} onChange={(e) => set('country', e.target.value)} /></label>
            <label className="fld"><span>{t('chLang')}</span>
              <select name="mainLanguage" value={f.mainLanguage} onChange={(e) => set('mainLanguage', e.target.value)}>
                <option value="">{t('chLangNone')}</option>
                {LANGS.map((l) => <option key={l} value={l}>{langName(l)}</option>)}
              </select></label>
          </div>
          <label className="fld"><span>{t('chFeatured')}</span>
            <select name="featuredTalkId" value={f.featuredTalkId} onChange={(e) => set('featuredTalkId', e.target.value)}>
              <option value="">{t('chFeaturedNone')}</option>
              {talks.map((x) => <option key={x.id} value={x.id}>{x.title}</option>)}
            </select>
            <small className="meta">{t('chFeaturedHelp')}</small></label>
        </section>
        <div className="panel-actions"><button className="btn" disabled={!dirty || busy}>{t('chSave')}</button></div>
      </form>

      {isOwnerish && <Team c={c} t={t} call={call} />}

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
      {isOwnerish && c.talks === 0 && <div className="panel-actions"><button type="button" className="btn ghost danger" onClick={del}>{t('chDelete')}</button></div>}
      {msg && <p className={msg.ok ? 'ok-msg' : 'error'} role="status">{msg.text}</p>}
    </article>
  );
}

export default function StudioChannel() {
  const { t, call, user, locale } = useApp();
  const [d, setD] = useState(null);
  const [owners, setOwners] = useState([]);
  const [sel, setSel] = useState('');
  const [q, setQ] = useState('');
  const [name, setName] = useState('');
  const [msg, setMsg] = useState(null);
  const load = useCallback(() => call('/studio/channels').then((r) => setD(r.ok ? r.data : { channels: [], canAssign: false })), [call]);
  useEffect(() => { if (user) load(); }, [user, load]);
  useEffect(() => { if (d?.canAssign) call('/studio/channel-owners').then((r) => r.ok && setOwners(r.data)); }, [d?.canAssign, call]);
  const channels = d?.channels || [];
  const list = channels.filter((c) => !q.trim() || c.name.toLowerCase().includes(q.trim().toLowerCase()));
  const cur = channels.find((c) => c.slug === sel) || list[0] || channels[0] || null;
  const create = async (e) => {
    e.preventDefault(); setMsg(null);
    const r = await call('/studio/channels', { method: 'POST', body: JSON.stringify({ name }) });
    if (r.ok) { setName(''); setQ(''); setSel(r.data.slug); setMsg({ ok: true, text: t('chCreated') }); load(); } else setMsg({ ok: false, text: r.data?.error || t('errGeneric') });
  };
  if (!d) return null;
  return (
    <main className="studio-page ch-studio">
      <h1>{d.canAssign ? t('chStudioAll') : t('chStudioTitle')}</h1>
      <p className="meta">{d.canAssign ? t('chIntroStaff') : t('chIntro')}</p>

      <div className="ch-bar">
        {channels.length > 0 && (
          <div className="ch-pick">
            {d.canAssign && channels.length > 6 && <label className="fld ch-filter"><span>{t('chFilter')}</span><input type="search" value={q} onChange={(e) => setQ(e.target.value)} /></label>}
            <label className="fld"><span>{t('chSwitch')}</span>
              <select name="channel" value={cur?.slug || ''} onChange={(e) => setSel(e.target.value)}>
                {list.map((c) => <option key={c.slug} value={c.slug}>{c.name}</option>)}
              </select></label>
          </div>
        )}
        <form onSubmit={create} className="ch-new">
          <label className="fld"><span>{t('chNew')}</span><input name="newName" value={name} maxLength={120} placeholder={t('chNewPh')} onChange={(e) => setName(e.target.value)} /></label>
          <button className="btn ghost" disabled={!name.trim()}>{t('chCreate')}</button>
        </form>
      </div>
      <p className="meta small">{t('chNewHelp')}</p>
      {msg && <p className={msg.ok ? 'ok-msg' : 'error'} role="status">{msg.text}</p>}

      {channels.length === 0 && <p className="soon">{d.canAssign ? t('chEmptyStaff') : t('chEmpty')}</p>}
      {cur && <Channel key={cur.slug} c={cur} owners={owners} canAssign={d.canAssign} t={t} call={call} locale={locale} onSaved={load} onDeleted={() => { setSel(''); load(); }} />}
    </main>
  );
}
