// Vignette d'une vidéo sur la télé : image 16:9, titre, intervenant ; barre de progression pour « Continuer ».
import React from 'react';
import { View } from 'react-native';
import { router } from 'expo-router';
import type { Card } from '@/lib/types';
import { colors } from '@/lib/theme';
import { Txt } from '@/components/ui';
import { Poster } from '@/components/TalkCard';
import { Focusable } from './Focusable';

export const TV_CARD_W = 280;

export function TvCard({ talk, first }: { talk: Card; first?: boolean }) {
  const pct = talk.positionMs && talk.durationMs ? Math.min(1, talk.positionMs / talk.durationMs) : 0;
  return (
    <Focusable first={first} accessibilityRole="button" accessibilityLabel={talk.title}
      onPress={() => router.push({ pathname: '/tv/talk/[id]', params: { id: talk.id } })} style={{ width: TV_CARD_W, padding: 4 }}>
      <Poster talk={talk}>
        {pct > 0 ? <View style={{ position: 'absolute', left: 0, right: 0, bottom: 0, height: 5, backgroundColor: 'rgba(0,0,0,0.5)' }}><View style={{ width: `${pct * 100}%`, height: 5, backgroundColor: colors.gold }} /></View> : null}
      </Poster>
      <Txt weight="bold" size={16} numberOfLines={2} style={{ marginTop: 8 }}>{talk.title}</Txt>
      {talk.speaker ? <Txt size={13} color={colors.text2} numberOfLines={1}>{talk.speaker}</Txt> : null}
    </Focusable>
  );
}
