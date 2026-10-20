'use client';
// Espace Kids : rangée « Shorts » (extraits courts des conférences de son âge). Se tait s'il n'y en a pas ou si la fonction est coupée.
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useApp } from './Providers';
import { ShortsRail } from './ShortsRail';

export default function KidShorts() {
  const { t, call, feat } = useApp();
  const [list, setList] = useState(null);
  const on = feat('shorts');
  useEffect(() => {
    let dead = false;
    if (!on) return undefined;
    call('/shorts?limit=10').then((r) => { if (!dead) setList(r.ok && Array.isArray(r.data) ? r.data : []); });
    return () => { dead = true; };
  }, [call, on]);
  if (!on || !list?.length) return null;
  return (
    <section aria-labelledby="kd-shorts" className="kd-shorts">
      <h2 id="kd-shorts">🎬 {t('shrTitle')}</h2>
      <ShortsRail list={list} base="/kids/shorts" />
      <p><Link href="/kids/shorts" className="btn ghost">{t('shrAll')}</Link></p>
    </section>
  );
}
