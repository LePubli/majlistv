'use client';
// Éditeur « En-tête et pied de page » (dans Admin → Pages).
//
// L'en-tête se range en trois zones (gauche, centre, droite), le pied de page en deux : on y place les éléments d'origine
// (logo, menu, recherche, compte…) et ses propres liens, boutons ou textes, réservés au besoin à un appareil ou à un public.
// Tout est enregistré dans le brouillon de la page (voir PagesAdmin) et validé par l'API.
// Les menus eux-mêmes (liens, ordre, sous-menus) se règlent dans Admin → Menus (audit 11/2026 : l'ancien réglage des menus,
// qui faisait double emploi, a été retiré d'ici).
import { useState } from 'react';
import { TextField, UrlField } from './PageFields';
import { DEVICES, DEVICE_LABELS, tx } from '../lib/blocks';
import { HEADER, FOOTER, NAV_AUDIENCES, NAV_ICONS, NAV_ICON_LABELS, materializeNav, newNavId, defaultHeader, defaultFooter } from '../lib/navcfg';

const swap = (list, i, d) => { const l = [...list]; const j = i + d; if (j < 0 || j >= l.length) return l; [l[i], l[j]] = [l[j], l[i]]; return l; };

/* ------------------------------------------------------------------ Appareils et public d'un élément */
function Show({ show, onChange, note }) {
  const devices = show?.devices || DEVICES;
  const toggle = (d) => {
    const next = devices.includes(d) ? devices.filter((x) => x !== d) : [...devices, d];
    if (!next.length) return;
    onChange({ ...(show || {}), devices: DEVICES.filter((x) => next.includes(x)), audience: show?.audience || 'all' });
  };
  return (
    <div className="pe-show">
      <fieldset className="pe-f">
        <legend className="pe-lab">Afficher sur</legend>
        <div className="pe-checks">{DEVICES.map((d) => <label key={d}><input type="checkbox" checked={devices.includes(d)} onChange={() => toggle(d)} /> {DEVICE_LABELS[d]}</label>)}</div>
      </fieldset>
      <label className="pe-f"><span className="pe-lab">Qui le voit</span>
        <select value={show?.audience || 'all'} onChange={(e) => onChange({ ...(show || {}), devices, audience: e.target.value })}>
          {NAV_AUDIENCES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
        </select>
      </label>
      {note && <p className="meta small">{note}</p>}
    </div>
  );
}

/* ------------------------------------------------------------------ Réglages d'un élément (liste de menu ou zone) */
function ItemFields({ it, lang, icons, onChange, errs, fixedLegal }) {
  const custom = !it.key;
  const set = (k, v) => { const n = { ...it }; if (v === undefined || v === '') delete n[k]; else n[k] = v; onChange(n); };
  return (
    <div className="pe-block-edit">
      {(custom || it.key) && !(it.key && ['logo', 'menu', 'search', 'lang', 'account', 'cta', 'brand', 'links'].includes(it.key)) && (
        <TextField f={{ k: 'label', label: custom ? 'Texte' : 'Texte affiché (vide = texte d’origine)', kind: 't', max: 60 }} value={it.label} lang={lang} onChange={(v) => set('label', v)} error={errs('label')} />
      )}
      {custom && it.type !== 'text' && <UrlField f={{ label: 'Adresse du lien' }} value={it.url} onChange={(v) => set('url', v)} error={errs('url')} />}
      {custom && it.type === 'button' && (
        <label className="pe-f"><span className="pe-lab">Style du bouton</span>
          <select value={it.buttonKind || 'primary'} onChange={(e) => set('buttonKind', e.target.value)}><option value="primary">Plein (or)</option><option value="ghost">Contour</option></select></label>
      )}
      {custom && icons && (
        <label className="pe-f"><span className="pe-lab">Icône</span>
          <select value={it.icon || 'link'} onChange={(e) => set('icon', e.target.value)}>{NAV_ICONS.map((k) => <option key={k} value={k}>{NAV_ICON_LABELS[k]}</option>)}</select></label>
      )}
      {fixedLegal
        ? <p className="meta small">Lien légal obligatoire : il reste affiché sur tous les appareils et pour tout le monde.</p>
        : <Show show={it.show} onChange={(v) => set('show', v)} note="Un ciblage sert à adapter l’affichage, pas à protéger un contenu." />}
      {errs('id') && <p className="pe-err" role="alert">{errs('id')}</p>}
    </div>
  );
}

/* ------------------------------------------------------------------ Zones (en-tête, pied de page) */
function ZonesEditor({ def, value, at, errors, lang, onChange, icons = false }) {
  const [open, setOpen] = useState(null);
  const placed = new Set(Object.values(value).flat().filter((x) => x.key).map((x) => x.key));
  const free = def.elements.filter(([k]) => !placed.has(k));
  const nameOf = (it) => {
    if (it.key) return def.elements.find(([k]) => k === it.key)?.[1] || it.key;
    return `${def.custom.find(([t]) => t === it.type)?.[1] || 'Élément'} : ${tx(it.label, lang) || '(sans texte)'}`;
  };
  const setZone = (z, list) => onChange({ ...value, [z]: list });
  const upd = (z, i, n) => setZone(z, value[z].map((x, j) => (j === i ? n : x)));
  const moveTo = (z, i, to) => { if (to === z) return; const it = value[z][i]; onChange({ ...value, [z]: value[z].filter((_, j) => j !== i), [to]: [...value[to], it] }); };
  const add = (z, it) => { setZone(z, [...value[z], it]); setOpen(it.id); };
  return (
    <div className="ne-zones">
      {def.zones.map(([z, zl]) => (
        <section key={z} className="ne-zone" aria-label={zl}>
          <h4>{zl}</h4>
          <ol className="pe-blocks">
            {value[z].length === 0 && <li className="meta small">Vide</li>}
            {value[z].map((it, i) => {
              const errs = (f) => errors[`${at}.${z}.${i}.${f}`];
              const required = def.required.includes(it.key);
              const bad = ['label', 'url', 'id', 'key', 'show.devices', 'show.audience'].some((f) => errs(f));
              return (
                <li key={it.id} className={`pe-block${open === it.id ? ' open' : ''}${bad ? ' bad' : ''}`}>
                  <div className="pe-block-head">
                    <button type="button" className="pe-block-main" aria-expanded={open === it.id} onClick={() => setOpen(open === it.id ? null : it.id)}>
                      <strong>{nameOf(it)}</strong>
                      {it.show && ((it.show.devices || []).length < 3 || (it.show.audience || 'all') !== 'all') && <span className="ap-tag">ciblé</span>}
                    </button>
                    <span className="pe-btns">
                      <button type="button" aria-label={`${nameOf(it)} : monter`} disabled={i === 0} onClick={() => setZone(z, swap(value[z], i, -1))}>↑</button>
                      <button type="button" aria-label={`${nameOf(it)} : descendre`} disabled={i === value[z].length - 1} onClick={() => setZone(z, swap(value[z], i, 1))}>↓</button>
                      <button type="button" aria-label={`${nameOf(it)} : retirer`} disabled={required} title={required ? 'Élément obligatoire' : 'Retirer'} onClick={() => setZone(z, value[z].filter((_, j) => j !== i))}>✕</button>
                    </span>
                  </div>
                  {bad && open !== it.id && <p className="pe-err" role="alert">{['label', 'url', 'id', 'key'].map((f) => errs(f)).filter(Boolean).join(' · ')}</p>}
                  {open === it.id && (
                    <>
                      <label className="pe-f ne-moveto"><span className="pe-lab">Zone</span>
                        <select value={z} onChange={(e) => moveTo(z, i, e.target.value)}>{def.zones.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></label>
                      <ItemFields it={it} lang={lang} icons={icons} fixedLegal={false} errs={errs} onChange={(n) => upd(z, i, n)} />
                    </>
                  )}
                </li>
              );
            })}
          </ol>
          <div className="ne-add">
            {free.length > 0 && (
              <select aria-label={`Ajouter un élément d’origine à la zone ${zl}`} value="" onChange={(e) => { if (e.target.value) add(z, { id: newNavId(), key: e.target.value }); }}>
                <option value="">+ Élément d’origine…</option>
                {free.map(([k, l]) => <option key={k} value={k}>{l}</option>)}
              </select>
            )}
            {def.custom.map(([t, l]) => (
              <button key={t} type="button" className="btn ghost pe-mini" onClick={() => add(z, { id: newNavId(), type: t, ...(t !== 'text' ? {} : {}), show: { devices: def === HEADER ? ['d'] : ['m', 't', 'd'], audience: 'all' } })}>+ {l}</button>
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}

/* ------------------------------------------------------------------ Éditeur complet */
const TABS = [['header', 'En-tête'], ['footerZones', 'Pied de page']];

export default function NavEditor({ nav, onChange, lang, errors, viewAs, onViewAs }) {
  const [tab, setTab] = useState('header');
  const base = materializeNav(nav);
  const reset = (what) => {
    if (!window.confirm('Rétablir les réglages d’origine pour cette partie ?')) return;
    if (what === 'header') onChange({ ...base, header: defaultHeader() });
    else onChange({ ...base, footer: defaultFooter() });
  };
  const resetAll = () => { if (window.confirm('Rétablir l’en-tête et le pied de page d’origine ?')) onChange(undefined); };
  return (
    <section className="ne" aria-label="En-tête et pied de page">
      <div className="ne-head">
        <h3>En-tête et pied de page</h3>
        <span className="pe-btns">
          <label className="ne-view">Aperçu en tant que{' '}
            <select value={viewAs || ''} onChange={(e) => onViewAs(e.target.value || null)}>
              <option value="">Moi (connecté)</option><option value="visitor">Visiteur non connecté</option>
            </select>
          </label>
          {nav && <button type="button" className="btn ghost pe-mini" onClick={resetAll}>Tout rétablir</button>}
        </span>
      </div>
      <p className="meta small">Les menus (liens, ordre, sous-menus déroulants, liens vers des conférences, des pages, l’application…) se règlent dans <a href="/admin?tab=menus">Admin → Menus</a>. Ici : la place des éléments de l’en-tête et du pied de page.</p>
      <p className="meta small">{nav ? 'Réglages personnalisés en cours.' : 'Aucun réglage : le site garde son en-tête et son pied de page d’origine. Toute modification ci-dessous les personnalise (brouillon, puis « Publier »).'}</p>
      <div className="ap-seg ne-tabs" role="tablist" aria-label="Partie à modifier">
        {TABS.map(([k, l]) => <button key={k} type="button" role="tab" aria-selected={tab === k} className={tab === k ? 'on' : ''} onClick={() => setTab(k)}>{l}</button>)}
      </div>

      {tab === 'header' && (
        <div role="tabpanel">
          <p className="meta small">Rangez les éléments de l’en-tête à gauche, au centre ou à droite. Le logo et la connexion / compte sont obligatoires. Sur téléphone, l’en-tête passe en version compacte (bouton ☰) : les éléments ajoutés sont réservés à l’ordinateur par défaut, à vous de les afficher aussi sur tablette ou téléphone si la place le permet.</p>
          {(errors['nav.header']) && <p className="pe-err" role="alert">{errors['nav.header']}</p>}
          <ZonesEditor def={HEADER} value={base.header} at="nav.header" errors={errors} lang={lang} onChange={(h) => onChange({ ...base, header: h })} />
          <button type="button" className="link u" onClick={() => reset('header')}>Rétablir l’en-tête d’origine</button>
        </div>
      )}
      {tab === 'footerZones' && (
        <div role="tabpanel">
          <p className="meta small">Marque, liens légaux, textes et liens du bas de page. Des blocs (adresse, réseaux, newsletter…) peuvent aussi s’afficher au-dessus du pied de page : voir « Au-dessus du pied de page » plus bas.</p>
          {errors['nav.footer'] && <p className="pe-err" role="alert">{errors['nav.footer']}</p>}
          <ZonesEditor def={FOOTER} value={base.footer} at="nav.footer" errors={errors} lang={lang} onChange={(f) => onChange({ ...base, footer: f })} />
          <button type="button" className="link u" onClick={() => reset('footerZones')}>Rétablir le pied de page d’origine</button>
        </div>
      )}
    </section>
  );
}
