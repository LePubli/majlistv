// « En écoute » (Audyn) sur la télé, couleurs du site.
import React from 'react';
import { TvNowPlaying, siteTvPalette } from '@/components/tv/TvNowPlaying';

export default function TvAudynPlayer() {
  return <TvNowPlaying pal={siteTvPalette()} />;
}
