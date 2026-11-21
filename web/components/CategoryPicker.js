'use client';
// Sélecteur de catégories pour la fiche d'une vidéo (Studio) : remplace les deux murs de pastilles (≈ 280 catégories chacun).
//   - replié : seulement le choix actuel (pastilles à retirer) et un bouton « Choisir » / « Ajouter » ;
//   - ouvert : recherche, filtre Adultes / Kids, liste qui défile (hauteur limitée), thèmes et sous-thèmes regroupés.
// mode « single » : une seule catégorie (la principale) ; mode « multi » : plusieurs (les supplémentaires), plafonnées à `max`.
import { useMemo, useState } from 'react';

const norm = (s) => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');

export default function CategoryPicker({ cats, mode = 'single', value, onChange, max = 20, exclude = null, t, label }) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState('');
  const [cat, setCat] = useState('all'); // all | adult | kids
  const multi = mode === 'multi';
  const chosen = multi ? value : (value ? [Number(value)] : []);
  const byId = useMemo(() => new Map(cats.map((c) => [c.id, c])), [cats]);
  const hasKids = cats.some((c) => c.catalogueType === 'kids');

  // Liste affichée : thèmes (depth 0) suivis de leurs sous-thèmes ; en recherche, une liste plate avec le chemin complet.
  const rows = useMemo(() => {
    const nq = norm(q.trim());
    const ok = (c) => c.isActive !== false && String(c.id) !== String(exclude) && (cat === 'all' || c.catalogueType === cat);
    if (nq) return cats.filter((c) => ok(c) && norm(c.fullName || c.name).includes(nq)).slice(0, 80).map((c) => ({ c, flat: true }));
    const out = [];
    const tops = cats.filter((c) => !c.parentId && ok(c));
    for (const top of tops) {
      out.push({ c: top });
      for (const ch of cats.filter((x) => x.parentId === top.id && ok(x))) out.push({ c: ch, child: true });
    }
    // sous-thèmes dont le thème est masqué par le filtre : rien de plus (ils suivent leur thème)
    return out;
  }, [cats, q, cat, exclude]);

  const toggle = (id) => {
    if (!multi) { onChange(String(id)); setOpen(false); return; }
    const on = value.includes(id);
    if (!on && value.length >= max) return;
    onChange(on ? value.filter((v) => v !== id) : [...value, id].sort((a, b) => a - b));
  };
  const remove = (id) => (multi ? onChange(value.filter((v) => v !== id)) : onChange(''));

  return (
    <div className="cpk" role="group" aria-label={label}>
      <div className="cpk-chosen">
        {chosen.length === 0 && <span className="meta small">{t('catNone')}</span>}
        {chosen.map((id) => {
          const c = byId.get(id);
          return (
            <span key={id} className="cpk-chip">
              <span>{c ? (c.fullName || c.name) : `#${id}`}</span>
              <button type="button" aria-label={`${t('catRemove')} ${c ? c.name : id}`} onClick={() => remove(id)}>×</button>
            </span>
          );
        })}
        <button type="button" className="pill cpk-open" aria-expanded={open} onClick={() => setOpen(!open)}>
          {open ? t('catDone') : multi ? t('catAdd') : (chosen.length ? t('catChange') : t('catChoose'))}
        </button>
        {multi && <span className="meta small">{chosen.length}/{max}</span>}
      </div>
      {open && (
        <div className="cpk-panel">
          <div className="cpk-tools">
            <input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder={t('catSearch')} aria-label={t('catSearch')} autoFocus />
            {hasKids && (
              <span className="cpk-tabs" role="tablist">
                {[['all', t('catAll')], ['adult', t('catAdults')], ['kids', t('catKids')]].map(([k, l]) => (
                  <button key={k} type="button" role="tab" aria-selected={cat === k} className={cat === k ? 'pill on' : 'pill'} onClick={() => setCat(k)}>{l}</button>
                ))}
              </span>
            )}
          </div>
          <ul className="cpk-list" role="listbox" aria-multiselectable={multi}>
            {rows.length === 0 && <li className="meta small cpk-empty">{t('catNoMatch')}</li>}
            {rows.map(({ c, child, flat }) => {
              const on = chosen.includes(c.id);
              const full = multi && !on && value.length >= max;
              return (
                <li key={c.id} role="option" aria-selected={on}>
                  <button type="button" className={`cpk-row${child ? ' cpk-child' : ''}${on ? ' on' : ''}`} disabled={full} onClick={() => toggle(c.id)}>
                    <span className="cpk-box" aria-hidden="true">{on ? '✓' : ''}</span>
                    <span>{flat ? (c.fullName || c.name) : c.name}</span>
                    {c.catalogueType === 'kids' && <small className="cpk-tag">Kids</small>}
                  </button>
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </div>
  );
}
