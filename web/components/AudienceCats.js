'use client';
// Bloc « Public et catégories » d'une série : adultes / enfants (avec tranches d'âge) / les deux, puis catégories choisies à la main
// ou proposées par l'IA. Composant contrôlé : `value` = { audience, bands, categoryMode, categoryId, extra }.
import CategoryPicker from './CategoryPicker';
import { BANDS, bandLabel } from '../lib/kids';

export const AUDIENCE_DEFAULT = { audience: 'adult', bands: [], categoryMode: 'manual', categoryId: '', extra: [] };

// Corps de requête (POST / PATCH /series) à partir du bloc. `withCats` : inclure aussi les catégories.
export function audienceBody(v) {
  return {
    audience: v.audience, kidsBands: v.audience === 'adult' ? [] : v.bands, categoryMode: v.categoryMode,
    categoryId: v.categoryMode === 'manual' && v.categoryId ? Number(v.categoryId) : null,
    extraCategoryIds: v.categoryMode === 'manual' ? v.extra.map(Number) : [],
  };
}
export const bandsMissing = (v) => v.audience !== 'adult' && v.bands.length === 0;

export default function AudienceCats({ value, onChange, cats, t }) {
  const v = value;
  const set = (p) => onChange({ ...v, ...p });
  const toggleBand = (b) => set({ bands: v.bands.includes(b) ? v.bands.filter((x) => x !== b) : [...v.bands, b] });
  const kids = v.audience !== 'adult';
  return (
    <div className="sa-block">
      <fieldset className="imp-sec">
        <legend>{t('imp2Audience')}</legend>
        <div className="pills">
          {[['adult', t('imp2Adult')], ['kids', t('imp2Kids')], ['both', t('imp2Both')]].map(([k, label]) => (
            <button key={k} type="button" className={v.audience === k ? 'pill on' : 'pill'} aria-pressed={v.audience === k} onClick={() => set({ audience: k })}>{label}</button>
          ))}
        </div>
        {kids && (
          <>
            <span className="meta small">{t('imp2Bands')}</span>
            <div className="pills">
              {BANDS.map((b) => { const on = v.bands.includes(b); return <button key={b} type="button" className={on ? 'pill on' : 'pill'} aria-pressed={on} onClick={() => toggleBand(b)}>{on ? '✓ ' : ''}{bandLabel(b, t)}</button>; })}
            </div>
            {v.bands.length === 0 && <p className="error" role="alert">{t('imp2BandsNeeded')}</p>}
          </>
        )}
        <span className="meta small">{v.audience === 'kids' ? t('saKidsOnly') : v.audience === 'both' ? t('saBoth') : t('saAdultOnly')}</span>
      </fieldset>

      <fieldset className="imp-sec">
        <legend>{t('category')}</legend>
        <div className="imp-modes" role="radiogroup" aria-label={t('category')}>
          {[['manual', t('saCatManual'), t('saCatManualHelp')], ['auto', t('imp2CatAuto'), t('saCatAutoHelp')]].map(([k, label, help]) => (
            <label key={k} className={`imp-mode${v.categoryMode === k ? ' on' : ''}`}>
              <input type="radio" name="sa-catmode" checked={v.categoryMode === k} onChange={() => set({ categoryMode: k })} />
              <span><b>{label}</b><small className="meta">{help}</small></span>
            </label>
          ))}
        </div>
        {v.categoryMode === 'manual' && (
          <>
            <div className="fld" role="group" aria-label={t('category')}>
              <span>{t('category')}</span>
              <CategoryPicker cats={cats} mode="single" value={v.categoryId} onChange={(x) => set({ categoryId: x })} t={t} label={t('category')} />
              <span className="meta small">{t('txMainHelp')}</span>
            </div>
            <div className="fld" role="group" aria-label={t('txExtra')}>
              <span>{t('txExtra')}</span>
              <CategoryPicker cats={cats} mode="multi" max={20} value={v.extra} exclude={v.categoryId} onChange={(x) => set({ extra: x })} t={t} label={t('txExtra')} />
            </div>
          </>
        )}
      </fieldset>
    </div>
  );
}
