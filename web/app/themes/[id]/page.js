'use client';
// Étape 31.1 — Page d'un thème : description, trois « petits pas », conférences du catalogue associées,
// et, pour les membres Apprentissage, « Ajouter à mes objectifs » ou « M'engager » sur un pas.
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useApp } from '../../../components/Providers';

const dots = (n) => '●'.repeat(n);

function Actions({ th, t, call, user }) {
  const [step, setStep] = useState(1);
  const [niyya, setNiyya] = useState('');
  const [consent, setConsent] = useState(false);
  const [needConsent, setNeedConsent] = useState(false);
  const [msg, setMsg] = useState(null); // { ok, text, upsell }
  const [busy, setBusy] = useState(false);
  if (!user) return <p className="meta"><Link className="link u" href="/login">{t('thLogin')}</Link></p>;
  const run = async (path, body, okText) => {
    setBusy(true); setMsg(null);
    const r = await call(path, { method: 'POST', body: JSON.stringify({ ...body, ...(needConsent ? { consent } : {}) }) });
    setBusy(false);
    if (r.ok) { setMsg({ ok: true, text: okText }); setNeedConsent(false); return; }
    const code = r.data?.code;
    if (code === 'consent_required') { setNeedConsent(true); setMsg({ ok: false, text: t('pzNeedConsent') }); return; }
    if (code === 'learning_required') { setMsg({ ok: false, text: t('thNeedLearning'), upsell: true }); return; }
    setMsg({ ok: false, text: r.data?.error || t('errGeneric') });
  };
  return (
    <div className="th-actions">
      <h2>{t('thCommitTitle')}</h2>
      <div className="pills" role="radiogroup" aria-label={t('thPickStep')}>
        {th.steps.map((s) => (
          <button key={s.size} type="button" role="radio" aria-checked={step === s.size} className={step === s.size ? 'pill on' : 'pill'} onClick={() => setStep(s.size)}>{dots(s.size)} {t(`pzSize${s.size}`)}</button>
        ))}
      </div>
      <p className="th-step">{th.steps[step - 1].text}</p>
      <label className="fld"><span>{t('pzNiyya')}</span>
        <input value={niyya} maxLength={500} placeholder={t('pzNiyyaPh')} onChange={(e) => setNiyya(e.target.value)} />
      </label>
      {needConsent && (
        <label className="rv-email"><input type="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)} /> <span>{t('pzConsent')}</span></label>
      )}
      <div className="panel-actions">
        <button type="button" className="btn" disabled={busy || (needConsent && !consent)} onClick={() => run(`/me/practice/themes/${th.id}`, { size: step, niyya, due: 'week' }, t('thCommitted'))}>{t('thCommit')}</button>
        {th.kind !== 'action' && (
          <button type="button" className="btn ghost" disabled={busy || (needConsent && !consent)} onClick={() => run('/me/selfcheck/goals', { nature: th.kind, themeId: th.id }, t('thGoalAdded'))}>{t('thAddGoal')}</button>
        )}
      </div>
      {msg && <p className={msg.ok ? 'ok-msg' : 'error'} role={msg.ok ? 'status' : 'alert'}>{msg.text} {msg.ok && <Link className="link u" href="/learning">{t('thSeeMine')}</Link>}{msg.upsell && <Link className="link u" href="/pricing">{t('thSeeOffer')}</Link>}</p>}
      <p className="meta small">{t('thPrivacy')}</p>
    </div>
  );
}

export default function ThemePage() {
  const { id } = useParams();
  const { t, call, user } = useApp();
  const [th, setTh] = useState(null);
  const [missing, setMissing] = useState(false);
  useEffect(() => { call(`/themes/${id}`, {}, null).then((r) => (r.ok ? setTh(r.data) : setMissing(true))); }, [call, id]);
  if (missing) return <main className="th-page"><Link href="/themes" className="back">← {t('thTitle')}</Link><p className="soon">{t('thNotFound')}</p></main>;
  if (!th) return <main className="th-page"><p className="meta">…</p></main>;
  return (
    <main className="th-page th-detail">
      <Link href="/themes" className="back">← {t('thTitle')}</Link>
      <h1>{th.title}</h1>
      {(th.translit || th.ar) && <p className="meta">{[th.translit, th.ar].filter(Boolean).join(' · ')}</p>}
      <p className="th-lead">{th.desc}</p>
      <h2>{t('thSteps')}</h2>
      <ol className="th-steps">
        {th.steps.map((s) => <li key={s.size}><span className="pz-size" aria-label={t(`pzSize${s.size}`)}>{dots(s.size)}</span> {s.text}</li>)}
      </ol>
      <p className="meta small">{t('thStepsNote')}</p>
      <Actions th={th} t={t} call={call} user={user} />
      <h2>{t('thTalks')}</h2>
      {th.talks.length === 0 ? <p className="meta">{t('thNoTalks')}</p> : (
        <ul className="th-talks">
          {th.talks.map((x) => <li key={x.id}><Link href={`/talks/${x.id}`}><b>{x.title}</b></Link>{x.speaker && <span className="meta small"> · {x.speaker}</span>}</li>)}
        </ul>
      )}
    </main>
  );
}
