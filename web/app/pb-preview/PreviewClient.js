'use client';
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { BlocksView } from '../../components/PageBlocks';
import { useApp } from '../../components/Providers';
import { DIR } from '../../lib/locales';

// Messages reçus de l'éditeur (même origine seulement) :
//   { type: 'pb-content', zones: { main | before | after: [blocs] }, locale, pickedId, editor? }   (pages en blocs ; editor = éditeur visuel)
//   { type: 'pb-layout', nav, zones: { topbar, footerTop }, viewAs }                                (En-tête, menus et pied de page : le vrai en-tête, les vrais menus et le vrai pied de page se redessinent)
//   { type: 'pb-scrollby', dy } · { type: 'pb-scrollto', id }                                       (éditeur visuel : défilement pendant un glisser-déposer, bloc à montrer)
// Messages envoyés à l'éditeur :
//   { type: 'pb-ready' } · { type: 'pb-pick', id }                                                  (id = null : clic dans le vide)
//   { type: 'pb-rects', rects: [{ id, zone, x, y, w, h }], zones: [{ zone, y, h }], scrollY, docH, viewH }   (éditeur visuel : position de chaque bloc dans le document)
const ZONE_TITLES = { before: 'Avant le contenu habituel de la page', after: 'Après le contenu habituel de la page' };

// Style propre à l'éditeur visuel : survol, bloc choisi, zone vide.
const EDITOR_CSS = `
.pb-editor [data-block-id] { cursor: pointer; }
.pb-editor [data-block-id]:hover { outline: 1px dashed var(--accent, #5aa9ff); outline-offset: -1px; }
.pb-editor .pb-empty { display: grid; place-items: center; min-height: 84px; margin: 8px 0; border: 2px dashed var(--line-strong, #555); border-radius: 12px; color: var(--muted, #999); font: 600 14px/1.4 var(--font-body, system-ui); }
.pb-editor { min-height: 60vh; }
`;

export default function PreviewClient() {
  const { setLayoutPreview, setViewAs } = useApp();
  const [msg, setMsg] = useState(null);
  const root = useRef(null);
  const raf = useRef(0);
  const origin = typeof window !== 'undefined' ? window.location.origin : '';

  useEffect(() => {
    const onMsg = (e) => {
      if (e.origin !== window.location.origin) return; // seulement l'éditeur, sur le même site
      if (e.data?.type === 'pb-layout') {
        setLayoutPreview({ nav: e.data.nav || null, zones: { topbar: e.data.zones?.topbar || [], footerTop: e.data.zones?.footerTop || [] }, targeted: false });
        setViewAs(e.data.viewAs === 'visitor' ? 'visitor' : null);
        setMsg({ layout: true });
        return;
      }
      if (e.data?.type === 'pb-scrollby') { window.scrollBy(0, Number(e.data.dy) || 0); return; }
      if (e.data?.type === 'pb-scrollto') {
        const n = document.querySelector(`[data-block-id="${CSS.escape(String(e.data.id))}"]`);
        if (n) { const r = n.getBoundingClientRect(); if (r.top < 60 || r.bottom > window.innerHeight - 20) window.scrollBy(0, r.top - window.innerHeight / 3); }
        return;
      }
      if (e.data?.type !== 'pb-content') return;
      setMsg(e.data);
    };
    window.addEventListener('message', onMsg);
    window.parent?.postMessage({ type: 'pb-ready' }, window.location.origin);
    return () => window.removeEventListener('message', onMsg);
  }, [setLayoutPreview, setViewAs]);

  // Un clic sur un bloc de l'aperçu le sélectionne dans l'éditeur.
  const pick = (id) => window.parent?.postMessage({ type: 'pb-pick', id }, window.location.origin);
  const editor = Boolean(msg?.editor);

  // Éditeur visuel : position de chaque bloc et de chaque zone dans le document (pour dessiner la sélection et les repères de dépôt).
  const report = useCallback(() => {
    cancelAnimationFrame(raf.current);
    raf.current = requestAnimationFrame(() => {
      const el = root.current;
      if (!el) return;
      const sy = window.scrollY;
      const rects = [...el.querySelectorAll('[data-block-id]')].map((n) => {
        const r = n.getBoundingClientRect();
        return { id: n.getAttribute('data-block-id'), zone: n.closest('[data-zone]')?.getAttribute('data-zone') || null, x: r.left, y: r.top + sy, w: r.width, h: r.height };
      });
      const zones = [...el.querySelectorAll('[data-zone]')].map((n) => {
        const r = n.getBoundingClientRect();
        return { zone: n.getAttribute('data-zone'), x: r.left, w: r.width, y: r.top + sy, h: r.height };
      });
      window.parent?.postMessage({ type: 'pb-rects', rects, zones, scrollY: sy, docH: document.documentElement.scrollHeight, viewH: window.innerHeight }, origin);
    });
  }, [origin]);

  useLayoutEffect(() => { if (editor) report(); });
  useEffect(() => {
    if (!editor) return undefined;
    const ro = new ResizeObserver(report);
    ro.observe(document.body);
    if (root.current) ro.observe(root.current);
    window.addEventListener('scroll', report, { passive: true });
    window.addEventListener('resize', report);
    // Les données du site (vidéos, séries…) arrivent après le premier dessin : on remesure plusieurs fois.
    const timers = [150, 500, 1200, 2500].map((ms) => setTimeout(report, ms));
    // Dans l'éditeur, un lien ou un bouton d'un bloc ne doit pas faire quitter la page.
    const stop = (e) => { if (e.target.closest?.('a[href], button, [role="button"], summary')) e.preventDefault(); };
    document.addEventListener('click', stop, true);
    return () => { ro.disconnect(); window.removeEventListener('scroll', report); window.removeEventListener('resize', report); timers.forEach(clearTimeout); document.removeEventListener('click', stop, true); };
  }, [editor, report]);

  if (!msg) return <main className="pb-page"><p className="meta" role="status">Aperçu en préparation…</p></main>;
  if (msg.layout) return <main className="pb-page"><p className="meta">Contenu de la page (l’en-tête, les menus et le pied de page ci-dessus et ci-dessous sont ceux de votre brouillon).</p></main>;
  const locale = msg.locale || 'fr';
  const order = msg.zones?.main ? ['main'] : ['before', 'after'];
  return (
    <main ref={root} className={`pb-page${editor ? ' pb-editor' : ''}`} lang={locale} dir={DIR[locale] || 'ltr'} onClick={editor ? () => pick(null) : undefined}>
      {editor && <style>{EDITOR_CSS}</style>}
      {order.map((z) => {
        const list = msg.zones?.[z] || [];
        return (
          <div key={z} className={`pb-zone pb-${z}`} {...(editor ? { 'data-zone': z } : {})}>
            {order.length > 1 && <p className="pb-zone-label">{ZONE_TITLES[z]}</p>}
            <BlocksView blocks={list} locale={locale} preview onPick={pick} pickedId={msg.pickedId} editor={editor} />
            {editor && list.length === 0 && <div className="pb-empty">Déposez un bloc ici</div>}
            {order.length > 1 && z === 'before' && <p className="pb-zone-label">▼ Contenu habituel de la page ▼</p>}
          </div>
        );
      })}
    </main>
  );
}
