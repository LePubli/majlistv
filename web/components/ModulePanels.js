'use client';
// Panneaux fournis par les modules sur la page d'une conférence (ex. « Langue de l'audio » du module Doublage).
// Chaque panneau est chargé à la demande ; sans module, rien n'est affiché et la page fonctionne comme avant.
import { useEffect, useState } from 'react';
import { MODULE_TALK_PANELS } from '../lib/modules';

export default function ModulePanels(props) {
  const [list, setList] = useState([]);
  useEffect(() => {
    let alive = true;
    Promise.all(MODULE_TALK_PANELS.map((p) => p.load().then((m) => ({ id: p.module, C: m.default })).catch(() => null)))
      .then((r) => { if (alive) setList(r.filter(Boolean)); });
    return () => { alive = false; };
  }, []);
  return list.map(({ id, C }) => <C key={id} {...props} />);
}
