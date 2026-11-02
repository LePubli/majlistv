'use client';
// Thème graphique de saison (étape 45H) : si la saison en cours a « thème de saison » coché (Admin → Saisons), le site prend une touche
// légère de saison (lueur et filet dorés, même famille noir et or). Les textes restent en blanc pur ; rien ne change hors période.
import { useEffect } from 'react';
import { useApp } from './Providers';

export default function SeasonTheme() {
  const { call, feat, locale } = useApp();
  useEffect(() => {
    if (!feat('seasons')) { delete document.body.dataset.season; return undefined; }
    let dead = false;
    call(`/seasons/current?lang=${locale}`, {}, null).then((r) => {
      if (dead) return;
      const s = r.ok ? r.data.season : null;
      if (s?.theme) document.body.dataset.season = s.id; else delete document.body.dataset.season;
    });
    return () => { dead = true; };
  }, [call, feat, locale]);
  return null;
}
