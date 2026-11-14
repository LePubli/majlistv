'use client';
// Studio → TV en direct (administrateur) : chaînes YouTube diffusées 24 h/24 (ex. La Mecque, Médine) affichées sur la page
// « TV en direct » du site, de l'application et de la télé (indépendante des événements en direct depuis le 14/11). On colle le lien de la chaîne (youtube.com/@nom) ou d'un direct ; le serveur
// retrouve le direct en cours toutes les 15 minutes (« Vérifier maintenant » pour le faire tout de suite).
import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useApp } from '../../../components/Providers';
import { liveEmbed } from '../../../components/LiveChannels';

export default function StudioLive() {
  const { t, call, user, feat } = useApp();
  const [list, setList] = useState(null);
  const [f, setF] = useState({ name: '', url: '' });
  const [err, setErr] = useState('');
  const [preview, setPreview] = useState(null);
  const load = useCallback(() => call('/studio/live').then((r) => setList(r.ok ? r.data.channels : [])), [call]);
  useEffect(() => { load(); }, [load]);
  // Tant qu'une chaîne attend sa vérification, la liste est relue toutes les 5 secondes.
  useEffect(() => {
    if (!list?.some((c) => !c.checkedAt)) return undefined;
    const h = setTimeout(load, 5000);
    return () => clearTimeout(h);
  }, [list, load]);
  if (user?.role !== 'admin') return <main className="page"><p className="meta">{t('errGeneric')}</p></main>;
  const act = async (path, init) => {
    const r = await call(path, init);
    if (!r.ok) { setErr(r.data?.error || t('errGeneric')); return false; }
    setErr(''); await load(); return true;
  };
  const add = async (e) => {
    e.preventDefault();
    if (await act('/studio/live', { method: 'POST', body: JSON.stringify({ name: f.name.trim(), url: f.url.trim(), position: (list?.length || 0) * 10 }) })) setF({ name: '', url: '' });
  };
  const patch = (c, body) => act(`/studio/live/${c.id}`, { method: 'PATCH', body: JSON.stringify(body) });
  const move = async (i, d) => {
    const a = list[i]; const b = list[i + d];
    if (!a || !b) return;
    await patch(a, { position: b.position === a.position ? b.position + d : b.position });
    await patch(b, { position: a.position });
  };
  return (
    <main className="page studio-page">
      <h1>{t('lvAdminTitle')}</h1>
      <p className="meta">{t('lvAdminHelp')}</p>
      {!feat('livetv') && <p className="notice">{t('lvAdminOff')}</p>}
      <form className="panel ay-form" onSubmit={add}>
        <label className="fld"><span>{t('lvName')}</span><input required maxLength={80} value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} placeholder={t('lvNamePh')} dir="auto" /></label>
        <label className="fld"><span>{t('lvUrl')}</span><input required type="url" inputMode="url" dir="ltr" maxLength={300} value={f.url} onChange={(e) => setF({ ...f, url: e.target.value })} placeholder="https://www.youtube.com/@…" /></label>
        <button className="btn" disabled={!f.name.trim() || !f.url.trim()}>{t('lvAdd')}</button>
      </form>
      {err && <p className="error" role="alert">{err}</p>}
      {!list ? <p className="meta">…</p> : list.length === 0 ? <p className="meta">{t('lvEmpty')}</p> : (
        <ul className="lv-admin">
          {list.map((c, i) => (
            <li key={c.id} className={c.enabled ? '' : 'off'}>
              <span className="lv-thumb" style={c.video ? { backgroundImage: `url(https://i.ytimg.com/vi/${c.video.ref}/mqdefault.jpg)` } : undefined} />
              <span className="lv-info">
                <b dir="auto">{c.name}</b>
                <a href={c.url} target="_blank" rel="noopener noreferrer" dir="ltr" className="meta small">{c.url}</a>
                <span className="meta small">
                  {!c.checkedAt ? t('lvChecking') : c.error ? <span className="lv-err">{c.error}</span> : c.live ? <span className="lv-on">● {t('lvLive')}</span> : t('lvNotLive')}
                  {c.title ? <> · <bdi>{c.title}</bdi></> : null}
                </span>
              </span>
              <span className="lv-btns">
                <button type="button" className="btn ghost sm" disabled={i === 0} onClick={() => move(i, -1)} aria-label={t('lvUp')}>↑</button>
                <button type="button" className="btn ghost sm" disabled={i === list.length - 1} onClick={() => move(i, 1)} aria-label={t('lvDown')}>↓</button>
                {c.video && <button type="button" className="btn ghost sm" onClick={() => setPreview(preview === c.id ? null : c.id)}>{t('lvPreview')}</button>}
                <button type="button" className="btn ghost sm" onClick={() => act(`/studio/live/${c.id}/check`, { method: 'POST' })}>{t('lvCheck')}</button>
                <button type="button" className="btn ghost sm" onClick={() => patch(c, { enabled: !c.enabled })}>{c.enabled ? t('lvHide') : t('lvShow')}</button>
                <button type="button" className="btn ghost sm ay-cat-del" onClick={() => { if (confirm(t('lvDelAsk').replace('{name}', c.name))) act(`/studio/live/${c.id}`, { method: 'DELETE' }); }}>{t('lvDel')}</button>
              </span>
              {preview === c.id && liveEmbed(c.video?.ref) && (
                <div className="lv-player lv-preview"><iframe src={liveEmbed(c.video.ref)} title={c.name} allow="autoplay; encrypted-media; picture-in-picture; fullscreen" allowFullScreen /></div>
              )}
            </li>
          ))}
        </ul>
      )}
      <p className="meta"><Link className="link u" href="/live">{t('lvSeePage')}</Link></p>
    </main>
  );
}
