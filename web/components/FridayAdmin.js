'use client';
// Admin → Vendredi (étape 45C) : activer, choisir les éléments de la carte, relire et modifier les textes (FR / EN / AR),
// choisir la collection « Vidéos du vendredi », régler la notification (heure de Paris).
// Les textes par défaut sont de simples rappels : relisez-les avant d'activer.
import { useCallback, useEffect, useState } from 'react';
import { useApp } from './Providers';

const L = [['fr', 'Français'], ['en', 'English'], ['ar', 'العربية']];

function Form({ d, onSaved }) {
  const { t, call } = useApp();
  const [f, setF] = useState({ enabled: d.enabled, showKahf: d.showKahf, showGhusl: d.showGhusl, showSalawat: d.showSalawat, collectionId: d.collectionId || '', notify: d.notify, notifyHour: d.notifyHour, ghusl: { ...d.ghusl }, salawat: { ...d.salawat }, notif: { ...d.notif } });
  const [msg, setMsg] = useState(''); const [err, setErr] = useState(''); const [busy, setBusy] = useState(false);
  const set = (k) => (e) => setF({ ...f, [k]: e.target.type === 'checkbox' ? e.target.checked : e.target.value });
  const setL = (k, l) => (e) => setF({ ...f, [k]: { ...f[k], [l]: e.target.value } });
  const save = async (e) => {
    e.preventDefault(); setBusy(true); setErr(''); setMsg('');
    const r = await call('/admin/friday', { method: 'PUT', body: JSON.stringify({ ...f, collectionId: f.collectionId || null, notifyHour: Number(f.notifyHour) }) });
    setBusy(false);
    if (!r.ok) { setErr(r.data?.error || (r.data?.details ? r.data.details.map((x) => x.message).join(' ; ') : t('errGeneric'))); return; }
    setMsg(t('seasonSaved')); onSaved();
  };
  const test = async () => {
    setErr(''); setMsg('');
    const r = await call('/admin/friday/test-push', { method: 'POST' });
    if (!r.ok) { setErr(r.data?.error || t('errGeneric')); return; }
    setMsg(r.data.sent > 0 ? t('seasonTestSent') : t('seasonTestNone'));
  };
  const texts = (k, label) => (
    <fieldset className="fd-fs"><legend>{label}</legend>
      {L.map(([l, n]) => (
        <label key={l}>{n}<textarea rows={2} maxLength={300} value={f[k][l]} onChange={setL(k, l)} dir={l === 'ar' ? 'rtl' : 'ltr'} placeholder={d.defaults[k][l]} /></label>
      ))}
      <p className="meta small">Vide = texte par défaut (en grisé ci-dessus).</p>
    </fieldset>
  );
  return (
    <form className="reg-form" onSubmit={save}>
      <label className="chk"><input type="checkbox" checked={f.enabled} onChange={set('enabled')} /> Activer le vendredi (carte sur l’accueil chaque vendredi, heure de Paris)</label>
      <label className="chk"><input type="checkbox" checked={f.showKahf} onChange={set('showKahf')} /> Bouton « Lire la sourate Al-Kahf » (si le Coran est importé)</label>
      <label className="chk"><input type="checkbox" checked={f.showGhusl} onChange={set('showGhusl')} /> Rappel de la grande ablution</label>
      {f.showGhusl && texts('ghusl', 'Texte du rappel de la grande ablution')}
      <label className="chk"><input type="checkbox" checked={f.showSalawat} onChange={set('showSalawat')} /> Rappel de la prière sur le Prophète</label>
      {f.showSalawat && texts('salawat', 'Texte du rappel de la prière sur le Prophète')}
      <label>Collection « Vidéos du vendredi » (rangée sous la carte)
        <select value={f.collectionId} onChange={set('collectionId')}>
          <option value="">— aucune —</option>
          {d.collections.map((c) => <option key={c.id} value={c.id}>{c.title}{c.published ? '' : ' (non publiée : ne s’affichera pas)'}</option>)}
        </select>
      </label>
      <label className="chk"><input type="checkbox" checked={f.notify} onChange={set('notify')} /> Notification le vendredi aux membres qui ont activé les notifications</label>
      {f.notify && (
        <>
          <label>Heure d’envoi (heure de Paris)<input type="number" min="0" max="23" value={f.notifyHour} onChange={set('notifyHour')} dir="ltr" /></label>
          {texts('notif', 'Texte de la notification')}
          <p className="meta small">Une seule notification par vendredi, jamais plus de 6 h après l’heure choisie.{d.lastNotifiedOn ? ` Dernier envoi : ${String(d.lastNotifiedOn).slice(0, 10)}.` : ''}</p>
        </>
      )}
      {msg && <p className="meta" role="status">✓ {msg}</p>}
      {err && <p className="error" role="alert">{err}</p>}
      <p><button className="btn" disabled={busy}>{t('seasonSave')}</button>{' '}<button type="button" className="btn ghost" onClick={test}>Envoyer la notification d’essai à mon compte</button></p>
    </form>
  );
}

export default function FridayAdmin() {
  const { t, call } = useApp();
  const [d, setD] = useState(null);
  const [err, setErr] = useState('');
  const load = useCallback(async () => {
    const r = await call('/admin/friday');
    if (r.ok) { setD(r.data); setErr(''); } else setErr(r.status === 404 ? 'Cette fonction est coupée (Admin → Fonctions → « Vendredi »).' : (r.data?.error || t('errGeneric')));
  }, [call, t]);
  useEffect(() => { load(); }, [load]);
  if (err) return <p className="error" role="alert">{err}</p>;
  if (!d) return null;
  return (
    <section>
      <h2>Vendredi</h2>
      <p className="meta">Le vendredi, l’accueil affiche une carte : lien vers la sourate Al-Kahf, rappel de la grande ablution, rappel de la prière sur le Prophète ﷺ, et une rangée de vidéos. Il n’y a pas de compteur de prières. Désactivé tant que vous ne l’activez pas.</p>
      <p className="meta">Aujourd’hui : {d.today.date} {d.today.isFriday ? '— c’est vendredi (la carte est visible si activée).' : '— ce n’est pas vendredi.'}</p>
      <p className="meta small">Les textes par défaut sont de simples rappels écrits par l’assistant : relisez-les et corrigez-les avant d’activer.</p>
      <Form d={d} onSaved={load} />
    </section>
  );
}
