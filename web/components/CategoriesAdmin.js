'use client';
// Admin → Catégories (nouveau catalogue, phase 2 — cahier des charges du 20/11/2026).
// Un seul écran pour le catalogue adultes ET les univers Kids : arbre à deux niveaux, ordre, activation, mise en avant,
// icône / couleur / images, textes FR-EN-AR, SEO, aperçu du rendu, vidéos classées, suppression protégée (jamais de vidéo supprimée).
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useApp } from './Providers';

const EMPTY_TR = { name: '', shortDescription: '', description: '', seoTitle: '', seoDescription: '' };
const blank = (catalogueType, parentId = null) => ({
  id: null, name: '', slug: '', parentId, catalogueType, description: '', shortDescription: '', isActive: true, isFeatured: false,
  icon: '', image: '', heroImage: '', color: '', seoTitle: '', seoDescription: '', translations: { en: { ...EMPTY_TR }, ar: { ...EMPTY_TR } },
});
const fromRow = (c) => ({
  ...c, slug: c.slug || '', parentId: c.parentId || null, icon: c.icon || '', image: c.image || '', heroImage: c.heroImage || '', color: c.color || '',
  translations: { en: { ...EMPTY_TR, ...(c.translations?.en || {}) }, ar: { ...EMPTY_TR, ...(c.translations?.ar || {}) } },
});
const LANGS = [['fr', 'Français'], ['en', 'English'], ['ar', 'العربية']];
const plural = (n, one, many) => `${n} ${n > 1 ? many : one}`;

export default function CategoriesAdmin() {
  const { call } = useApp();
  const [rows, setRows] = useState(null);
  const [catalogue, setCatalogue] = useState('adult');
  const [form, setForm] = useState(null);       // catégorie en cours d'édition ou de création
  const [lang, setLang] = useState('fr');
  const [msg, setMsg] = useState(null);
  const [busy, setBusy] = useState(false);
  const [del, setDel] = useState(null);         // { cat, moveTo, error, relations }
  const [members, setMembers] = useState([]);
  const [q, setQ] = useState('');
  const [cands, setCands] = useState([]);

  const load = useCallback(async () => { const r = await call('/categories/admin'); if (r.ok) setRows(r.data); }, [call]);
  useEffect(() => { load(); }, [load]);

  const inCat = useMemo(() => (rows || []).filter((c) => c.catalogueType === catalogue), [rows, catalogue]);
  const tops = inCat.filter((c) => !c.parentId);
  const countOf = (t) => (rows || []).filter((c) => c.catalogueType === t && !c.parentId).length;
  const note = (ok, text) => setMsg({ ok, text });

  const loadMembers = useCallback(async (id) => {
    const r = await call(`/categories/${id}/talks`); setMembers(r.ok ? r.data : []);
  }, [call]);
  useEffect(() => {
    if (!form?.id) { setMembers([]); setCands([]); return undefined; }
    loadMembers(form.id);
    return undefined;
  }, [form?.id, loadMembers]);
  useEffect(() => {
    if (!form?.id) return undefined;
    const h = setTimeout(async () => { const r = await call(`/categories/${form.id}/candidates?q=${encodeURIComponent(q)}`); setCands(r.ok ? r.data : []); }, 250);
    return () => clearTimeout(h);
  }, [q, form?.id, members.length, call]);

  const open = (c) => { setMsg(null); setDel(null); setLang('fr'); setQ(''); setForm(fromRow(c)); };
  const create = (parent) => { setMsg(null); setDel(null); setLang('fr'); setForm(blank(parent ? parent.catalogueType : catalogue, parent ? parent.id : null)); };
  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));
  const setTr = (l, k, v) => setForm((f) => ({ ...f, translations: { ...f.translations, [l]: { ...f.translations[l], [k]: v } } }));

  // Corps envoyé à l'API : champs vides → valeurs neutres ; slug vide à la création → généré par l'API.
  const body = (f, creating) => {
    const b = {
      name: f.name.trim(), description: f.description, shortDescription: f.shortDescription, isActive: f.isActive, isFeatured: f.isFeatured,
      icon: f.icon.trim() || null, image: f.image.trim() || null, heroImage: f.heroImage.trim() || null, color: f.color || null,
      seoTitle: f.seoTitle, seoDescription: f.seoDescription, translations: f.translations,
    };
    if (f.slug.trim()) b.slug = f.slug.trim();
    if (creating) { b.parentId = f.parentId; b.catalogueType = f.catalogueType; } else { b.parentId = f.parentId; if (!f.parentId) b.catalogueType = f.catalogueType; }
    return b;
  };
  const save = async (e) => {
    e.preventDefault(); setBusy(true); setMsg(null);
    const creating = !form.id;
    const r = await call(creating ? '/categories' : `/categories/${form.id}`, { method: creating ? 'POST' : 'PATCH', body: JSON.stringify(body(form, creating)) });
    setBusy(false);
    if (!r.ok) { note(false, r.data?.error || (r.data?.details ? r.data.details.map((d) => d.message).join(' ; ') : 'Erreur')); return; }
    note(true, creating ? `« ${r.data.name} » créée.` : 'Catégorie enregistrée.');
    await load(); setForm(fromRow(r.data));
  };
  const toggleActive = async (c) => {
    const r = await call(`/categories/${c.id}`, { method: 'PATCH', body: JSON.stringify({ isActive: !c.isActive }) });
    if (r.ok) { note(true, `« ${c.name} » ${c.isActive ? 'désactivée (masquée du site)' : 'activée'}.`); load(); if (form?.id === c.id) set('isActive', !c.isActive); } else note(false, r.data?.error || 'Erreur');
  };
  // Ordre : on échange la position avec le frère voisin puis on envoie l'ordre complet des frères.
  const move = async (c, dir) => {
    const sibs = inCat.filter((x) => (x.parentId || null) === (c.parentId || null));
    const i = sibs.findIndex((x) => x.id === c.id); const j = i + dir;
    if (j < 0 || j >= sibs.length) return;
    const ids = sibs.map((x) => x.id); [ids[i], ids[j]] = [ids[j], ids[i]];
    const r = await call('/categories/reorder', { method: 'POST', body: JSON.stringify({ ids }) });
    if (r.ok) load(); else note(false, r.data?.error || 'Erreur');
  };

  // Suppression : l'API refuse tant qu'il reste des vidéos / séries / sous-catégories ; on montre le détail et les choix.
  const askDelete = async (c) => {
    setMsg(null); setDel({ cat: c, moveTo: '', error: null, relations: null });
    const r = await call(`/categories/${c.id}`, { method: 'DELETE' });
    if (r.ok) { setDel(null); note(true, `« ${c.name} » supprimée.`); if (form?.id === c.id) setForm(null); load(); return; }
    setDel({ cat: c, moveTo: '', code: r.data?.code, error: r.data?.error, relations: r.data?.relations || null });
  };
  const confirmDelete = async (mode) => {
    const qs = mode === 'move' ? `?moveTo=${del.moveTo}` : '?detach=1';
    const r = await call(`/categories/${del.cat.id}${qs}`, { method: 'DELETE' });
    if (r.ok) { note(true, `« ${del.cat.name} » supprimée, ses vidéos et séries sont conservées.`); if (form?.id === del.cat.id) setForm(null); setDel(null); load(); } else setDel({ ...del, error: r.data?.error || 'Erreur' });
  };

  const addTalk = async (id) => { const r = await call(`/categories/${form.id}/talks`, { method: 'POST', body: JSON.stringify({ add: [id] }) }); if (r.ok) { await loadMembers(form.id); load(); } };
  const dropTalk = async (id) => { const r = await call(`/categories/${form.id}/talks`, { method: 'POST', body: JSON.stringify({ remove: [id] }) }); if (r.ok) { await loadMembers(form.id); load(); } };

  // Aperçu : la vignette telle qu'elle apparaîtra dans le catalogue, dans la langue choisie.
  const tr = form && lang !== 'fr' ? form.translations[lang] : null;
  const pName = (tr?.name || form?.name || 'Nom de la catégorie');
  const pShort = (tr?.shortDescription || form?.shortDescription || '');
  const parentOf = form?.parentId ? (rows || []).find((c) => c.id === form.parentId) : null;
  const visibility = !form ? '' : !form.isActive ? 'Masquée du site (désactivée).' : parentOf && !parentOf.isActive ? 'Masquée du site : sa catégorie parente est désactivée.'
    : form.id && (form.mainCount + form.extraCount) === 0 ? 'Visible, mais aucune vidéo pour l’instant (une catégorie vide sera masquée dans le catalogue public).' : 'Visible sur le site.';

  const sibCount = (c) => inCat.filter((x) => (x.parentId || null) === (c.parentId || null)).length;

  return (
    <section className="panel cadm">
      <p className="meta">Une seule structure pour le catalogue adultes (14 catégories) et Mejliss TV Kids (10 univers) : chaque catégorie a ses sous-catégories, ses textes FR / EN / AR, son SEO et son image. Une vidéo peut figurer dans plusieurs catégories. Désactiver une catégorie la masque du site sans rien supprimer.</p>
      <div className="cadm-bar">
        <div className="cadm-tabs" role="tablist" aria-label="Catalogue">
          {[['adult', 'Catalogue adultes'], ['kids', 'Mejliss TV Kids']].map(([k, label]) => (
            <button key={k} type="button" role="tab" aria-selected={catalogue === k} className={`btn ${catalogue === k ? '' : 'ghost'}`} onClick={() => { setCatalogue(k); setForm(null); setDel(null); }}>
              {label} <small>({countOf(k)})</small>
            </button>
          ))}
        </div>
        <button type="button" className="btn" onClick={() => create(null)}>+ Nouvelle {catalogue === 'kids' ? 'univers' : 'catégorie'}</button>
      </div>
      {msg && <p className={msg.ok ? 'ok-msg' : 'error'} role="status">{msg.text}</p>}
      {rows === null && <p className="meta">…</p>}

      <div className="cadm-grid">
        <ul className="cadm-tree" aria-label="Arbre des catégories">
          {inCat.length === 0 && rows && <li className="meta">Aucune catégorie dans ce catalogue.</li>}
          {inCat.map((c) => {
            const sibs = inCat.filter((x) => (x.parentId || null) === (c.parentId || null));
            const idx = sibs.findIndex((x) => x.id === c.id);
            return (
              <li key={c.id} className={`${c.parentId ? 'cadm-sub' : ''} ${form?.id === c.id ? 'on' : ''} ${c.isActive ? '' : 'off'}`}>
                <span className="cadm-sw" style={{ background: c.color || 'var(--line-soft)' }} aria-hidden="true">{c.icon || ''}</span>
                <button type="button" className="cadm-name" onClick={() => open(c)} title="Modifier">
                  <b>{c.name}</b>
                  <small className="meta">{c.slug} · {plural(c.mainCount + c.extraCount, 'vidéo', 'vidéos')}{c.children ? ` · ${plural(c.children, 'sous-catégorie', 'sous-catégories')}` : ''}</small>
                </button>
                {!c.isActive && <span className="cadm-badge">Inactive</span>}
                {c.isFeatured && <span className="cadm-badge gold">À la une</span>}
                <span className="cadm-act">
                  <button type="button" className="btn ghost cadm-sm" disabled={idx === 0} onClick={() => move(c, -1)} aria-label={`Monter ${c.name}`}>▲</button>
                  <button type="button" className="btn ghost cadm-sm" disabled={idx === sibCount(c) - 1} onClick={() => move(c, 1)} aria-label={`Descendre ${c.name}`}>▼</button>
                  {!c.parentId && <button type="button" className="btn ghost cadm-sm" onClick={() => create(c)}>+ Sous-catégorie</button>}
                  <button type="button" className="btn ghost cadm-sm" onClick={() => toggleActive(c)}>{c.isActive ? 'Désactiver' : 'Activer'}</button>
                  <button type="button" className="btn ghost cadm-sm danger-link" onClick={() => askDelete(c)}>Supprimer</button>
                </span>
              </li>
            );
          })}
        </ul>

        <div className="cadm-side">
          {del && (
            <div className="cadm-del" role="alertdialog" aria-label="Suppression">
              <b>Supprimer « {del.cat.name} » ?</b>
              {del.error && <p className="error">{del.error}</p>}
              {del.code === 'has_children' && <p className="meta">Supprimez ou déplacez d’abord ses sous-catégories.</p>}
              {del.code === 'kids_rubric' && <p className="meta">Utilisez « Désactiver » : cet univers est affiché dans l’espace Kids.</p>}
              {del.relations && (
                <>
                  <p className="meta">{plural(del.relations.talks, 'vidéo principale', 'vidéos principales')} · {plural(del.relations.extraTalks, 'vidéo supplémentaire', 'vidéos supplémentaires')} · {plural(del.relations.series, 'série', 'séries')}. Rien n’est supprimé : choisissez où elles vont.</p>
                  <div className="cadm-row">
                    <select value={del.moveTo} onChange={(e) => setDel({ ...del, moveTo: e.target.value })} aria-label="Catégorie de destination">
                      <option value="">Transférer vers…</option>
                      {(rows || []).filter((c) => c.id !== del.cat.id && c.catalogueType === del.cat.catalogueType).map((c) => <option key={c.id} value={c.id}>{c.fullName}</option>)}
                    </select>
                    <button type="button" className="btn" disabled={!del.moveTo} onClick={() => confirmDelete('move')}>Transférer et supprimer</button>
                  </div>
                  <button type="button" className="btn ghost" onClick={() => confirmDelete('detach')}>Détacher les vidéos (elles restent en ligne, sans catégorie) et supprimer</button>
                </>
              )}
              <button type="button" className="btn ghost" onClick={() => setDel(null)}>Annuler</button>
            </div>
          )}

          {!form && !del && <p className="meta">Choisissez une catégorie dans l’arbre pour la modifier, ou créez-en une.</p>}
          {form && (
            <form className="cadm-form" onSubmit={save}>
              <h3>{form.id ? `Modifier « ${form.name || '…'} »` : form.parentId ? 'Nouvelle sous-catégorie' : `Nouvelle ${form.catalogueType === 'kids' ? 'univers Kids' : 'catégorie'}`}</h3>

              <div className="cadm-lang" role="tablist" aria-label="Langue des textes">
                {LANGS.map(([k, label]) => <button key={k} type="button" role="tab" aria-selected={lang === k} className={`btn cadm-sm ${lang === k ? '' : 'ghost'}`} onClick={() => setLang(k)}>{label}</button>)}
              </div>

              {lang === 'fr' ? (
                <>
                  <label>Nom<input required maxLength={80} value={form.name} onChange={(e) => set('name', e.target.value)} /></label>
                  <label>Description courte<input maxLength={300} value={form.shortDescription} onChange={(e) => set('shortDescription', e.target.value)} /></label>
                  <label>Description<textarea rows={4} maxLength={2000} value={form.description} onChange={(e) => set('description', e.target.value)} /></label>
                  <label>Titre SEO <small className="meta">{form.seoTitle.length}/120</small><input maxLength={120} value={form.seoTitle} onChange={(e) => set('seoTitle', e.target.value)} /></label>
                  <label>Description SEO <small className="meta">{form.seoDescription.length}/300</small><textarea rows={2} maxLength={300} value={form.seoDescription} onChange={(e) => set('seoDescription', e.target.value)} /></label>
                </>
              ) : (
                <div dir={lang === 'ar' ? 'rtl' : 'ltr'} className="cadm-tr">
                  <p className="meta" dir="ltr">Laissez vide pour utiliser le texte français.</p>
                  <label>Nom<input maxLength={80} value={form.translations[lang].name} onChange={(e) => setTr(lang, 'name', e.target.value)} /></label>
                  <label>Description courte<input maxLength={300} value={form.translations[lang].shortDescription} onChange={(e) => setTr(lang, 'shortDescription', e.target.value)} /></label>
                  <label>Description<textarea rows={4} maxLength={2000} value={form.translations[lang].description} onChange={(e) => setTr(lang, 'description', e.target.value)} /></label>
                  <label>Titre SEO<input maxLength={120} value={form.translations[lang].seoTitle} onChange={(e) => setTr(lang, 'seoTitle', e.target.value)} /></label>
                  <label>Description SEO<textarea rows={2} maxLength={300} value={form.translations[lang].seoDescription} onChange={(e) => setTr(lang, 'seoDescription', e.target.value)} /></label>
                </div>
              )}

              {lang === 'fr' && (
                <>
                  <div className="cadm-row">
                    <label>Slug <small className="meta">{form.id ? '(adresse de la page : à ne changer qu’en connaissance de cause)' : '(vide = généré)'}</small>
                      <input pattern="[a-z0-9]+(-[a-z0-9]+)*" maxLength={90} value={form.slug} onChange={(e) => set('slug', e.target.value)} placeholder="ex. histoire-et-civilisations" /></label>
                    {form.parentId == null && (
                      <label>Catalogue
                        <select value={form.catalogueType} onChange={(e) => set('catalogueType', e.target.value)}>
                          <option value="adult">Adultes</option><option value="kids">Kids</option>
                        </select></label>
                    )}
                    <label>Catégorie parente
                      <select value={form.parentId || ''} disabled={form.id && form.children > 0} onChange={(e) => set('parentId', e.target.value ? Number(e.target.value) : null)}>
                        <option value="">Catégorie principale</option>
                        {(rows || []).filter((c) => !c.parentId && c.id !== form.id && c.catalogueType === form.catalogueType).map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                      </select></label>
                  </div>
                  <div className="cadm-row">
                    <label>Icône (emoji ou mot)<input maxLength={40} value={form.icon} onChange={(e) => set('icon', e.target.value)} /></label>
                    <label>Couleur<span className="cadm-color"><input type="color" value={form.color || '#c9a24b'} onChange={(e) => set('color', e.target.value)} aria-label="Couleur" />
                      <button type="button" className="btn ghost cadm-sm" onClick={() => set('color', '')}>Aucune</button></span></label>
                  </div>
                  <label>Image (adresse https://… ou /chemin)<input inputMode="url" maxLength={500} value={form.image} onChange={(e) => set('image', e.target.value)} /></label>
                  <label>Image d’en-tête (hero)<input inputMode="url" maxLength={500} value={form.heroImage} onChange={(e) => set('heroImage', e.target.value)} /></label>
                  <div className="cadm-row">
                    <label className="chk"><input type="checkbox" checked={form.isActive} onChange={(e) => set('isActive', e.target.checked)} /> Active (visible sur le site)</label>
                    <label className="chk"><input type="checkbox" checked={form.isFeatured} onChange={(e) => set('isFeatured', e.target.checked)} /> Mise en avant</label>
                  </div>
                </>
              )}

              <div className="cadm-prev" aria-label="Aperçu du rendu">
                <small className="meta">Aperçu ({LANGS.find((l) => l[0] === lang)[1]})</small>
                <div className="cadm-tile" dir={lang === 'ar' ? 'rtl' : 'ltr'} style={{ borderColor: form.color || 'var(--line-soft)' }}>
                  {form.image && /^(https?:\/\/|\/)/.test(form.image) && <img src={form.image} alt="" onError={(e) => { e.currentTarget.style.display = 'none'; }} />}
                  <span className="cadm-ico" style={{ background: form.color || 'var(--line-soft)' }}>{form.icon}</span>
                  <b>{pName}</b>
                  {pShort && <small>{pShort}</small>}
                </div>
                <small className={form.isActive ? 'meta' : 'error'}>{visibility}</small>
              </div>

              <div className="cadm-row">
                <button className="btn" disabled={busy}>{form.id ? 'Enregistrer' : 'Créer'}</button>
                <button type="button" className="btn ghost" onClick={() => setForm(null)}>Fermer</button>
              </div>

              {form.id && (
                <div className="cadm-talks">
                  <h4>Vidéos de cette catégorie ({members.length})</h4>
                  <ul>
                    {members.length === 0 && <li className="meta">Aucune vidéo.</li>}
                    {members.map((m) => (
                      <li key={m.id}><span>{m.title}{m.isMain ? '' : ' · supplémentaire'}{m.publication !== 'published' ? ` · ${m.publication === 'draft' ? 'brouillon' : 'programmée'}` : ''}</span>
                        <button type="button" className="link u danger-link" onClick={() => dropTalk(m.id)}>Retirer</button></li>
                    ))}
                  </ul>
                  <label>Ajouter des vidéos<input type="search" placeholder="Rechercher un titre ou un intervenant" value={q} onChange={(e) => setQ(e.target.value)} /></label>
                  <ul>
                    {cands.map((m) => <li key={m.id}><span>{m.title} <small className="meta">{m.speaker}</small></span><button type="button" className="link u" onClick={() => addTalk(m.id)}>+ Ajouter</button></li>)}
                  </ul>
                </div>
              )}
            </form>
          )}
        </div>
      </div>
    </section>
  );
}
