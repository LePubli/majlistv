'use client';
// Éditeur de montage (étape E3) — habillage dessiné par-dessus l'aperçu : titres, bandeau de nom, logo, fondu des transitions,
// sous-titres incrustés et écrans d'intro / de fin. Toutes les tailles suivent les mêmes proportions que le rendu final
// (image de 1080 px de haut : « u » = hauteur de l'aperçu / 1080) ; le dessin des lettres vient du navigateur, le vrai rendu
// (FFmpeg, bouton « Voir l'image finale ») utilise la police DejaVu Sans : les largeurs peuvent différer un peu.
import { useEffect, useRef, useState } from 'react';
import { activeItems, logoOn, dipAt, fillVars } from './ops';

const GOLD = '#E6A739';

export default function DressOverlay({ dress, T, totalS, clips, vars, logoUrl, caption, card, cardText }) {
  const box = useRef(null);
  const [u, setU] = useState(0.4);
  useEffect(() => {
    const el = box.current?.parentElement;
    if (!el) return undefined;
    const ro = new ResizeObserver(() => setU(el.clientHeight / 1080));
    ro.observe(el); setU(el.clientHeight / 1080);
    return () => ro.disconnect();
  }, []);
  const px = (n) => `${(n * u).toFixed(2)}px`;
  const items = card ? [] : activeItems(dress, T, totalS);
  const dip = card ? { alpha: 0 } : dipAt(dress, clips, T);
  const showLogo = card ? dress.logo.on && logoUrl : logoOn(dress, T) && logoUrl;
  return (
    <div className="mt-dress" ref={box} aria-hidden="true" data-testid="dress-overlay">
      {dip.alpha > 0.001 && <div className="mt-dress-dip" data-dip={dip.alpha.toFixed(2)} style={{ background: dip.color, opacity: dip.alpha }} />}
      {items.map(({ item: it, alpha }) => {
        const main = fillVars(it.text, vars); const sub = fillVars(it.sub, vars); const k = it.scale / 100;
        if (!main && !sub) return null;
        if (it.kind === 'banner') {
          const right = it.side === 'right';
          return (
            <div key={it.id} className={`mt-dress-banner${right ? ' right' : ''}`} data-item={it.id} style={{ opacity: alpha, [right ? 'right' : 'left']: px(90), bottom: px(150) }}>
              {main && <b dir="auto" style={{ fontSize: px(54 * k), padding: `${px(8)} ${px(20)}` }}>{main}</b>}
              {sub && <span dir="auto" style={{ fontSize: px(38 * k), padding: `${px(6)} ${px(20)}` }}>{sub}</span>}
            </div>
          );
        }
        const place = it.pos === 'top' ? { top: px(110) } : it.pos === 'bottom' ? { bottom: px(190) } : { top: '50%', transform: 'translateY(-50%)' };
        return (
          <div key={it.id} className="mt-dress-title" data-item={it.id} style={{ opacity: alpha, ...place }}>
            {main && <b dir="auto" style={{ fontSize: px(96 * k) }}>{main}</b>}
            {sub && <span dir="auto" style={{ fontSize: px(46 * k) }}>{sub}</span>}
          </div>
        );
      })}
      {!card && dress.subs.burn && caption && (
        <p className={`mt-dress-subs${dress.subs.box ? ' box' : ''}${dress.subs.pos === 'top' ? ' top' : ''}`} dir="auto" data-burn="1"
          style={{ fontSize: px(50 * dress.subs.scale / 100), [dress.subs.pos === 'top' ? 'top' : 'bottom']: px(60), padding: dress.subs.box ? `${px(10)} ${px(14)}` : 0 }}>{caption}</p>
      )}
      {showLogo && !card && (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={logoUrl} alt="" className="mt-dress-logo" data-logo="1"
          style={{ width: `${dress.logo.size}%`, opacity: dress.logo.opacity / 100, [dress.logo.pos[1] === 'r' ? 'right' : 'left']: '2.1%', [dress.logo.pos[0] === 't' ? 'top' : 'bottom']: `${2.1 * 16 / 9}%` }} />
      )}
      {card && (
        <div className="mt-dress-card" data-card={card}>
          <div className="mt-dress-card-in">
            {cardText.title && <b dir="auto" style={{ fontSize: px(104) }}>{fillVars(cardText.title, vars)}</b>}
            <i style={{ width: px(160 * 1.5), height: px(6) }} />
            {cardText.sub && <span dir="auto" style={{ fontSize: px(48) }}>{fillVars(cardText.sub, vars)}</span>}
          </div>
          {showLogo && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={logoUrl} alt="" className="mt-dress-logo" style={{ width: '14%', left: '43%', top: '18%', opacity: 1 }} />
          )}
        </div>
      )}
    </div>
  );
}
export { GOLD };
