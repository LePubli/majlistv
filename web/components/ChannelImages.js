'use client';
// Studio → Ma chaîne : choisir ou retirer l'image de profil et la bannière (étape E2). Les images sont recadrées et réduites dans le navigateur.
import { useRef, useState } from 'react';
import ChannelAvatar from './ChannelAvatar';

// Recadre au centre à la taille voulue et renvoie une data-URL JPEG.
function fit(file, W, H) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file); const img = new Image();
    img.onload = () => {
      const c = document.createElement('canvas'); c.width = W; c.height = H;
      const k = Math.max(W / img.width, H / img.height), w = img.width * k, h = img.height * k;
      c.getContext('2d').drawImage(img, (W - w) / 2, (H - h) / 2, w, h);
      URL.revokeObjectURL(url); resolve(c.toDataURL('image/jpeg', 0.86));
    };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('bad')); };
    img.src = url;
  });
}

export default function ChannelImages({ c, t, call, onSaved }) {
  const av = useRef(null), bn = useRef(null);
  const [msg, setMsg] = useState(null);
  const [busy, setBusy] = useState(false);
  const send = async (kind, file) => {
    if (!file) return;
    setBusy(true); setMsg(null);
    try {
      const image = await fit(file, kind === 'avatar' ? 384 : 1600, kind === 'avatar' ? 384 : 400);
      const r = await call(`/studio/channels/${c.slug}/image/${kind}`, { method: 'POST', body: JSON.stringify({ image }) });
      if (r.ok) { setMsg({ ok: true, text: t('chImgSaved') }); onSaved(); } else setMsg({ ok: false, text: r.data?.error || t('errGeneric') });
    } catch { setMsg({ ok: false, text: t('chImgBad') }); }
    setBusy(false);
  };
  const remove = async (kind) => {
    setBusy(true); setMsg(null);
    const r = await call(`/studio/channels/${c.slug}/image/${kind}`, { method: 'DELETE' });
    setBusy(false);
    if (r.ok || r.status === 204) { setMsg({ ok: true, text: t('chImgRemoved') }); onSaved(); } else setMsg({ ok: false, text: r.data?.error || t('errGeneric') });
  };
  return (
    <div className="ch-images">
      <div className="ch-img-block">
        <ChannelAvatar name={c.name} url={c.avatarUrl} size="lg" />
        <div className="ch-img-actions">
          <b>{t('chAvatar')}</b><span className="meta small">{t('chAvatarHelp')}</span>
          <div>
            <input ref={av} type="file" accept="image/jpeg,image/png,image/webp" hidden aria-label={t('chAvatar')} onChange={(e) => { send('avatar', e.target.files[0]); e.target.value = ''; }} />
            <button type="button" className="btn ghost" disabled={busy} onClick={() => av.current.click()}>{t('chImgChoose')}</button>
            {c.avatarUrl && <button type="button" className="link u small" disabled={busy} onClick={() => remove('avatar')}>{t('chImgRemove')}</button>}
          </div>
        </div>
      </div>
      <div className="ch-img-block ch-img-banner">
        <div className={`ch-banner ch-banner-sm${c.bannerUrl ? '' : ' empty'}`}>{c.bannerUrl && <img src={c.bannerUrl} alt="" />}</div>
        <div className="ch-img-actions">
          <b>{t('chBanner')}</b><span className="meta small">{t('chBannerHelp')}</span>
          <div>
            <input ref={bn} type="file" accept="image/jpeg,image/png,image/webp" hidden aria-label={t('chBanner')} onChange={(e) => { send('banner', e.target.files[0]); e.target.value = ''; }} />
            <button type="button" className="btn ghost" disabled={busy} onClick={() => bn.current.click()}>{t('chImgChoose')}</button>
            {c.bannerUrl && <button type="button" className="link u small" disabled={busy} onClick={() => remove('banner')}>{t('chImgRemove')}</button>}
          </div>
        </div>
      </div>
      {msg && <p className={msg.ok ? 'ok-msg' : 'error'} role="status">{msg.text}</p>}
    </div>
  );
}
