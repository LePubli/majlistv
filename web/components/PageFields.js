'use client';
// Étape I3 — Champs d'édition d'un bloc (Admin → Pages) : texte par langue, adresse, image, choix, nombre, liste, style.
import { createContext, useContext, useState } from 'react';
import { LANGS, COLOR_REFS, COLOR_REF_LABELS, STYLE_ALIGN, STYLE_WIDTH, STYLE_FONTS, STYLE_HOVER, STYLE_ANIM, DEVICES, DEVICE_LABELS, AUDIENCES, BLOCK_TYPES, tx } from '../lib/blocks';

export const LANG_NAMES = { fr: 'Français', en: 'English', ar: 'العربية' };
const DIRS = { fr: 'ltr', en: 'ltr', ar: 'rtl' };

// Pastilles « cette langue est remplie » : aide à repérer les traductions manquantes.
function Dots({ value, lang }) {
  return (
    <span className="pe-dots" aria-label={`Langues remplies : ${LANGS.filter((l) => value?.[l]).map((l) => LANG_NAMES[l]).join(', ') || 'aucune'}`}>
      {LANGS.map((l) => <i key={l} className={value?.[l] ? 'on' : ''} title={LANG_NAMES[l]}>{l}</i>)}
    </span>
  );
}

// Texte court (une ligne) ou long (plusieurs lignes), dans la langue d'édition.
export function TextField({ f, value, lang, onChange, error }) {
  const long = f.kind === 'tl';
  const cur = value?.[lang] || '';
  const set = (s) => { const next = { ...(value || {}) }; if (s) next[lang] = s; else delete next[lang]; onChange(Object.keys(next).length ? next : undefined); };
  const hint = !cur && value && tx(value, lang) ? tx(value, lang) : '';
  const max = f.max || (long ? 4000 : 200);
  return (
    <label className={`pe-f${error ? ' bad' : ''}`}>
      <span className="pe-lab">{f.label} <Dots value={value} lang={lang} /></span>
      {long
        ? <textarea rows={4} lang={lang} dir={DIRS[lang]} maxLength={max} value={cur} placeholder={hint ? `(${LANG_NAMES.fr} : ${hint.slice(0, 60)}${hint.length > 60 ? '…' : ''})` : ''} onChange={(e) => set(e.target.value)} />
        : <input type="text" lang={lang} dir={DIRS[lang]} maxLength={max} value={cur} placeholder={hint ? `(${hint.slice(0, 50)})` : ''} onChange={(e) => set(e.target.value.replace(/[\r\n]+/g, ' '))} />}
      {error && <span className="pe-err" role="alert">{error}</span>}
    </label>
  );
}

export function UrlField({ f, value, onChange, error }) {
  return (
    <label className={`pe-f${error ? ' bad' : ''}`}>
      <span className="pe-lab">{f.label}</span>
      <input type="text" list="pe-urls" inputMode="url" spellCheck={false} maxLength={500} value={value || ''} placeholder="/pricing ou https://…" onChange={(e) => onChange(e.target.value.trim() || undefined)} />
      {error && <span className="pe-err" role="alert">{error}</span>}
    </label>
  );
}

export function VideoField({ f, value, onChange, error }) {
  return (
    <label className={`pe-f${error ? ' bad' : ''}`}>
      <span className="pe-lab">{f.label}</span>
      <input type="url" spellCheck={false} maxLength={300} value={value || ''} placeholder="https://www.youtube.com/watch?v=…" onChange={(e) => onChange(e.target.value.trim() || undefined)} />
      {error && <span className="pe-err" role="alert">{error}</span>}
    </label>
  );
}

export function SelectField({ f, value, onChange }) {
  return (
    <label className="pe-f">
      <span className="pe-lab">{f.label}</span>
      <select value={value ?? f.def ?? ''} onChange={(e) => onChange(e.target.value)}>
        {f.options.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
      </select>
    </label>
  );
}

export function NumField({ f, value, onChange, error }) {
  return (
    <label className={`pe-f${error ? ' bad' : ''}`}>
      <span className="pe-lab">{f.label}</span>
      <input type="number" min={f.min} max={f.max} step="1" value={value ?? f.def ?? ''} onChange={(e) => onChange(e.target.value === '' ? undefined : Number(e.target.value))} />
      {error && <span className="pe-err" role="alert">{error}</span>}
    </label>
  );
}

export function MediaField({ f, value, onPick, onClear, error }) {
  return (
    <div className={`pe-f${error ? ' bad' : ''}`}>
      <span className="pe-lab">{f.label}</span>
      <div className="pe-media">
        {value ? <img src={`/api/pages/media/${value}`} alt="" /> : <span className="pe-media-empty">Aucune image</span>}
        <span className="pe-media-btns">
          <button type="button" className="btn ghost pe-mini" onClick={onPick}>{value ? 'Changer' : 'Choisir une image'}</button>
          {value && <button type="button" className="btn ghost pe-mini" onClick={onClear}>Retirer</button>}
        </span>
      </div>
      {error && <span className="pe-err" role="alert">{error}</span>}
    </div>
  );
}

// Sections globales connues de l'éditeur (lot B) : { list: [{ slug, title, id }], open(id) }.
export const GlobalsContext = createContext({ list: [], open: null });
function GlobalRefField({ f, value, onChange, error }) {
  const g = useContext(GlobalsContext);
  const cur = g.list.find((x) => x.slug === value);
  return (
    <div className="pe-f">
      <label><span className="pe-lab">{f.label}</span>
        <select value={value || ''} onChange={(e) => onChange(e.target.value || undefined)}>
          <option value="">Choisir…</option>
          {g.list.map((x) => <option key={x.slug} value={x.slug}>{x.title}</option>)}
          {value && !cur && <option value={value}>{value} (introuvable)</option>}
        </select></label>
      {cur && g.open && <button type="button" className="btn ghost pe-mini" onClick={() => g.open(cur.id)}>Modifier cette section globale</button>}
      <p className="meta small">Une section globale se modifie à un seul endroit : le changement vaut partout où elle est posée.</p>
      {error && <p className="pe-err" role="alert">{error}</p>}
    </div>
  );
}

// Un champ, selon son type. errors : messages de ce bloc, par nom de champ.
export function Field({ f, value, lang, onChange, onPickMedia, error }) {
  switch (f.kind) {
    case 't': case 'tl': return <TextField f={f} value={value} lang={lang} onChange={onChange} error={error} />;
    case 'url': return <UrlField f={f} value={value} onChange={onChange} error={error} />;
    case 'video': return <VideoField f={f} value={value} onChange={onChange} error={error} />;
    case 'slug': return <GlobalRefField f={f} value={value} onChange={onChange} error={error} />;
    case 'sel': return <SelectField f={f} value={value} onChange={onChange} />;
    case 'num': return <NumField f={f} value={value} onChange={onChange} error={error} />;
    case 'media': return <MediaField f={f} value={value} onPick={() => onPickMedia((id) => onChange(id))} onClear={() => onChange(undefined)} error={error} />;
    case 'list': return <ListField f={f} value={value} lang={lang} onChange={onChange} onPickMedia={onPickMedia} />;
    default: return null;
  }
}

// Liste d'éléments (cartes, questions) : ajouter, déplacer, supprimer.
function ListField({ f, value, lang, onChange, onPickMedia }) {
  const items = value || [];
  const [open, setOpen] = useState(0);
  const set = (next) => onChange(next.length ? next : undefined);
  const upd = (i, k, v) => set(items.map((it, j) => { if (j !== i) return it; const n = { ...it }; if (v === undefined) delete n[k]; else n[k] = v; return n; }));
  const move = (i, d) => { const j = i + d; if (j < 0 || j >= items.length) return; const n = [...items]; [n[i], n[j]] = [n[j], n[i]]; set(n); setOpen(j); };
  return (
    <fieldset className="pe-list">
      <legend>{f.label} ({items.length}/{f.max})</legend>
      {items.map((it, i) => {
        const first = tx(it.title || it.q, lang);
        return (
          <div key={i} className={`pe-item${open === i ? ' open' : ''}`}>
            <div className="pe-item-head">
              <button type="button" className="link" aria-expanded={open === i} onClick={() => setOpen(open === i ? -1 : i)}>{f.item} {i + 1}{first ? ` — ${first.slice(0, 40)}` : ''}</button>
              <span className="pe-btns">
                <button type="button" aria-label={`${f.item} ${i + 1} : monter`} disabled={i === 0} onClick={() => move(i, -1)}>↑</button>
                <button type="button" aria-label={`${f.item} ${i + 1} : descendre`} disabled={i === items.length - 1} onClick={() => move(i, 1)}>↓</button>
                <button type="button" aria-label={`${f.item} ${i + 1} : supprimer`} onClick={() => { set(items.filter((_, j) => j !== i)); setOpen(-1); }}>✕</button>
              </span>
            </div>
            {open === i && (
              <div className="pe-item-body">
                {f.fields.map((sf) => <Field key={sf.k} f={sf} value={it[sf.k]} lang={lang} onChange={(v) => upd(i, sf.k, v)} onPickMedia={onPickMedia} />)}
              </div>
            )}
          </div>
        );
      })}
      {items.length < f.max && <button type="button" className="btn ghost pe-mini" onClick={() => { set([...items, {}]); setOpen(items.length); }}>+ Ajouter : {f.item.toLowerCase()}</button>}
    </fieldset>
  );
}

/* ------------------------------------------------------------------ Affichage (appareils, public) */
export function ShowFields({ show, onChange }) {
  const devices = show?.devices || DEVICES;
  const toggle = (d) => {
    const next = devices.includes(d) ? devices.filter((x) => x !== d) : [...devices, d];
    if (!next.length) return; // au moins un appareil
    onChange({ ...show, devices: DEVICES.filter((x) => next.includes(x)) });
  };
  return (
    <div className="pe-show">
      <fieldset className="pe-f">
        <legend className="pe-lab">Afficher sur</legend>
        <div className="pe-checks">
          {DEVICES.map((d) => <label key={d}><input type="checkbox" checked={devices.includes(d)} onChange={() => toggle(d)} /> {DEVICE_LABELS[d]}</label>)}
        </div>
        <span className="meta small">Téléphone : jusqu’à 700 px · Tablette : 701 à 1024 px · Ordinateur : 1025 px et plus.</span>
      </fieldset>
      <label className="pe-f">
        <span className="pe-lab">Qui voit ce bloc</span>
        <select value={show?.audience || 'all'} onChange={(e) => onChange({ ...show, audience: e.target.value })}>
          {AUDIENCES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
        </select>
        <span className="meta small">Un ciblage sert à adapter la page, pas à protéger un contenu : pour réserver une vidéo, utilisez l’abonnement.</span>
      </label>
    </div>
  );
}

/* ------------------------------------------------------------------ Style */
function ColorStyle({ label, value, onChange }) {
  const custom = typeof value === 'string' && value.startsWith('#');
  const sel = custom ? '#' : (value || '');
  return (
    <div className="pe-f">
      <span className="pe-lab">{label}</span>
      <div className="pe-color">
        <select aria-label={label} value={sel} onChange={(e) => onChange(e.target.value === '#' ? '#E6A739' : (e.target.value || undefined))}>
          <option value="">Selon le thème</option>
          {Object.keys(COLOR_REFS).map((k) => <option key={k} value={`@${k}`}>{COLOR_REF_LABELS[k]}</option>)}
          <option value="#">Couleur libre…</option>
        </select>
        {custom && (
          <>
            <input type="color" aria-label={`${label} : choisir`} value={value.slice(0, 7)} onChange={(e) => onChange(e.target.value.toUpperCase())} />
            <input type="text" className="pe-hex" aria-label={`${label} : code`} maxLength={9} spellCheck={false} value={value} onChange={(e) => onChange(e.target.value.trim())} />
          </>
        )}
      </div>
    </div>
  );
}

export function StyleFields({ style, onChange, onPickMedia }) {
  const st = style || {};
  const set = (k, v) => { const n = { ...st }; if (v === undefined || v === '') delete n[k]; else n[k] = v; onChange(n); };
  const num = (k, label, max) => (
    <label className="pe-f"><span className="pe-lab">{label}</span>
      <input type="number" min="0" max={max} step="1" value={st[k] ?? ''} placeholder="auto" onChange={(e) => set(k, e.target.value === '' ? undefined : Number(e.target.value))} /></label>
  );
  return (
    <div className="pe-style">
      <ColorStyle label="Couleur du texte" value={st.textColor} onChange={(v) => set('textColor', v)} />
      <ColorStyle label="Couleur de fond" value={st.bgColor} onChange={(v) => set('bgColor', v)} />
      <label className="pe-f"><span className="pe-lab">Alignement</span>
        <select value={st.align || ''} onChange={(e) => set('align', e.target.value)}>{STYLE_ALIGN.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></label>
      <label className="pe-f"><span className="pe-lab">Largeur du contenu</span>
        <select value={st.maxWidth || ''} onChange={(e) => set('maxWidth', e.target.value)}>{STYLE_WIDTH.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></label>
      <div className="pe-row">{num('padTop', 'Espace au-dessus (px)', 240)}{num('padBottom', 'Espace en dessous (px)', 240)}{num('radius', 'Arrondi (px)', 60)}</div>
      <div className="pe-row">{num('minHeight', 'Hauteur minimale (px)', 1200)}
        <label className="pe-f"><span className="pe-lab">Ombre</span>
          <select value={st.shadow || ''} onChange={(e) => set('shadow', e.target.value)}><option value="">Aucune</option><option value="soft">Légère</option><option value="strong">Marquée</option></select></label>
        <label className="pe-f"><span className="pe-lab">Bordure</span>
          <select value={st.border ? '1' : ''} onChange={(e) => set('border', e.target.value ? true : undefined)}><option value="">Aucune</option><option value="1">Fine</option></select></label></div>
      <label className="pe-f"><span className="pe-lab">Police de ce bloc</span>
        <select value={st.font || ''} onChange={(e) => set('font', e.target.value)}><option value="">Celle du thème</option>{STYLE_FONTS.map((f) => <option key={f} value={f}>{f.replace(' Variable', '')}</option>)}</select></label>
      <details className="pe-sub">
        <summary>Survol (souris)</summary>
        <label className="pe-f"><span className="pe-lab">Effet au survol</span>
          <select value={st.hover || ''} onChange={(e) => set('hover', e.target.value)}>{STYLE_HOVER.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></label>
        <ColorStyle label="Fond au survol" value={st.hoverBg} onChange={(v) => set('hoverBg', v)} />
        <ColorStyle label="Texte au survol" value={st.hoverText} onChange={(v) => set('hoverText', v)} />
      </details>
      <details className="pe-sub">
        <summary>Animation d’apparition</summary>
        <div className="pe-row">
          <label className="pe-f"><span className="pe-lab">Animation</span>
            <select value={st.anim || ''} onChange={(e) => set('anim', e.target.value)}>{STYLE_ANIM.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></label>
          {num('animDelay', 'Délai (ms)', 2000)}
        </div>
        <p className="meta small">Jouée quand le bloc entre dans l’écran. Désactivée pour les personnes qui ont demandé de réduire les animations, et dans cet éditeur.</p>
      </details>
      <details className="pe-sub">
        <summary>Éléments du bloc</summary>
        <p className="meta small">Réglez les titres, textes, boutons et images à l’intérieur du bloc. Vide : réglage d’origine.</p>
        <ColorStyle label="Titres : couleur" value={st.elTitleColor} onChange={(v) => set('elTitleColor', v)} />
        <div className="pe-row">{num('elTitleSize', 'Titres : taille (px)', 120)}
          <label className="pe-f"><span className="pe-lab">Titres : graisse</span>
            <select value={st.elTitleWeight ?? ''} onChange={(e) => set('elTitleWeight', e.target.value === '' ? undefined : Number(e.target.value))}>
              <option value="">Selon le thème</option>{[[400, 'Normale'], [500, 'Moyenne'], [600, 'Semi-grasse'], [700, 'Grasse'], [800, 'Très grasse']].map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></label></div>
        <ColorStyle label="Textes : couleur" value={st.elTextColor} onChange={(v) => set('elTextColor', v)} />
        {num('elTextSize', 'Textes : taille (px)', 40)}
        <ColorStyle label="Boutons : fond" value={st.elBtnBg} onChange={(v) => set('elBtnBg', v)} />
        <ColorStyle label="Boutons : texte" value={st.elBtnColor} onChange={(v) => set('elBtnColor', v)} />
        <div className="pe-row">{num('elBtnRadius', 'Boutons : arrondi (px)', 999)}{num('elImgRadius', 'Images : arrondi (px)', 200)}</div>
      </details>
      <details className="pe-sub">
        <summary>Tablette et téléphone</summary>
        <p className="meta small">Laissez vide pour garder les valeurs de l’ordinateur. Tablette : écrans jusqu’à 1024 px ; téléphone : jusqu’à 700 px.</p>
        <div className="pe-row">{num('padTopT', 'Tablette : espace au-dessus', 240)}{num('padBottomT', 'Tablette : espace en dessous', 240)}</div>
        <div className="pe-row">{num('padTopM', 'Téléphone : espace au-dessus', 240)}{num('padBottomM', 'Téléphone : espace en dessous', 240)}</div>
        <div className="pe-row">{num('minHeightM', 'Téléphone : hauteur minimale', 1200)}
          <label className="pe-f"><span className="pe-lab">Téléphone : alignement</span>
            <select value={st.alignM || ''} onChange={(e) => set('alignM', e.target.value)}>{STYLE_ALIGN.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></label></div>
      </details>
      {onPickMedia && <MediaField f={{ label: 'Image de fond de la section' }} value={st.bgImage} onPick={() => onPickMedia((id) => set('bgImage', id))} onClear={() => set('bgImage', undefined)} />}
      <p className="meta small">Les couleurs « du thème » suivent Admin → Apparence. Laissez « Selon le thème » ou vide pour garder le réglage d’origine.</p>
      {Object.keys(st).length > 0 && <button type="button" className="btn ghost pe-mini" onClick={() => onChange({})}>Réinitialiser le style de ce bloc</button>}
    </div>
  );
}

// Éditeur complet d'un bloc : onglets Contenu / Affichage / Style.
export function BlockEditor({ block, lang, onChange, onPickMedia, errors }) {
  const def = BLOCK_TYPES[block.type];
  const [tab, setTab] = useState('content');
  const setProp = (k, v) => { const p = { ...block.props }; if (v === undefined) delete p[k]; else p[k] = v; onChange({ ...block, props: p }); };
  return (
    <div className="pe-block-edit">
      <div className="pe-tabs" role="tablist" aria-label="Réglages du bloc">
        {[['content', 'Contenu'], ['show', 'Affichage'], ['style', 'Style']].map(([id, l]) => (
          <button key={id} type="button" role="tab" aria-selected={tab === id} className={tab === id ? 'on' : ''} onClick={() => setTab(id)}>{l}</button>
        ))}
      </div>
      {tab === 'content' && (
        <div className="pe-fields">
          <p className="meta small">{def.hint}</p>
          {def.fields.length === 0 && <p className="meta">Ce bloc n’a pas de contenu à régler.</p>}
          {def.fields.map((f) => <Field key={f.k} f={f} value={block.props[f.k]} lang={lang} onChange={(v) => setProp(f.k, v)} onPickMedia={onPickMedia} error={errors?.[f.k]} />)}
        </div>
      )}
      {tab === 'show' && <ShowFields show={block.show} onChange={(show) => onChange({ ...block, show })} />}
      {tab === 'style' && <StyleFields style={block.style} onChange={(style) => onChange({ ...block, style })} onPickMedia={onPickMedia} />}
    </div>
  );
}
