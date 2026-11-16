'use client';
// Étape N3 (15/11) — une seule bande de saison à la fois sur l'accueil : la saison en cours (Ramadan, Hajj…) si elle existe,
// sinon la carte du vendredi. Chaque bande garde ses propres réglages (Admin → Saisons, Admin → Vendredi).
import { useState } from 'react';
import SeasonBand from './SeasonBand';
import FridayBand from './FridayBand';

export default function SeasonBands() {
  const [season, setSeason] = useState(undefined); // undefined = on vérifie ; true / false = saison en cours ou non
  return (
    <>
      <SeasonBand onState={setSeason} />
      {season === false && <FridayBand />}
    </>
  );
}
