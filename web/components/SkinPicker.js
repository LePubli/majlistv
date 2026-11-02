'use client';
// Choix du thème visuel : « Classique » (noir et or) ou « Nuit et or » (bleu de nuit, arabesques).
// Mémorisé sur l'appareil (cookie « skin », lu par le serveur : pas de clignotement au chargement). Appliqué tout de suite
// (attribut data-skin de <html>). Masqué si l'administrateur a désactivé le choix (Admin → Paramètres → Général).
import { useEffect, useState } from 'react';
import { useApp } from './Providers';

const EVENT = 'skin-change';
const SKINS = [['classique', 'skClassic'], ['nuit', 'skNight']];

export default function SkinPicker({ className = '' }) {
  const { t, skin, skinChoice } = useApp();
  const [cur, setCur] = useState(skin);
  useEffect(() => {
    const sync = () => setCur(document.documentElement.dataset.skin || skin);
    sync();
    window.addEventListener(EVENT, sync);
    return () => window.removeEventListener(EVENT, sync);
  }, [skin]);
  if (!skinChoice) return null;
  const pick = (v) => {
    document.cookie = `skin=${v};path=/;max-age=31536000;samesite=lax`;
    document.documentElement.dataset.skin = v;
    window.dispatchEvent(new Event(EVENT));
  };
  return (
    <span className={`skin-pick ${className}`.trim()} role="group" aria-label={t('skLabel')}>
      <span className="small">{t('skLabel')}</span>
      {SKINS.map(([id, key]) => <button key={id} type="button" aria-pressed={cur === id} onClick={() => pick(id)}>{t(key)}</button>)}
    </span>
  );
}
