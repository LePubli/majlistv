'use client';
// Bilan de Ramadan (étape 45G) : à partir du 20e jour et jusqu'à 60 jours après la fin. Chiffres personnels, jamais comparés,
// et une note personnelle chiffrée « ce que je garde après Ramadan ».
import { useCallback, useEffect, useState } from 'react';
import { useApp } from './Providers';

export default function RamadanBilan({ ended = false }) {
  const { t, call, feat } = useApp();
  const [b, setB] = useState(undefined);
  const [note, setNote] = useState('');
  const [msg, setMsg] = useState(''); const [err, setErr] = useState('');
  const load = useCallback(() => call('/ramadan/bilan').then((r) => { const x = r.ok ? r.data.bilan : null; setB(x); setNote(x?.note || ''); }), [call]);
  useEffect(() => { load(); }, [load]);
  if (!b) return null;
  const save = async (e) => {
    e.preventDefault(); setMsg(''); setErr('');
    const r = await call('/ramadan/bilan/note', { method: 'PUT', body: JSON.stringify({ text: note }) });
    if (r.ok) setMsg(t('rbSaved')); else setErr(r.data?.error || t('errGeneric'));
  };
  const cards = [
    ['✅', `${b.actions.done} / ${b.actions.expected}`, t('rbActions')],
    ['📅', `${b.actions.fullDays} / ${b.daysPassed}`, t('rbFullDays')],
    ['🌙', String(b.tarawih.nights), t('rbTarawih') + (b.tarawih.rakaat ? ` · ${t('rbRakaat').replace('{n}', b.tarawih.rakaat)}` : '')],
    ...(feat('quranplan') ? [['📖', String(b.quranJuz), t('rbJuz')]] : []),
    ...(feat('athkar') ? [['📿', String(b.athkarDays), t('rbAthkar')]] : []),
  ];
  return (
    <section className="rb" aria-labelledby="rb-t">
      {ended && <p className="rb-ended" role="status">{t('rbEnded').replace('{y}', b.hyear)}</p>}
      <h2 id="rb-t">{t('rbTitle').replace('{y}', b.hyear)}</h2>
      <p className="meta small">{t('rbIntro')}</p>
      <div className="rb-cards">
        {cards.map(([i, v, l]) => <div key={l} className="rb-card"><span aria-hidden="true">{i}</span><b dir="ltr">{v}</b><span>{l}</span></div>)}
      </div>
      {(b.tarawih.mosque > 0 || b.tarawih.home > 0) && <p className="meta small">{t('rbPlaces').replace('{m}', b.tarawih.mosque).replace('{h}', b.tarawih.home)}</p>}
      <form className="rb-note" onSubmit={save}>
        <label>{t('rbNote')}<textarea rows={4} maxLength={4000} value={note} onChange={(e) => setNote(e.target.value)} placeholder={t('rbNoteHint')} /></label>
        <p className="meta small">{t('rbPrivate')}</p>
        {msg && <p className="meta" role="status">✓ {msg}</p>}
        {err && <p className="error" role="alert">{err}</p>}
        <p><button className="btn">{t('rbSave')}</button></p>
      </form>
    </section>
  );
}
