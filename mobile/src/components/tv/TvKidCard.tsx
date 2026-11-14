// Vignette d'une vidéo pour l'enfant sur la télé : image, durée, « Vu ✓ », étoiles, barre de reprise ; contour or au focus.
import React from 'react';
import { View } from 'react-native';
import { router } from 'expo-router';
import { useSession } from '@/lib/session';
import { KC } from '@/lib/kids';
import { formatDuration } from '@/lib/format';
import type { KidCard } from '@/lib/types';
import { Txt } from '@/components/ui';
import { Poster } from '@/components/TalkCard';
import { starsText } from '@/components/kids/KidUi';
import { Focusable } from './Focusable';

export function TvKidCard({ x, width, first }: { x: KidCard; width: number; first?: boolean }) {
  const { t } = useSession();
  const pct = x.durationSeconds && x.positionMs > 0 && !x.completed ? Math.min(1, x.positionMs / 1000 / x.durationSeconds) : 0;
  const stars = starsText(x.stars);
  return (
    <Focusable first={first} radius={20} accessibilityRole="button" accessibilityLabel={x.title} style={{ width, padding: 4 }}
      onPress={() => router.push({ pathname: '/tv/kids/watch/[id]', params: { id: x.id } })}>
      <Poster talk={{ id: x.id, posterUrl: x.posterUrl, source: x.source as 'upload' | 'youtube' | 'vimeo' | 'dailymotion' | 'archive', video_ref: undefined }} radiusPx={16}>
        {x.completed ? (
          <View style={{ position: 'absolute', start: 8, top: 8, paddingHorizontal: 10, paddingVertical: 2, borderRadius: 999, backgroundColor: KC.ok }}>
            <Txt weight="extrabold" size={12} color="#06210F">{t('kdSeen')}</Txt>
          </View>
        ) : null}
        {x.durationSeconds ? (
          <View style={{ position: 'absolute', end: 8, bottom: pct ? 10 : 8, paddingHorizontal: 8, paddingVertical: 2, borderRadius: 8, backgroundColor: 'rgba(7,11,39,0.8)' }}>
            <Txt weight="bold" size={12} color={KC.text}>{formatDuration(x.durationSeconds)}</Txt>
          </View>
        ) : null}
        {pct > 0 ? (
          <View style={{ position: 'absolute', start: 0, end: 0, bottom: 0, height: 5, backgroundColor: 'rgba(255,255,255,0.25)' }}>
            <View style={{ width: `${Math.round(pct * 100)}%`, height: 5, backgroundColor: KC.accent }} />
          </View>
        ) : null}
      </Poster>
      <Txt weight="extrabold" size={15} numberOfLines={2} color={KC.text} style={{ marginTop: 6 }}>{x.title}</Txt>
      {stars ? <Txt size={13} color={KC.accent}>{stars}</Txt> : null}
    </Focusable>
  );
}
