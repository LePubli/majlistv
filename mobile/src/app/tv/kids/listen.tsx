// « En écoute » d'une histoire du soir sur la télé, aux couleurs Kids.
import React from 'react';
import { KC } from '@/lib/kids';
import { TvNowPlaying } from '@/components/tv/TvNowPlaying';

export default function TvKidsListen() {
  return <TvNowPlaying pal={{ bg: KC.bg, panel: KC.surface, track: KC.surface2, accent: KC.accent, onAccent: KC.onAccent, text2: KC.text2, note: KC.accent }} />;
}
