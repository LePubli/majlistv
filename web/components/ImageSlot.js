'use client';
// Un emplacement d'image (présentation ou couverture) : aperçu, « Choisir », « Retirer ». L'image est recadrée et réduite ici
// (en JPEG) avant l'envoi. Textes fournis par l'appelant (écrans en français ou traduits).
import { useRef, useState } from 'react';

const SIZES = { poster: [1280, 720], cover: [1920, 820] };

// Recadre au centre à la taille voulue et renvoie une data-URL JPEG.
export function resizeTo(file, kind) {
  const [W, H] = SIZES[kind] || SIZES.poster;
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      const c = document.createElement('canvas'); c.width = W; c.height = H;
      const k = Math.max(W / img.width, H / img.height);
      const w = img.width * k; const h = img.height * k;
      c.getContext('2d').drawImage(img, (W - w) / 2, (H - h) / 2, w, h);
      URL.revokeObjectURL(url);
      resolve(c.toDataURL('image/jpeg', 0.85));
    };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('bad')); };
    img.src = url;
  });
}

// kind : 'poster' (16:9, vignettes et cartes) ou 'cover' (grand bandeau 21:9). onUpload(dataUrl) → { ok, error? } ; onRemove() → { ok }.
export default function ImageSlot({ kind = 'poster', title, help, url, fallbackUrl = null, onUpload, onRemove, disabled = false, labels = {} }) {
  const input = useRef(null);
  const [msg, setMsg] = useState(null);
  const [busy, setBusy] = useState(false);
  const L = { choose: 'Choisir une image', change: 'Changer', remove: 'Retirer', bad: 'Image JPEG, PNG ou WebP attendue', done: 'Image enregistrée', none: 'Aucune image', fallback: 'Image par défaut (celle de la première vidéo). Choisissez la vôtre pour la remplacer.', ...labels };
  const pick = async (e) => {
    const file = e.target.files?.[0]; e.target.value = '';
    if (!file) return;
    if (!/^image\/(jpeg|png|webp)$/.test(file.type)) { setMsg({ ok: false, text: L.bad }); return; }
    setBusy(true); setMsg(null);
    try {
      const r = await onUpload(await resizeTo(file, kind));
      setMsg(r.ok ? { ok: true, text: L.done } : { ok: false, text: r.error || L.bad });
    } catch { setMsg({ ok: false, text: L.bad }); }
    setBusy(false);
  };
  const drop = async () => { setBusy(true); const r = await onRemove(); setBusy(false); setMsg(r.ok ? null : { ok: false, text: r.error || L.bad }); };
  return (
    <div className="img-slot">
      <b>{title}</b>
      {help && <span className="meta small">{help}</span>}
      <div className={`img-prev ${kind}`} style={(url || fallbackUrl) ? { backgroundImage: `url("${String(url || fallbackUrl).replace(/"/g, '%22')}")` } : undefined} role="img" aria-label={url || fallbackUrl ? title : L.none} />
      {!url && fallbackUrl && <span className="meta small img-default">{L.fallback}</span>}
      {!disabled && (
        <div className="img-actions">
          <button type="button" className="btn ghost" disabled={busy} onClick={() => input.current?.click()}>{url ? L.change : L.choose}</button>
          {url && <button type="button" className="btn ghost" disabled={busy} onClick={drop}>{L.remove}</button>}
          <input ref={input} type="file" accept="image/jpeg,image/png,image/webp" hidden onChange={pick} />
        </div>
      )}
      {msg && <p className={msg.ok ? 'ok-msg' : 'error'} role="status">{msg.text}</p>}
    </div>
  );
}
