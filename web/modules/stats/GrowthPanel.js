'use client';
// Amélioration 7.1 — Croissance (Admin → Statistiques) : entonnoir visiteurs → inscrits → essais → payants, et deux tableaux de cohortes.
// Chiffres agrégés uniquement : jamais d'identité. Les cohortes trop petites n'affichent pas de pourcentage trompeur (taille seule).
import { useEffect, useMemo, useState } from 'react';
import { useApp } from '../../components/Providers';

const MIN_COHORT = 5; // en dessous, une case de 1 personne = 100 % : on affiche le nombre, pas le pourcentage

function Cohorts({ title, hint, rows, t, locale, nf }) {
  const maxK = Math.max(0, ...rows.map((r) => r.cells.length));
  const fmtMonth = (m) => new Date(m + '-01T12:00:00').toLocaleDateString(locale, { month: 'short', year: '2-digit' });
  const shade = (p) => (p == null ? 'transparent' : `rgba(212, 175, 55, ${Math.max(0.08, Math.min(0.85, p / 100 * 0.85))})`);
  const any = rows.some((r) => r.size > 0);
  return (
    <section className="st-card gr-card">
      <h4>{title}</h4>
      <p className="meta gr-hint">{hint}</p>
      {!any ? <p className="st-empty">{t('grNoCohort')}</p> : (
        <div className="gr-wrap">
          <table className="gr-table">
            <thead>
              <tr><th>{t('grCohort')}</th><th>{t('grSize')}</th>{Array.from({ length: maxK }, (_, k) => <th key={k}>{k === 0 ? t('grMonth0') : `+${k}`}</th>)}</tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.cohort}>
                  <th scope="row">{fmtMonth(r.cohort)}</th>
                  <td>{nf.format(r.size)}</td>
                  {Array.from({ length: maxK }, (_, k) => {
                    const c = r.cells[k];
                    if (!c || r.size === 0) return <td key={k} className="gr-empty">·</td>;
                    const small = r.size < MIN_COHORT;
                    return (
                      <td key={k} className="gr-cell" style={{ background: small ? 'transparent' : shade(c.pct) }} title={`${c.n} / ${r.size}`}>
                        {small ? <small>{c.n}</small> : `${c.pct} %`}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

export default function GrowthPanel({ days }) {
  const { call, t, locale } = useApp();
  const [g, setG] = useState(null);
  const [err, setErr] = useState(false);
  const nf = useMemo(() => new Intl.NumberFormat(locale), [locale]);
  useEffect(() => {
    let off = false;
    setErr(false);
    call(`/admin/stats/growth?days=${days}`).then((r) => { if (off) return; if (r.ok) setG(r.data); else setErr(true); });
    return () => { off = true; };
  }, [call, days]);

  if (err && !g) return <p className="error">{t('stLoadErr')}</p>;
  if (!g) return <p className="meta">…</p>;
  const f = g.funnel;
  const pc = (v) => (v == null ? '—' : `${String(v).replace('.', locale === 'fr' ? ',' : '.')} %`);
  const steps = [
    { key: 'visitors', label: t('grVisitors'), n: f.visitors, rate: null },
    { key: 'signups', label: t('grSignups'), n: f.signups, rate: f.rates.signupPerVisitor, rateLabel: t('grOfVisitors') },
    { key: 'trials', label: t('grTrials'), n: f.trials, rate: f.rates.trialPerSignup, rateLabel: t('grOfSignups') },
    { key: 'paid', label: t('grPaid'), n: f.paid, rate: f.rates.paidPerSignup, rateLabel: t('grOfSignups') },
  ];
  const max = Math.max(1, ...steps.map((s) => s.n));
  return (
    <section className="gr" aria-labelledby="gr-title">
      <h3 id="gr-title">{t('grTitle')}</h3>
      <p className="meta">{t('grIntro')}</p>
      <section className="st-card gr-card">
        <h4>{t('grFunnel')}</h4>
        <ol className="gr-funnel">
          {steps.map((s) => (
            <li key={s.key}>
              <div className="gr-fhead"><span>{s.label}</span><strong>{nf.format(s.n)}</strong></div>
              <div className="gr-track" aria-hidden="true"><i style={{ width: `${Math.max(s.n > 0 ? 2 : 0, Math.round((100 * s.n) / max))}%` }} /></div>
              {s.rate != null && <small className="meta">{pc(s.rate)} {s.rateLabel}</small>}
            </li>
          ))}
        </ol>
        <dl className="st-dl">
          <div><dt>{t('grPaidLearning')}</dt><dd>{nf.format(f.paidLearning)}</dd></div>
          <div><dt>{t('grPaidStandard')}</dt><dd>{nf.format(f.paidStandard)}</dd></div>
          <div><dt>{t('grTrialToPaid')}</dt><dd>{pc(f.rates.paidPerTrial)}</dd></div>
        </dl>
        <p className="meta gr-hint">{t('grFunnelNote')}</p>
      </section>
      <Cohorts title={t('grRetentionTitle')} hint={t('grRetentionHint')} rows={g.retention} t={t} locale={locale} nf={nf} />
      <Cohorts title={t('grActivityTitle')} hint={t('grActivityHint')} rows={g.activity} t={t} locale={locale} nf={nf} />
    </section>
  );
}
