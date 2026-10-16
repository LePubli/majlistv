'use client';
// Module « Doublage français » — curseurs de réglages (voix, préréglages, volume, accélération, réglages avancés).
// Utilisé pour les réglages par défaut (tout le site) et pour une conférence.
import { useApp } from '../../components/Providers';
import { fmtNum } from './shared';

// Affichage d'une valeur selon le réglage
function show(key, v, locale) {
  if (key === 'duck') return `${fmtNum(v, locale, 0)} %`;
  if (key === 'maxSpeedup') return `× ${fmtNum(v, locale, 2)}`;
  if (key === 'vcChunk' || key === 'borrow') return `${fmtNum(v, locale, 1)} s`;
  return fmtNum(v, locale, 3);
}

export function Slider({ k, value, def, params, onChange, disabled = false }) {
  const { t, locale } = useApp();
  const p = params[k];
  const id = `db-${k}`;
  return (
    <div className={`db-slider${disabled ? ' off' : ''}`}>
      <div className="db-slider-top">
        <label htmlFor={id}>{t(`dbP_${k}`)}</label>
        <output htmlFor={id}>{show(k, value, locale)}</output>
      </div>
      <input id={id} type="range" min={p.min} max={p.max} step={p.step} value={value} disabled={disabled}
        onChange={(e) => onChange({ [k]: Number(e.target.value) })} />
      <small className="meta">{t(`dbH_${k}`)}{def != null && Number(def) !== Number(value) ? ` · ${t('dbDefaultIs')} ${show(k, def, locale)}` : ''}</small>
    </div>
  );
}

// value : réglages affichés ; reference : valeurs de référence (réglages par défaut pour une conférence, valeurs d'origine sinon)
export default function ParamsForm({ state, value, reference, onChange, showVoices = true }) {
  const { t } = useApp();
  const { params, presets, voices } = state;
  const base = voices.filter((v) => v.kind === 'base');
  const targets = voices.filter((v) => v.kind === 'target');
  const hasTarget = Boolean(value.targetVoice);
  const presetOn = (p) => Object.entries(presets[p]).every(([k, v]) => Number(value[k]) === v);
  const sl = (k, extra = {}) => <Slider key={k} k={k} value={value[k]} def={reference?.[k]} params={params} onChange={onChange} {...extra} />;
  return (
    <div className="db-form">
      {showVoices && (
        <div className="db-voice-selects">
          <label className="fld"><span>{t('dbBaseVoice')}</span>
            <select value={value.baseVoice || ''} onChange={(e) => onChange({ baseVoice: e.target.value })}>
              {base.map((v) => <option key={v.id} value={v.id}>{v.name}{v.gender ? ` · ${t('dbG_' + v.gender)}` : ''}</option>)}
            </select>
          </label>
          <label className="fld"><span>{t('dbTargetVoice')}</span>
            <select value={value.targetVoice || ''} onChange={(e) => onChange({ targetVoice: e.target.value || null })}>
              <option value="">{t('dbNoTarget')}</option>
              {targets.map((v) => <option key={v.id} value={v.id}>{v.name}</option>)}
            </select>
          </label>
        </div>
      )}
      <div className="db-presets" role="group" aria-label={t('dbPresets')}>
        <span className="meta">{t('dbPresets')}</span>
        {Object.keys(presets).map((p) => (
          <button key={p} type="button" className={`pill${presetOn(p) ? ' on' : ''}`} aria-pressed={presetOn(p)} disabled={!hasTarget}
            onClick={() => onChange({ ...presets[p] })} title={t(`dbPresetH_${p}`)}>{t(`dbPreset_${p}`)}</button>
        ))}
        {!hasTarget && <small className="meta">{t('dbPresetsNeedTarget')}</small>}
      </div>
      {sl('duck')}
      {sl('maxSpeedup')}
      <details className="db-adv">
        <summary>{t('dbAdvanced')}</summary>
        <div className="db-adv-body">
          {sl('vcSteps', { disabled: !hasTarget })}
          {sl('vcChunk', { disabled: !hasTarget })}
          {sl('borrow')}
          {sl('lengthScale')}
          {sl('noiseScale')}
          {sl('noiseW')}
        </div>
      </details>
    </div>
  );
}
