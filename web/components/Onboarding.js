'use client';
// Étape B2 — Premiers pas d'un nouveau membre.
//  - <StartCards />  : écran « Par quoi commencer ? » en haut de l'accueil, UNE seule fois (nouveaux comptes : onboarded = false).
//                      3 cartes selon les fonctions activées + « Faire la visite guidée » + « Plus tard ».
//  - <Tour />        : visite guidée en bulles (accueil, ?tour=1) : chaque étape éclaire un élément visible de la page
//                      (bloc « Aujourd'hui », Apprendre, Coran, recherche, compte) ; les éléments absents sont sautés.
//                      Clavier : Échap ferme, ← / → changent d'étape. Relançable depuis le menu du compte.
// Fonction « onboarding » (Admin → Fonctions) : coupée, rien ne s'affiche.
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useApp } from './Providers';

// Cartes candidates, dans l'ordre ; on garde les 3 premières dont la fonction est activée.
export function startCards(feat) {
  const all = [
    { id: 'talk', on: true, href: '/catalogue', title: 'obTalk', text: 'obTalkTx', icon: 'M7 4l13 8-13 8z' },
    { id: 'quran', on: feat('quran') && feat('quranplan'), href: '/coran', title: 'obQuran', text: 'obQuranTx', icon: 'M4 5a2 2 0 0 1 2-2h12v18H6a2 2 0 0 1-2-2zM8 7h7M8 11h7' },
    { id: 'athkar', on: feat('athkar'), href: '/learning?tab=athkar', title: 'obAthkar', text: 'obAthkarTx', badge: 'obLearnBadge', icon: 'M12 3a9 9 0 1 0 9 9M12 7v5l3 3' },
    { id: 'ramadan', on: feat('ramadan'), href: '/ramadan', title: 'obRamadan', text: 'obRamadanTx', icon: 'M20 14A8 8 0 1 1 10 4a6 6 0 0 0 10 10z' },
  ];
  return all.filter((c) => c.on).slice(0, 3);
}

async function markDone(call, patchUser) {
  patchUser?.({ onboarded: true });
  await call('/me/onboarding', { method: 'PUT', body: JSON.stringify({ done: true }) });
}

export function StartCards() {
  const { t, user, feat, call, patchUser } = useApp();
  const router = useRouter();
  const cards = useMemo(() => startCards(feat), [feat]);
  if (!user || user.onboarded !== false || !feat('onboarding')) return null;
  const go = async (href) => { await markDone(call, patchUser); router.push(href); };
  return (
    <section className="ob" aria-labelledby="ob-title">
      <h2 id="ob-title">{t('obTitle')}</h2>
      <p className="ob-intro">{t('obIntro')}</p>
      <ul className="ob-cards" aria-label={t('obAria')}>
        {cards.map((c) => (
          <li key={c.id}>
            <Link href={c.href} className="ob-card" onClick={(e) => { e.preventDefault(); go(c.href); }}>
              <span className="ob-ico" aria-hidden="true">
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d={c.icon} /></svg>
              </span>
              <b>{t(c.title)}</b>
              <span className="ob-text">{t(c.text)}</span>
              {c.badge && <span className="ob-badge">{t(c.badge)}</span>}
            </Link>
          </li>
        ))}
      </ul>
      <div className="ob-actions">
        <button type="button" className="btn" onClick={() => go('/?tour=1')}>{t('obTourBtn')}</button>
        <button type="button" className="link u" onClick={() => markDone(call, patchUser)}>{t('obLater')}</button>
      </div>
    </section>
  );
}

// Étapes de la visite : sélecteurs essayés dans l'ordre (le premier élément VISIBLE est éclairé).
// Sur téléphone, Apprendre / Coran sont dans le menu : on éclaire alors le bouton du menu (texte « Le menu »).
export const TOUR_STEPS = [
  { id: 'today', sel: ['.today'], key: 'tourToday' },
  { id: 'learn', sel: ['.ms-side a[href="/learning"]', '.hd-nav a[href="/learning"]', '.ms-bar a[href="/learning"]', '.hd-burger'], key: 'tourLearn' },
  { id: 'quran', sel: ['.ms-side a[href="/coran"]', '.hd-nav a[href="/coran"]', '.ms-bar a[href="/coran"]', '.hd-burger'], key: 'tourQuran', feature: 'quran' },
  { id: 'search', sel: ['.hd-search-wrap button', '.hd-search-wrap a'], key: 'tourSearch' },
  { id: 'account', sel: ['.hd-avatar-btn', '.hd-burger'], key: 'tourAccount' },
];

const visible = (el) => {
  if (!el) return false;
  const r = el.getBoundingClientRect();
  return r.width > 0 && r.height > 0 && getComputedStyle(el).visibility !== 'hidden';
};

// Étapes réellement affichables sur cette page ; un élément déjà éclairé (bouton du menu) ne l’est pas deux fois.
function resolveSteps(feat) {
  const out = [];
  for (const s of TOUR_STEPS) {
    if (s.feature && !feat(s.feature)) continue;
    let el = null;
    for (const q of s.sel) { const c = [...document.querySelectorAll(q)].find(visible); if (c) { el = c; break; } }
    if (!el) continue;
    const burger = el.classList.contains('hd-burger');
    if (out.some((o) => o.el === el)) continue; // même élément déjà éclairé (bouton du menu sur téléphone)
    out.push({ ...s, el, key: burger ? 'tourBurger' : s.key });
  }
  return out;
}

export function Tour({ onClose }) {
  const { t, feat } = useApp();
  const [steps, setSteps] = useState([]);
  const [i, setI] = useState(0);
  const [rect, setRect] = useState(null);
  const [vw, setVw] = useState(0);
  const [vh, setVh] = useState(0);
  const bubble = useRef(null);
  const nextBtn = useRef(null);

  // Laisse la page s'afficher (bloc « Aujourd'hui » chargé) avant de chercher les éléments.
  useEffect(() => { const id = setTimeout(() => setSteps(resolveSteps(feat)), 600); return () => clearTimeout(id); }, [feat]);
  const step = steps[i];
  const measure = useCallback(() => {
    if (!step) return;
    const r = step.el.getBoundingClientRect();
    setRect({ top: r.top, left: r.left, width: r.width, height: r.height });
    setVw(window.innerWidth); setVh(window.innerHeight);
  }, [step]);
  useEffect(() => {
    if (!step) return undefined;
    step.el.scrollIntoView({ block: 'center', behavior: 'smooth' });
    const id = setTimeout(measure, 350);
    window.addEventListener('resize', measure); window.addEventListener('scroll', measure, { passive: true });
    return () => { clearTimeout(id); window.removeEventListener('resize', measure); window.removeEventListener('scroll', measure); };
  }, [step, measure]);
  useLayoutEffect(() => { if (rect) nextBtn.current?.focus({ preventScroll: true }); }, [i, rect]);
  useEffect(() => {
    const onKey = (e) => {
      if (e.key === 'Escape') onClose();
      const rtl = document.documentElement.dir === 'rtl';
      if (e.key === (rtl ? 'ArrowLeft' : 'ArrowRight')) setI((x) => Math.min(x + 1, steps.length - 1));
      if (e.key === (rtl ? 'ArrowRight' : 'ArrowLeft')) setI((x) => Math.max(x - 1, 0));
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose, steps.length]);

  if (!step || !rect) return null;
  const last = i === steps.length - 1;
  const pad = 6;
  const W = Math.min(320, vw - 32);
  const below = rect.top + rect.height + 180 < vh;
  const top = below ? rect.top + rect.height + pad + 12 : Math.max(16, rect.top - pad - 12 - (bubble.current?.offsetHeight || 170));
  const left = Math.min(Math.max(16, rect.left + rect.width / 2 - W / 2), vw - W - 16);
  return (
    <div className="tour" role="presentation">
      <div className="tour-back" onClick={onClose} aria-hidden="true" />
      <div className="tour-hole" aria-hidden="true" style={{ top: rect.top - pad, left: rect.left - pad, width: rect.width + pad * 2, height: rect.height + pad * 2 }} />
      <div ref={bubble} className={`tour-bubble ${below ? 'below' : 'above'}`} role="dialog" aria-modal="true" aria-labelledby="tour-t" aria-describedby="tour-d" style={{ top, left, width: W }}>
        <span className="tour-count" dir="ltr">{t('tourOf').replace('{i}', i + 1).replace('{n}', steps.length)}</span>
        <h2 id="tour-t">{t(`${step.key}_t`)}</h2>
        <p id="tour-d">{t(step.key)}</p>
        <div className="tour-actions">
          <button type="button" className="link u small" onClick={onClose}>{t('tourSkip')}</button>
          <span className="tour-nav">
            {i > 0 && <button type="button" className="btn ghost" onClick={() => setI(i - 1)}>{t('tourPrev')}</button>}
            <button ref={nextBtn} type="button" className="btn" onClick={() => (last ? onClose() : setI(i + 1))}>{last ? t('tourEnd') : t('tourNext')}</button>
          </span>
        </div>
      </div>
    </div>
  );
}
