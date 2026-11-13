'use client';
// Chaînes TV en direct 24 h/24 (fonction « livetv ») : en tête de la page « En direct ».
// Onglets = chaînes ; lecteur YouTube officiel (youtube-nocookie, déjà autorisé par la politique de sécurité du site) du direct en
// cours, retrouvé automatiquement par le serveur. Liste relue toutes les 5 minutes (le direct d'une chaîne change parfois).
import { useEffect, useState } from 'react';
import { useApp } from './Providers';

export const liveEmbed = (ref) => (/^[\w-]{11}$/.test(String(ref || '')) ? `https://www.youtube-nocookie.com/embed/${ref}?rel=0&playsinline=1&modestbranding=1` : null);

export default function LiveChannels() {
  const { t, call, feat } = useApp();
  const [list, setList] = useState(null);
  const [cur, setCur] = useState(0);
  useEffect(() => {
    if (!feat('livetv')) return undefined;
    let dead = false;
    const load = () => call('/live').then((r) => { if (!dead) setList(r.ok ? r.data.channels : []); });
    load();
    const h = setInterval(load, 5 * 60000);
    return () => { dead = true; clearInterval(h); };
  }, [call, feat]);
  if (!feat('livetv') || !list || list.length === 0) return null;
  const c = list[Math.min(cur, list.length - 1)];
  const src = liveEmbed(c.video?.ref);
  return (
    <section className="lv-box" aria-labelledby="lv-title">
      <div className="lv-head">
        <h2 id="lv-title">{t('lvTitle')}</h2>
        {list.length > 1 && (
          <div className="aw-cats" role="tablist" aria-label={t('lvTitle')}>
            {list.map((x, i) => (
              <button key={x.id} type="button" role="tab" aria-selected={i === cur} className={`chip${i === cur ? ' on' : ''}`} onClick={() => setCur(i)}>
                {x.live && <span className="lv-dot" aria-hidden="true" />}<bdi>{x.name}</bdi>
              </button>
            ))}
          </div>
        )}
      </div>
      <div className="lv-player">
        {src ? <iframe key={c.id} src={src} title={c.title || c.name} allow="autoplay; encrypted-media; picture-in-picture; fullscreen" allowFullScreen referrerPolicy="strict-origin-when-cross-origin" loading="lazy" /> : null}
      </div>
      <p className="meta lv-meta">
        <span className={c.live ? 'lv-on' : 'lv-off'}>{c.live ? `● ${t('lvLive')}` : t('lvNotLive')}</span>
        {c.title ? <> · <bdi>{c.title}</bdi></> : null}
      </p>
    </section>
  );
}
