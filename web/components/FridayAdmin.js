'use client';
// Admin → Vendredi (étape 45C) : activer, choisir les éléments de la carte, relire et modifier les textes (FR / EN / AR),
// choisir la collection « Vidéos du vendredi », régler la notification (heure de Paris).
// Les textes par défaut sont de simples rappels : relisez-les avant d'activer.
import { useCallback, useEffect, useState } from 'react';
import { useApp } from './Providers';
import { Page, Metrics, Panel, Btn, Badge, Switch, Hint, Program, Quality, Ax, Field, c } from './backoffice/Kit';

const L = [['fr', 'Français'], ['en', 'English'], ['ar', 'العربية']];

function Form({ d, onSaved }) {
  const { t, call, skin } = useApp();
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
  // Thème Premium : composition de la maquette (A_FRIDAY) — Programme du vendredi | Configuration des rappels | Contrôle documentaire.
  if (skin === 'premium') {
    const flip = (k) => (v) => setF({ ...f, [k]: v });
    const col = d.collections.find((x) => String(x.id) === String(f.collectionId));
    const filled = (k) => L.filter(([l]) => (f[k]?.[l] || '').trim()).length;
    const Texts = ({ k, label }) => (
      <div style={{ padding: '0 14px' }}>
        <h3 style={{ margin: '12px 0 8px' }}>{label}</h3>
        {L.map(([l, n]) => (
          <label key={l} className={c('field')}><span>{n}</span>
            <textarea rows={2} maxLength={300} value={f[k][l]} onChange={setL(k, l)} dir={l === 'ar' ? 'rtl' : 'ltr'} placeholder={d.defaults[k][l]} />
          </label>
        ))}
      </div>
    );
    return (
      <form onSubmit={save}>
        <Ax kind="friday-layout">
          <Panel title="Programme du vendredi">
            <Program time="Accueil" title="Carte du vendredi" sub="Affichée chaque vendredi (heure de Paris)" tail={<Switch on={f.enabled} onChange={flip('enabled')} label="Activer le vendredi" />} />
            <Program time="Coran" title="Bouton « Lire la sourate Al-Kahf »" sub="Si le Coran est importé" tail={<Switch on={f.showKahf} onChange={flip('showKahf')} label="Bouton Al-Kahf" />} />
            <Program time="Rappel" title="Grande ablution" sub={`${filled('ghusl')}/3 langues personnalisées (sinon texte par défaut)`} tail={<Switch on={f.showGhusl} onChange={flip('showGhusl')} label="Rappel grande ablution" />} />
            <Program time="Rappel" title="Prière sur le Prophète" sub={`${filled('salawat')}/3 langues personnalisées (sinon texte par défaut)`} tail={<Switch on={f.showSalawat} onChange={flip('showSalawat')} label="Rappel prière sur le Prophète" />} />
            <Program time="Vidéos" title="Collection « Vidéos du vendredi »" sub={col ? col.title : 'Aucune collection choisie'} tail={col ? <Badge tone={col.published ? 'green' : 'amber'}>{col.published ? 'Publiée' : 'Non publiée'}</Badge> : <Badge tone="gray">—</Badge>} />
          </Panel>
          <Panel title="Configuration des rappels">
            <div style={{ padding: '4px 14px 14px' }}>
              <label className={c('field')}><span>Collection « Vidéos du vendredi »</span>
                <select value={f.collectionId} onChange={set('collectionId')}>
                  <option value="">— aucune —</option>
                  {d.collections.map((x) => <option key={x.id} value={x.id}>{x.title}{x.published ? '' : ' (non publiée)'}</option>)}
                </select>
              </label>
              <div className={c('ax-quality')} style={{ padding: '11px 0' }}><span style={{ flex: 1 }}>Notification hebdomadaire (membres ayant activé les notifications)</span><Switch on={f.notify} onChange={flip('notify')} label="Notification du vendredi" /></div>
              {f.notify && (
                <>
                  <label className={c('field')}><span>Heure d’envoi (heure de Paris)</span><input type="number" min="0" max="23" value={f.notifyHour} onChange={set('notifyHour')} dir="ltr" /></label>
                  <Texts k="notif" label="Texte de la notification" />
                  <p style={{ color: 'var(--muted)', fontSize: 11 }}>Une seule notification par vendredi, jamais plus de 6 h après l’heure choisie.{d.lastNotifiedOn ? ` Dernier envoi : ${String(d.lastNotifiedOn).slice(0, 10)}.` : ''}</p>
                </>
              )}
              {msg && <p role="status" style={{ color: 'var(--green)' }}>✓ {msg}</p>}
              {err && <p className="error" role="alert">{err}</p>}
              <div className={c('btn-row')} style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                <Btn type="submit" disabled={busy}>{t('seasonSave')}</Btn>
                <Btn primary={false} onClick={test}>Notification d’essai à mon compte</Btn>
              </div>
            </div>
          </Panel>
          <Panel title="Contrôle documentaire">
            {[['ghusl', 'Rappel de la grande ablution'], ['salawat', 'Rappel de la prière sur le Prophète']].map(([k, label]) => (
              <Quality key={k} icon={filled(k) === 3 ? 'check' : 'clock'} tail={<Badge tone={filled(k) === 3 ? 'green' : 'amber'}>{filled(k) === 3 ? 'Relu' : 'Texte par défaut'}</Badge>}>{label}</Quality>
            ))}
            {f.showGhusl && <Texts k="ghusl" label="Texte du rappel de la grande ablution" />}
            {f.showSalawat && <Texts k="salawat" label="Texte du rappel de la prière sur le Prophète" />}
            <div style={{ padding: 14 }}><Hint>Les textes par défaut sont de simples rappels écrits par l’assistant : relisez-les et corrigez-les avant d’activer. Les contenus liés à la pratique nécessitent une vérification humaine préalable.</Hint></div>
          </Panel>
        </Ax>
      </form>
    );
  }

  return (
    <form className="reg-form" onSubmit={save}>
      <label className="chk"><input type="checkbox" role="switch" checked={f.enabled} onChange={set('enabled')} /> Activer le vendredi (carte sur l’accueil chaque vendredi, heure de Paris)</label>
      <label className="chk"><input type="checkbox" role="switch" checked={f.showKahf} onChange={set('showKahf')} /> Bouton « Lire la sourate Al-Kahf » (si le Coran est importé)</label>
      <label className="chk"><input type="checkbox" role="switch" checked={f.showGhusl} onChange={set('showGhusl')} /> Rappel de la grande ablution</label>
      {f.showGhusl && texts('ghusl', 'Texte du rappel de la grande ablution')}
      <label className="chk"><input type="checkbox" role="switch" checked={f.showSalawat} onChange={set('showSalawat')} /> Rappel de la prière sur le Prophète</label>
      {f.showSalawat && texts('salawat', 'Texte du rappel de la prière sur le Prophète')}
      <label>Collection « Vidéos du vendredi » (rangée sous la carte)
        <select value={f.collectionId} onChange={set('collectionId')}>
          <option value="">— aucune —</option>
          {d.collections.map((c) => <option key={c.id} value={c.id}>{c.title}{c.published ? '' : ' (non publiée : ne s’affichera pas)'}</option>)}
        </select>
      </label>
      <label className="chk"><input type="checkbox" role="switch" checked={f.notify} onChange={set('notify')} /> Notification le vendredi aux membres qui ont activé les notifications</label>
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
  const { t, call, skin } = useApp();
  const [d, setD] = useState(null);
  const [err, setErr] = useState('');
  const load = useCallback(async () => {
    const r = await call('/admin/friday');
    if (r.ok) { setD(r.data); setErr(''); } else setErr(r.status === 404 ? 'Cette fonction est coupée (Admin → Fonctions → « Vendredi »).' : (r.data?.error || t('errGeneric')));
  }, [call, t]);
  useEffect(() => { load(); }, [load]);
  if (err) return <p className="error" role="alert">{err}</p>;
  if (!d) return null;
  if (skin === 'premium') {
    return (
      <Page title="Vendredi — espace éditorial" sub="Planifiez la carte du vendredi, ses rappels et les ressources de la semaine.">
        <Metrics cols="three" items={[
          { icon: 'check', tone: d.enabled ? 'green' : 'amber', label: 'Carte du vendredi', value: d.enabled ? 'Activée' : 'Désactivée' },
          { icon: 'bell', label: 'Notification', value: d.notify ? `${String(d.notifyHour).padStart(2, '0')} h` : 'Aucune' },
          { icon: 'clock', label: 'Aujourd’hui', value: d.today.isFriday ? 'Vendredi' : 'Pas vendredi', note: d.today.date },
        ]} />
        <Form d={d} onSaved={load} />
      </Page>
    );
  }
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
