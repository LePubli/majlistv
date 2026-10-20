'use client';
// Éditeur de montage (étape E3) — panneau « Piste sélectionnée » de l'habillage (maquette « Studio v2 », écran 4) :
//   Titres et logo : vue d'ensemble · un titre ou un bandeau de nom · le logo · l'intro et l'écran de fin
//   Raccord        : transition (coupure, fondu au noir, fondu au blanc) d'un raccord ou de tous
//   Sous-titres    : incrustés dans l'image ou non, taille, place, fond
// Les réglages passent par setDress(nouvelHabillage, clé) ; une clé identique à moins de 1,5 s = un seul geste à annuler.
import { useEffect, useState } from 'react';
import { useApp } from '../../components/Providers';
import { fmtTime, parseTime, patchItem, moveItem, trimItem, setTransition, layout, TRANSITION_TYPES, fillVars, isFree } from './ops';
import { Slider, Check } from './AudioPanel';

function TimeField({ id, label, value, onCommit, disabled, empty }) {
  const [v, setV] = useState(value == null ? '' : fmtTime(value, { tenths: true }));
  useEffect(() => { setV(value == null ? '' : fmtTime(value, { tenths: true })); }, [value]);
  const apply = (str) => {
    if (!str.trim() && empty) { onCommit(null); return; }
    const n = parseTime(str);
    if (!Number.isNaN(n)) onCommit(n); else setV(value == null ? '' : fmtTime(value, { tenths: true }));
  };
  return (
    <div className="mt-field">
      <label htmlFor={id}>{label}</label>
      <input id={id} dir="ltr" value={v} disabled={disabled} placeholder={empty || ''} onChange={(e) => setV(e.target.value)} onBlur={(e) => apply(e.target.value)}
        onKeyDown={(e) => { if (e.key === 'Enter') apply(e.currentTarget.value); }} />
    </div>
  );
}
// Étape E6b : rappel « glisser sur la vidéo » et retour à la position prédéfinie.
function FreePos({ free, disabled, onReset }) {
  const { t } = useApp();
  return (
    <div className="mt-free" data-free={free ? '1' : '0'}>
      <p className="meta small">{free ? t('mtpFree') : t('mtpHint')}</p>
      {free && <button type="button" className="btn ghost sd-pill" disabled={disabled} onClick={onReset} data-act="preset">{t('mtpReset')}</button>}
    </div>
  );
}

function Seg({ value, options, onChange, disabled, label }) {
  return (
    <div className="mt-seg" role="group" aria-label={label}>
      {options.map(([k, text]) => <button key={k} type="button" aria-pressed={value === k} disabled={disabled} onClick={() => onChange(k)} data-val={k}>{text}</button>)}
    </div>
  );
}

export default function DressPanel({ sel, setSel, dress, setDress, canEdit, clips, totalS, T, setT, vars, channel, logos, onPickLogo, onShowCard, onFrame, onAddItem, subsInfo, durationFinal }) {
  const { t } = useApp();
  const L = layout(clips);
  const dis = !canEdit;
  const set = (patch, key) => setDress({ ...dress, ...patch }, key);

  // --- Un titre ou un bandeau
  if (sel.track === 'item') {
    const it = dress.items.find((i) => i.id === sel.id);
    if (!it) return <Overview />;
    const upd = (patch, key) => setDress({ ...dress, items: patchItem(dress.items, it.id, patch) }, key ? `item-${it.id}-${key}` : undefined);
    return (
      <div className="mt-panel" data-panel="item">
        <h3 id="mt-sel-title">{it.kind === 'banner' ? t('mtAddBanner') : t('mtAddTitle')}</h3>
        <div className="mt-field">
          <label htmlFor="mtd-text">{it.kind === 'banner' ? t('mtdName') : t('mtdText')}</label>
          <textarea id="mtd-text" dir="auto" rows={2} maxLength={200} value={it.text} disabled={dis} onChange={(e) => upd({ text: e.target.value }, 'text')} />
        </div>
        <div className="mt-field">
          <label htmlFor="mtd-sub">{it.kind === 'banner' ? t('mtdRole') : t('mtdSubline')}</label>
          <input id="mtd-sub" dir="auto" maxLength={200} value={it.sub} disabled={dis} onChange={(e) => upd({ sub: e.target.value }, 'sub')} />
        </div>
        <p className="mt-hint">{t('mtdVarsHint').replace('{a}', '{titre}').replace('{b}', '{intervenant}')}</p>
        {(it.text.includes('{') || it.sub.includes('{')) && <p className="meta small" dir="auto">{t('mtdVarsNow')} {[fillVars(it.text, vars), fillVars(it.sub, vars)].filter(Boolean).join(' · ')}</p>}
        <TimeField id="mtd-start" label={t('mtdStart')} value={it.start} disabled={dis} onCommit={(v) => setDress({ ...dress, items: moveItem(dress.items, it.id, Math.min(v, Math.max(0, totalS - 0.5))) })} />
        <TimeField id="mtd-end" label={t('mtdEnd')} value={it.start + it.len} disabled={dis} onCommit={(v) => setDress({ ...dress, items: trimItem(dress.items, it.id, 'out', Math.min(v, totalS)) })} />
        {it.kind === 'title'
          ? <div className="mt-field"><label>{t('mtdPlace')}</label><Seg label={t('mtdPlace')} disabled={dis} value={isFree(it) ? '' : it.pos} onChange={(v) => upd({ pos: v, x: null, y: null })} options={[['top', t('mtdTop')], ['center', t('mtdCenter')], ['bottom', t('mtdBottom')]]} /></div>
          : <div className="mt-field"><label>{t('mtdSide')}</label><Seg label={t('mtdSide')} disabled={dis} value={isFree(it) ? '' : it.side} onChange={(v) => upd({ side: v, x: null, y: null })} options={[['left', t('mtdLeft')], ['right', t('mtdRight')]]} /></div>}
        <FreePos free={isFree(it)} disabled={dis} onReset={() => upd({ x: null, y: null })} />
        <Slider id="mtd-scale" label={t('mtdSize')} value={it.scale} min={50} max={200} step={5} shown={`${it.scale} %`} disabled={dis} onChange={(v) => upd({ scale: v }, 'scale')} />
        <div className="mt-actions">
          <button type="button" className="btn ghost sd-pill" onClick={() => setT(it.start)}>{t('mtGoStart')}</button>
          <button type="button" className="btn ghost sd-pill" onClick={() => onFrame(Math.min(totalS, it.start + Math.min(1, it.len / 2)))} data-act="frame">{t('mtdFrame')}</button>
          <button type="button" className="btn ghost sd-pill" disabled={dis} onClick={() => { setDress({ ...dress, items: dress.items.filter((i) => i.id !== it.id) }); setSel({ track: 'titles', id: null }); }}>{t('mtDel')}</button>
        </div>
      </div>
    );
  }

  // --- Logo
  if (sel.track === 'logo') {
    const lg = dress.logo;
    const upd = (patch, key) => setDress({ ...dress, logo: { ...lg, ...patch } }, key ? `logo-${key}` : undefined);
    const chosen = lg.asset && lg.asset !== 'channel' ? (logos || []).find((x) => x.id === lg.asset) : null;
    return (
      <div className="mt-panel" data-panel="logo">
        <h3 id="mt-sel-title">{t('mtAddLogo')}</h3>
        <Check id="mtd-logo-on" label={t('mtdLogoOn')} checked={lg.on} disabled={dis} onChange={(v) => upd({ on: v })} />
        <div className="mt-field">
          <label>{t('mtdLogoSrc')}</label>
          <Seg label={t('mtdLogoSrc')} disabled={dis} value={lg.asset === 'channel' ? 'channel' : 'file'}
            onChange={(v) => { if (v === 'channel') upd({ asset: 'channel' }); else onPickLogo(); }} options={[['channel', t('mtdLogoChannel')], ['file', t('mtdLogoFile')]]} />
        </div>
        {lg.asset === 'channel'
          ? <p className="meta small">{channel?.avatarUrl ? t('mtdChannelLogo').replace('{n}', channel.name) : t('mtdNoChannelLogo')}</p>
          : <p className="meta small" dir="auto">{chosen ? chosen.title : lg.asset ? t('mtdLogoMissing') : t('mtdLogoNone')}{chosen?.w ? ` · ${chosen.w}×${chosen.h}` : ''}</p>}
        {lg.asset !== 'channel' && <button type="button" className="btn ghost sd-pill" disabled={dis} onClick={onPickLogo}>{t('mtdLogoChoose')}</button>}
        <div className="mt-field"><label>{t('mtdCorner')}</label>
          <Seg label={t('mtdCorner')} disabled={dis} value={isFree(lg) ? '' : lg.pos} onChange={(v) => upd({ pos: v, x: null, y: null })} options={[['tl', '↖'], ['tr', '↗'], ['bl', '↙'], ['br', '↘']]} /></div>
        <FreePos free={isFree(lg)} disabled={dis} onReset={() => upd({ x: null, y: null })} />
        <Slider id="mtd-logo-size" label={t('mtdLogoSize')} value={lg.size} min={4} max={40} step={1} shown={`${lg.size} %`} disabled={dis} onChange={(v) => upd({ size: v }, 'size')} />
        <Slider id="mtd-logo-op" label={t('mtdOpacity')} value={lg.opacity} min={10} max={100} step={5} shown={`${lg.opacity} %`} disabled={dis} onChange={(v) => upd({ opacity: v }, 'op')} />
        <TimeField id="mtd-logo-from" label={t('mtdFrom')} value={lg.from} disabled={dis} onCommit={(v) => upd({ from: Math.min(v, totalS), to: lg.to != null && lg.to <= v ? null : lg.to })} />
        <TimeField id="mtd-logo-to" label={t('mtdTo')} value={lg.to} empty={t('mtdToEnd')} disabled={dis} onCommit={(v) => upd({ to: v == null || v <= lg.from ? null : Math.min(v, totalS) })} />
        <div className="mt-actions"><button type="button" className="btn ghost sd-pill" onClick={() => onFrame(Math.max(lg.from, Math.min(T, totalS)))} data-act="frame">{t('mtdFrame')}</button></div>
      </div>
    );
  }

  // --- Intro et écran de fin
  if (sel.track === 'cards') {
    const card = (k) => {
      const c = dress[k];
      const upd = (patch, key) => setDress({ ...dress, [k]: { ...c, ...patch } }, key ? `${k}-${key}` : undefined);
      const label = k === 'intro' ? t('mtdIntro') : t('mtdOutro');
      return (
        <fieldset className="mt-card-set" data-card={k}>
          <legend>{label}</legend>
          <Check id={`mtd-${k}-on`} label={t('mtdCardOn').replace('{c}', label.toLowerCase())} checked={c.on} disabled={dis} onChange={(v) => upd({ on: v })} />
          {c.on && <>
            <div className="mt-field"><label htmlFor={`mtd-${k}-title`}>{t('mtdCardTitle')}</label><input id={`mtd-${k}-title`} dir="auto" maxLength={160} value={c.title} disabled={dis} onChange={(e) => upd({ title: e.target.value }, 'title')} /></div>
            <div className="mt-field"><label htmlFor={`mtd-${k}-sub`}>{t('mtdCardSub')}</label><input id={`mtd-${k}-sub`} dir="auto" maxLength={160} value={c.sub} disabled={dis} onChange={(e) => upd({ sub: e.target.value }, 'sub')} /></div>
            <Slider id={`mtd-${k}-len`} label={t('mtdCardLen')} value={c.len} min={1} max={15} step={0.5} shown={`${c.len} s`} disabled={dis} onChange={(v) => upd({ len: v }, 'len')} />
            <div className="mt-actions">
              <button type="button" className="btn ghost sd-pill" onClick={() => onShowCard(k)} data-act={`show-${k}`}>{t('mtdShowCard')}</button>
              <button type="button" className="btn ghost sd-pill" onClick={() => onFrame(k)} data-act={`frame-${k}`}>{t('mtdFrame')}</button>
            </div>
          </>}
        </fieldset>
      );
    };
    return (
      <div className="mt-panel" data-panel="cards">
        <h3 id="mt-sel-title">{t('mtAddIntro')}</h3>
        <p className="mt-hint">{t('mtdCardsHint')}</p>
        {card('intro')}{card('outro')}
        <p className="meta small" data-final>{t('mtdFinalLen').replace('{a}', fmtTime(durationFinal)).replace('{b}', fmtTime(totalS))}</p>
      </div>
    );
  }

  // --- Transition d'un raccord ou de tous
  if (sel.track === 'join') {
    const all = sel.id === 'all';
    const idx = all ? -1 : L.findIndex((c) => c.id === sel.id);
    if (!all && idx < 1) return <Overview />;
    const own = all ? dress.transitions.all : dress.transitions.byClip[sel.id];
    const eff = own || dress.transitions.all;
    const type = eff?.type || 'cut'; const len = eff?.len || 0.8;
    const apply = (tr, key) => setDress(setTransition(dress, sel.id, tr), key ? `tr-${sel.id}-${key}` : undefined);
    const names = { cut: t('mtdTrCut'), dip: t('mtdTrDip'), dipwhite: t('mtdTrWhite') };
    return (
      <div className="mt-panel" data-panel="join">
        <h3 id="mt-sel-title">{t('mtAddTransition')}</h3>
        <p className="meta">{all ? t('mtdJoinAll') : t('mtdJoinN').replace('{a}', fmtTime(L[idx].start, { tenths: true }))}</p>
        <div className="mt-field"><label>{t('mtdTrType')}</label>
          <Seg label={t('mtdTrType')} disabled={dis} value={type} onChange={(v) => apply({ type: v, len })} options={TRANSITION_TYPES.map((k) => [k, names[k]])} /></div>
        {type !== 'cut' && <Slider id="mtd-tr-len" label={t('mtdTrLen')} value={len} min={0.2} max={3} step={0.1} shown={`${len.toLocaleString(undefined, { maximumFractionDigits: 1 })} s`} disabled={dis} onChange={(v) => apply({ type, len: v }, 'len')} />}
        <p className="mt-hint">{t('mtdTrHint')}</p>
        <div className="mt-actions">
          {!all && own && <button type="button" className="btn ghost sd-pill" disabled={dis} onClick={() => apply(null)}>{t('mtdTrDefault')}</button>}
          {!all && <button type="button" className="btn ghost sd-pill" disabled={dis || type === 'cut'} onClick={() => setDress({ ...dress, transitions: { all: { type, len }, byClip: {} } })} data-act="all">{t('mtdTrAll')}</button>}
          {!all && <button type="button" className="btn ghost sd-pill" onClick={() => onFrame(L[idx].start)} data-act="frame">{t('mtdFrame')}</button>}
          {all && <button type="button" className="btn ghost sd-pill" disabled={dis} onClick={() => { apply(null); setSel({ track: 'titles', id: null }); }}>{t('mtdTrRemove')}</button>}
        </div>
      </div>
    );
  }

  // --- Sous-titres incrustés
  if (sel.track === 'subs') {
    const sb = dress.subs;
    const upd = (patch, key) => setDress({ ...dress, subs: { ...sb, ...patch } }, key ? `subs-${key}` : undefined);
    return (
      <div className="mt-panel" data-panel="subs">
        <h3 id="mt-sel-title">{t('mtTrSubs')}</h3>
        <p className="mt-hint">{subsInfo}</p>
        <Check id="mtd-burn" label={t('mtdBurn')} checked={sb.burn} disabled={dis} onChange={(v) => upd({ burn: v })} />
        <p className="meta small">{sb.burn ? t('mtdBurnOn') : t('mtSubsBurn')}</p>
        {sb.burn && <>
          <div className="mt-field"><label>{t('mtdPlace')}</label><Seg label={t('mtdPlace')} disabled={dis} value={sb.y != null ? '' : sb.pos} onChange={(v) => upd({ pos: v, y: null })} options={[['top', t('mtdTop')], ['bottom', t('mtdBottom')]]} /></div>
          <FreePos free={sb.y != null} disabled={dis} onReset={() => upd({ y: null })} />
          <Slider id="mtd-subs-size" label={t('mtdSize')} value={sb.scale} min={50} max={200} step={5} shown={`${sb.scale} %`} disabled={dis} onChange={(v) => upd({ scale: v }, 'size')} />
          <Check id="mtd-subs-box" label={t('mtdBox')} checked={sb.box} disabled={dis} onChange={(v) => upd({ box: v })} />
          <div className="mt-actions"><button type="button" className="btn ghost sd-pill" onClick={() => onFrame(Math.max(0, Math.min(T, totalS)))} data-act="frame">{t('mtdFrame')}</button></div>
        </>}
      </div>
    );
  }

  return <Overview />;

  // --- Vue d'ensemble de la piste « Titres et logo »
  function Overview() {
    const nTr = L.filter((_, i) => i > 0).filter((c) => dress.transitions.byClip[c.id] || dress.transitions.all).length;
    const rows = [
      ['logo', t('mtAddLogo'), dress.logo.on ? t('mtdOn') : t('mtdOff')],
      ['cards', t('mtAddIntro'), [dress.intro.on && t('mtdIntro'), dress.outro.on && t('mtdOutro')].filter(Boolean).join(' · ') || t('mtdOff')],
      ['join', t('mtAddTransition'), nTr ? t('mtdNTr').replace('{n}', nTr) : t('mtdOff'), 'all'],
      ['subs', t('mtTrSubs'), dress.subs.burn ? t('mtdBurned') : t('mtdOff')],
    ];
    return (
      <div className="mt-panel" data-panel="overview">
        <h3 id="mt-sel-title">{t('mtTrTitles')}</h3>
        <p className="mt-hint">{t('mtTitlesHint')}</p>
        <div className="mt-actions">
          <button type="button" className="btn ghost sd-pill" disabled={dis} onClick={() => onAddItem('title')}>{t('mtAddTitle')}</button>
          <button type="button" className="btn ghost sd-pill" disabled={dis} onClick={() => onAddItem('banner')}>{t('mtAddBanner')}</button>
        </div>
        {dress.items.length > 0 && (
          <ul className="mt-items" aria-label={t('mtdItems')}>
            {[...dress.items].sort((a, b) => a.start - b.start).map((i) => (
              <li key={i.id}><button type="button" onClick={() => { setSel({ track: 'item', id: i.id }); setT(i.start); }} data-item-row={i.id}>
                <span dir="auto">{i.kind === 'banner' ? '▭ ' : 'T '}{fillVars(i.text, vars) || fillVars(i.sub, vars) || '…'}</span><small dir="ltr">{fmtTime(i.start)}</small></button></li>
            ))}
          </ul>
        )}
        <ul className="mt-items">
          {rows.map(([k, label, state, id]) => (
            <li key={k}><button type="button" onClick={() => setSel({ track: k, id: id || null })} data-row={k}><span>{label}</span><small>{state}</small></button></li>
          ))}
        </ul>
        <div className="mt-actions"><button type="button" className="btn ghost sd-pill" onClick={() => onFrame(Math.max(0, Math.min(T, totalS)))} data-act="frame">{t('mtdFrame')}</button></div>
      </div>
    );
  }
}
