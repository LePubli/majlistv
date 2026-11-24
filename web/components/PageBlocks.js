'use client';
// Étape I3 — Rendu des pages en blocs (Admin → Pages).
//
//  <BlocksView>  dessine une liste de blocs (utilisé par le site et par l'aperçu de l'éditeur).
//  <PageZone>    une zone d'une page : blocs reçus du serveur (« tout le monde ») puis, si la page contient des blocs
//                réservés à un public (visiteurs, membres, abonnés…), liste complète rechargée selon la connexion.
//  <PageSlots>   entoure le contenu de TOUTES les pages : ajoute les blocs « avant / après » de la page affichée.
//
// Sécurité : les textes sont du texte brut (React les échappe), les adresses sont revérifiées ici, les images ne viennent
// que de la bibliothèque du site, les vidéos que de YouTube / Vimeo (intégration sans cookies).
import { Fragment, useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useApp } from './Providers';
import TalkCard from './TalkCard';
import { DataBlock } from './HomeBlocks';
import { tx, validUrl, validMedia, colorCss, fontCss, videoEmbed, DEVICE_LABELS, AUDIENCES } from '../lib/blocks';
import { DIR } from '../lib/locales';

const media = (id) => (validMedia(id) ? `/api/pages/media/${id}` : null);

/* ------------------------------------------------------------------ Texte enrichi (très simple, sans HTML) */
// **gras**, *italique*, [texte](adresse) ; lignes « - » = liste ; ligne vide = nouveau paragraphe.
function Link2({ href, children }) {
  if (!validUrl(href)) return <>{children}</>;
  if (href.startsWith('/')) return <Link href={href}>{children}</Link>;
  const web = href.startsWith('https://');
  return <a href={href} {...(web ? { target: '_blank', rel: 'noopener noreferrer' } : {})}>{children}</a>;
}
function inline(text, keyBase = '') {
  const out = [];
  const re = /\*\*([^*]+)\*\*|\*([^*]+)\*|\[([^\]]+)\]\(([^)\s]+)\)/g;
  let last = 0; let m; let i = 0;
  while ((m = re.exec(text))) {
    if (m.index > last) out.push(text.slice(last, m.index));
    const k = `${keyBase}${i++}`;
    if (m[1] !== undefined) out.push(<strong key={k}>{m[1]}</strong>);
    else if (m[2] !== undefined) out.push(<em key={k}>{m[2]}</em>);
    else out.push(<Link2 key={k} href={m[4]}>{m[3]}</Link2>);
    last = m.index + m[0].length;
  }
  if (last < text.length) out.push(text.slice(last));
  return out;
}
export function Rich({ text }) {
  const paras = String(text || '').split(/\n{2,}/).map((p) => p.trim()).filter(Boolean);
  return paras.map((p, i) => {
    const lines = p.split('\n');
    if (lines.every((l) => /^\s*-\s+/.test(l))) return <ul key={i}>{lines.map((l, j) => <li key={j}>{inline(l.replace(/^\s*-\s+/, ''), `${i}-${j}-`)}</li>)}</ul>;
    return <p key={i}>{lines.map((l, j) => <Fragment key={j}>{j > 0 && <br />}{inline(l, `${i}-${j}-`)}</Fragment>)}</p>;
  });
}

/* ------------------------------------------------------------------ Les blocs */
function Btn({ url, label, kind = 'primary' }) {
  if (!label || !validUrl(url || '')) return null;
  const cls = `btn${kind === 'ghost' ? ' ghost' : ''}`;
  return url.startsWith('/') ? <Link className={cls} href={url}>{label}</Link> : <a className={cls} href={url} {...(url.startsWith('https://') ? { target: '_blank', rel: 'noopener noreferrer' } : {})}>{label}</a>;
}

function TalksBlock({ p, lang }) {
  const { t } = useApp();
  const [talks, setTalks] = useState(null);
  const limit = Number(p.limit) || 4;
  const category = p.source === 'category' ? Number(p.category) || 0 : 0;
  useEffect(() => {
    let dead = false;
    const q = new URLSearchParams({ limit: String(limit) });
    if (category) q.set('category', String(category));
    if (p.level) q.set('level', p.level);
    fetch(`/api/talks?${q}`).then((r) => (r.ok ? r.json() : [])).then((rows) => { if (!dead) setTalks(Array.isArray(rows) ? rows : []); }).catch(() => { if (!dead) setTalks([]); });
    return () => { dead = true; };
  }, [limit, category, p.level]);
  const title = tx(p.title, lang);
  const moreLabel = tx(p.moreLabel, lang);
  if (talks && !talks.length) return null;
  return (
    <>
      {(title || (moreLabel && validUrl(p.moreUrl || ''))) && (
        <div className="hb-head">
          {title && <h2 className="pb-h">{title}</h2>}
          {moreLabel && validUrl(p.moreUrl || '') && <Link2 href={p.moreUrl}><span className="hb-all">{moreLabel} →</span></Link2>}
        </div>
      )}
      <div className="pb-talks">{(talks || []).map((talk) => <TalkCard key={talk.id} talk={talk} t={t} />)}</div>
    </>
  );
}

function Block({ b, lang, ctx = {} }) {
  const p = b.props || {};
  const T = (k) => tx(p[k], lang);
  switch (b.type) {
    case 'hero': {
      const img = media(p.image);
      const dim = Math.max(0, Math.min(90, Number.isFinite(Number(p.overlay)) ? Number(p.overlay) : 55)) / 100;
      return (
        <div className={`pb-hero h-${p.height || 'm'}${img ? ' has-img' : ''}`} style={img ? { backgroundImage: `linear-gradient(rgba(0,0,0,${dim}), rgba(0,0,0,${dim})), url(${img})` } : undefined}>
          {T('eyebrow') && <p className="eyebrow">{T('eyebrow')}</p>}
          {T('title') && <h1>{T('title')}</h1>}
          {T('text') && <div className="pb-rich"><Rich text={T('text')} /></div>}
          <div className="pb-actions"><Btn url={p.btn1Url} label={T('btn1Label')} /><Btn url={p.btn2Url} label={T('btn2Label')} kind="ghost" /></div>
        </div>
      );
    }
    case 'columns': {
      const n = Math.max(1, Math.min(4, Number(p.count) || 2));
      const cols = b.cols || [];
      return (
        <div className={`pb-cols n-${n} r-${p.ratio || 'eq'} g-${p.gap || 'm'} v-${p.valign || 'start'} st-${p.stack || 'm'}`}>
          {Array.from({ length: n }, (_, i) => (
            <div key={i} className="pb-col" {...(ctx.editor ? { 'data-zone': `${b.id}:${i}` } : {})}>
              <BlocksView blocks={cols[i] || []} locale={lang} preview={ctx.preview} onPick={ctx.onPick} pickedId={ctx.pickedId} editor={ctx.editor} nested />
              {ctx.editor && !(cols[i] || []).length && <div className="pb-empty">Colonne {i + 1} : déposez un bloc ici</div>}
            </div>
          ))}
        </div>
      );
    }
    case 'heading': {
      const H = p.level === 'h3' ? 'h3' : 'h2';
      return <div className="pb-heading"><H className="pb-h">{T('title')}</H>{T('subtitle') && <p className="pb-sub">{T('subtitle')}</p>}</div>;
    }
    case 'text': return <div className="pb-rich"><Rich text={T('body')} /></div>;
    case 'image': {
      const src = media(p.image);
      if (!src) return null;
      const fig = (
        <figure className={`pb-image s-${p.size || 'wide'}`}>
          <img src={src} alt={T('alt')} loading="lazy" />
          {T('caption') && <figcaption>{T('caption')}</figcaption>}
        </figure>
      );
      return validUrl(p.link || '') && p.link ? <Link2 href={p.link}>{fig}</Link2> : fig;
    }
    case 'button': return <div className="pb-actions"><Btn url={p.url} label={T('label')} kind={p.kind} /></div>;
    case 'cards': {
      const cols = ['2', '3', '4'].includes(String(p.columns)) ? String(p.columns) : '3';
      return (
        <div className={`pb-cards c-${cols}`}>
          {(p.items || []).map((it, i) => {
            const src = media(it.image);
            const inner = (
              <>
                {src && <img src={src} alt="" loading="lazy" />}
                <div className="pb-card-body">{tx(it.title, lang) && <h3>{tx(it.title, lang)}</h3>}{tx(it.text, lang) && <div className="pb-rich"><Rich text={tx(it.text, lang)} /></div>}</div>
              </>
            );
            return validUrl(it.link || '') && it.link
              ? <Link2 key={i} href={it.link}><span className="pb-card is-link">{inner}</span></Link2>
              : <div key={i} className="pb-card">{inner}</div>;
          })}
        </div>
      );
    }
    case 'talks': return <TalksBlock p={p} lang={lang} />;
    case 'quote': return <figure className="pb-quote"><blockquote>{T('text')}</blockquote>{T('author') && <figcaption>— {T('author')}</figcaption>}</figure>;
    case 'faq':
      return (
        <div className="pb-faq">
          {T('title') && <h2 className="pb-h">{T('title')}</h2>}
          {(p.items || []).map((it, i) => <details key={i}><summary>{tx(it.q, lang)}</summary><div className="pb-rich"><Rich text={tx(it.a, lang)} /></div></details>)}
        </div>
      );
    case 'video': {
      const v = videoEmbed(p.url);
      if (!v) return null;
      return <div className="pb-video"><iframe src={v.src} title={T('title') || 'Vidéo'} loading="lazy" allow="fullscreen; picture-in-picture" allowFullScreen referrerPolicy="strict-origin-when-cross-origin" /></div>;
    }
    case 'spacer': return <div className="pb-spacer" style={{ height: Math.max(8, Math.min(240, Number(p.size) || 40)) }} aria-hidden="true" />;
    case 'divider': return <hr className="pb-divider" />;
    default: return <DataBlock b={b} lang={lang} />; // blocs « données du site » (étape H) ; null pour un type inconnu
  }
}

// Réglages de style d'un bloc → attributs de la section (couleurs du thème ou codes hexadécimaux déjà validés par l'API).
function sectionProps(b, preview) {
  const st = b.style || {};
  const style = {};
  if (st.textColor) style.color = colorCss(st.textColor);
  if (st.bgColor) style.background = colorCss(st.bgColor);
  if (Number.isInteger(st.padTop)) style.paddingTop = st.padTop;
  if (Number.isInteger(st.padBottom)) style.paddingBottom = st.padBottom;
  if (Number.isInteger(st.radius)) style.borderRadius = st.radius;
  if (st.minHeight) style.minHeight = st.minHeight;
  if (validMedia(st.bgImage)) { style.backgroundImage = `url(/api/pages/media/${st.bgImage})`; style.backgroundSize = 'cover'; style.backgroundPosition = 'center'; }
  if (st.align) style.textAlign = st.align === 'start' ? 'start' : st.align === 'end' ? 'end' : 'center';
  const d = (b.show?.devices || ['m', 't', 'd']);
  const cls = ['pb', `pbt-${b.type}`]; // pbt- : type du bloc (ne pas confondre avec les classes de son contenu)
  if (st.bgColor || validMedia(st.bgImage)) cls.push('has-bg');
  if (st.shadow) cls.push(`pbsh-${st.shadow}`);
  if (st.border) cls.push('has-border');
  if (st.align) cls.push(`al-${st.align}`);
  if (st.maxWidth) cls.push(`mw-${st.maxWidth}`);
  // Étape 5 : police, survol, animation et réglages par appareil (tablette T, téléphone M ; les valeurs passent par des variables CSS)
  const fam = fontCss(st.font);
  if (fam) style.fontFamily = fam;
  if (st.hover) cls.push(`pbh-${st.hover}`);
  if (st.hoverBg) { style['--pb-hbg'] = colorCss(st.hoverBg); cls.push('pbh-bg'); }
  if (st.hoverText) { style['--pb-htx'] = colorCss(st.hoverText); cls.push('pbh-tx'); }
  if (st.anim && !preview) { cls.push('pb-anim', `pb-an-${st.anim}`); if (st.animDelay) style['--pb-ad'] = `${st.animDelay}ms`; }
  for (const [k, v, c] of [['padTopT', '--pt-t', 'pt-t'], ['padBottomT', '--pb-t', 'pb-bt'], ['padTopM', '--pt-m', 'pt-m'], ['padBottomM', '--pb-m', 'pb-bm']]) {
    if (Number.isInteger(st[k])) { style[v] = `${st[k]}px`; cls.push(c); }
  }
  if (Number.isInteger(st.minHeightM) && st.minHeightM > 0) { style['--mh-m'] = `${st.minHeightM}px`; cls.push('mh-m'); }
  if (st.alignM) cls.push(`al-m-${st.alignM}`);
  // Étape 6a : éléments du bloc (variables CSS + classes ; les règles sont dans globals.css)
  for (const [k, v, c, unit] of [['elTitleColor', '--el-tc', 'el-tc', 'c'], ['elTitleSize', '--el-ts', 'el-ts', 'px'], ['elTitleWeight', '--el-tw', 'el-tw', ''], ['elTextColor', '--el-xc', 'el-xc', 'c'], ['elTextSize', '--el-xs', 'el-xs', 'px'], ['elBtnBg', '--el-bb', 'el-bb', 'c'], ['elBtnColor', '--el-bc', 'el-bc', 'c'], ['elBtnRadius', '--el-br', 'el-br', 'px'], ['elImgRadius', '--el-ir', 'el-ir', 'px']]) {
    if (st[k] === undefined || st[k] === '') continue;
    style[v] = unit === 'c' ? colorCss(st[k]) : `${st[k]}${unit}`;
    cls.push(c);
  }
  if (!d.includes('m')) cls.push('pb-hide-m');
  if (!d.includes('t')) cls.push('pb-hide-t');
  if (!d.includes('d')) cls.push('pb-hide-d');
  return { className: cls.join(' '), style, 'data-block': b.id };
}

// Liste de blocs. preview = vrai : tous les publics sont montrés, avec une étiquette sur les blocs limités.
export function BlocksView({ blocks, locale, preview = false, onPick, pickedId, editor = false, nested = false }) {
  const lang = locale || 'fr';
  const { blockEdits } = useApp(); // mode édition sur la page (étape I5) : le bloc en cours de modification s'affiche tout de suite
  // Étape 5 : animations d'apparition. Sans JavaScript, ou pour les blocs déjà visibles au chargement, rien n'est caché ;
  // les blocs plus bas sont « armés » (cachés) puis révélés quand ils entrent dans l'écran. Respect de « réduire les animations ».
  useEffect(() => {
    if (preview || typeof document === 'undefined') return undefined;
    const els = [...document.querySelectorAll('.pb-anim:not(.pb-armed):not(.pb-seen)')];
    if (!els.length) return undefined;
    if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches || !('IntersectionObserver' in window)) { els.forEach((e) => e.classList.add('pb-seen')); return undefined; }
    const io = new IntersectionObserver((list) => list.forEach((en) => { if (en.isIntersecting) { en.target.classList.add('pb-seen'); io.unobserve(en.target); } }), { threshold: 0.12 });
    for (const e of els) {
      const r = e.getBoundingClientRect();
      if (r.top < window.innerHeight * 0.9 && r.bottom > 0) e.classList.add('pb-seen'); // déjà à l'écran : on joue l'animation sans cacher d'abord
      else { e.classList.add('pb-armed'); io.observe(e); }
    }
    return () => io.disconnect();
  }, [blocks, preview]);
  return (
    <>
      {(blocks || []).map((b0) => {
        const b = blockEdits?.[b0.id] || b0;
        const props = sectionProps(b, preview);
        const flags = preview ? [
          ...((b.show?.devices || []).length < 3 ? [(b.show.devices || []).map((d) => DEVICE_LABELS[d]).join(' + ')] : []),
          ...((b.show?.audience || 'all') !== 'all' ? [AUDIENCES.find(([a]) => a === b.show.audience)?.[1]] : []),
        ] : [];
        return (
          <section key={b.id} {...props} {...(preview ? { 'data-block-id': b.id } : {})} {...(preview && onPick ? { onClick: (e) => { e.stopPropagation(); onPick(b.id); }, 'aria-current': pickedId === b.id ? 'true' : undefined } : {})}
            className={`${props.className}${preview && pickedId === b.id ? ' is-picked' : ''}`}>
            {flags.length > 0 && <span className="pb-flag">{flags.join(' · ')}</span>}
            <div className="pb-in"><Block b={b} lang={lang} ctx={{ preview, onPick, pickedId, editor }} /></div>
          </section>
        );
      })}
    </>
  );
}

/* ------------------------------------------------------------------ Zones sur le site */
// Blocs d'une zone : ceux reçus du serveur, puis — s'il existe des blocs ciblés — la liste complète selon la connexion.
function useZoneBlocks(path, zone, initial, targeted) {
  const { ready, call } = useApp(); // call() envoie le jeton de connexion ; il change quand la session change
  const [full, setFull] = useState(null); // { path, zones } reçu du navigateur
  useEffect(() => {
    if (!targeted || !ready || !path) { setFull(null); return undefined; }
    let dead = false;
    call(`/pages/view?path=${encodeURIComponent(path)}`).then((r) => { if (!dead && r.ok) setFull({ path, zones: r.data.zones }); }).catch(() => {});
    return () => { dead = true; };
  }, [targeted, ready, call, path]);
  return full && full.path === path && full.zones?.[zone] ? full.zones[zone] : (initial || []);
}

export function PageZone({ path, zone, initial, targeted, className = '' }) {
  const { locale } = useApp();
  const blocks = useZoneBlocks(path, zone, initial, targeted);
  if (!blocks.length) return null;
  return <div className={`pb-zone ${className}`} data-pbpath={path} lang={locale} dir={DIR[locale] || 'ltr'}><BlocksView blocks={blocks} locale={locale} /></div>;
}

// Autour du contenu de chaque page : blocs « avant » et « après » ajoutés dans Admin → Pages.
export function PageSlots({ slots, children }) {
  const raw = usePathname() || '/';
  const path = raw.length > 1 ? raw.replace(/\/+$/, '') : raw;
  // Adresse exacte d'abord ; sinon la zone « toutes les pages de ce genre » (/conferences/*, /series/*, /catalogue/*).
  const wild = path.startsWith('/conferences/') ? '/conferences/*' : path.startsWith('/series/') ? '/series/*' : path.startsWith('/catalogue/') ? '/catalogue/*' : null;
  const key = slots?.[path] ? path : (wild && slots?.[wild] ? wild : null);
  const entry = key ? slots[key] : null;
  if (!entry) return children;
  return (
    <>
      <PageZone path={key} zone="before" initial={entry.before} targeted={entry.targeted} className="pb-before" />
      {children}
      <PageZone path={key} zone="after" initial={entry.after} targeted={entry.targeted} className="pb-after" />
    </>
  );
}

// Page personnalisée /p/<nom> : le serveur donne les blocs « tout le monde », le navigateur complète selon la connexion.
export function CustomPage({ page }) {
  const { locale } = useApp();
  const title = tx(page.meta?.title, locale) || page.title;
  const hasH1 = (page.zones?.main || []).some((b) => b.type === 'hero'); // une bannière porte déjà le titre de la page
  return (
    <main className="pb-page">
      {!hasH1 && <h1 className="sr-only">{title}</h1>}
      <PageZone path={page.path} zone="main" initial={page.zones?.main} targeted={page.targeted} className="pb-main" />
    </main>
  );
}

// Étape I4 — Zone de blocs de « En-tête, menus et pied de page » (topbar, footerTop). Dans l'aperçu de l'éditeur : les blocs du brouillon, sans appel au serveur.
export function LayoutZone({ zone, className = '' }) {
  const { layout, layoutIsPreview, locale } = useApp();
  const blocks = layout?.zones?.[zone] || [];
  if (layoutIsPreview) {
    if (!blocks.length) return null;
    return <div className={`pb-zone ${className}`} lang={locale} dir={DIR[locale] || 'ltr'}><BlocksView blocks={blocks} locale={locale} /></div>;
  }
  return <PageZone path="/_layout" zone={zone} initial={blocks} targeted={Boolean(layout?.targeted)} className={className} />;
}

// Accueil des membres en blocs (étape H) : le serveur renvoie les blocs adaptés à la personne (connexion, abonnement).
export function HomeBlocks({ page }) {
  const { locale } = useApp();
  return (
    <main className="pb-page pb-home" data-pbpath="/_home" lang={locale} dir={DIR[locale] || 'ltr'}>
      <BlocksView blocks={page.zones?.main || []} locale={locale} />
    </main>
  );
}
