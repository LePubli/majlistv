'use client';
// Étape 31.1 — Studio : thèmes « Du savoir à l'action » associés à une conférence (3 au maximum).
// Ils servent à relier la conférence à la bibliothèque de thèmes et à « Mon évolution » des membres.
import { useEffect, useState } from 'react';

export default function ThemesPicker({ id, t, call }) {
  const [d, setD] = useState(null);
  const [sel, setSel] = useState([]);
  const [msg, setMsg] = useState(null);
  useEffect(() => { call(`/studio/talks/${id}/themes`).then((r) => { if (r.ok) { setD(r.data); setSel(r.data.selected); } }); }, [call, id]);
  if (!d) return null;
  const toggle = (x) => setSel((s) => (s.includes(x) ? s.filter((y) => y !== x) : s.length >= d.max ? s : [...s, x]));
  const save = async () => {
    setMsg(null);
    const r = await call(`/studio/talks/${id}/themes`, { method: 'PUT', body: JSON.stringify({ themeIds: sel }) });
    setMsg(r.ok ? { ok: true, text: t('saved') } : { ok: false, text: r.data?.error || t('errGeneric') });
  };
  const groups = [['quality', 'thQualities'], ['defect', 'thDefects'], ['action', 'thActions']];
  return (
    <section className="panel th-picker">
      <h2 className="panel-title">{t('thPickerTitle')}</h2>
      <p className="meta">{t('thPickerIntro').replace('{n}', d.max)}</p>
      {!d.enabled && <p className="meta small">{t('thPickerOff')}</p>}
      {groups.map(([kind, label]) => (
        <fieldset key={kind} className="th-fs">
          <legend>{t(label)}</legend>
          <div className="pills">
            {d.themes.filter((x) => x.kind === kind).map((x) => {
              const on = sel.includes(x.id);
              return <button key={x.id} type="button" aria-pressed={on} disabled={!on && sel.length >= d.max} className={on ? 'pill on' : 'pill'} onClick={() => toggle(x.id)}>{x.title}</button>;
            })}
          </div>
        </fieldset>
      ))}
      <div className="panel-actions">
        <button type="button" className="btn" onClick={save}>{t('save')}</button>
        <span className="meta small">{t('thPickerCount').replace('{a}', sel.length).replace('{b}', d.max)}</span>
      </div>
      {msg && <p className={msg.ok ? 'ok-msg' : 'error'} role="status">{msg.text}</p>}
    </section>
  );
}
