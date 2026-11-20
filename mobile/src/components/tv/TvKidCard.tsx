// Vignette d'une vidéo de l'espace Kids sur la télé (refonte TV-R) : image très arrondie, cadre or vif quand on l'atteint,
// « Vu », durée, progression, étoiles du quiz.
import React from 'react';
import { View } from 'react-native';
import { router } from 'expo-router';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { useSession } from '@/lib/session';
import { KC } from '@/lib/kids';
import { formatDuration } from '@/lib/format';
import { thumbOf } from '@/lib/media';
import { tvGradient, useTv } from '@/lib/tvTheme';
import type { KidCard } from '@/lib/types';
import { Txt } from '@/components/ui';
import { starsText } from '@/components/kids/KidUi';
import type { TvBookPalette } from './TvBookView';
import { Focusable } from './Focusable';

/** Couleurs Kids des fiches d'histoires (TvBookView). */
export const TV_KIDS_BOOK: TvBookPalette = { bg: KC.bg, panel: KC.surface, accent: KC.accent, onAccent: KC.onAccent, text2: KC.text2, muted: KC.muted, mark: KC.accent };

export function TvKidCard({ x, width, first }: { x: KidCard; width: number; first?: boolean }) {
  const { t } = useSession();
  const { u } = useTv();
  const pct = x.durationSeconds && x.positionMs > 0 && !x.completed ? Math.min(1, x.positionMs / 1000 / x.durationSeconds) : 0;
  const stars = starsText(x.stars);
  const uri = thumbOf({ posterUrl: x.posterUrl, source: x.source as 'upload', video_ref: undefined });
  return (
    <Focusable first={first} ring={false} scale={1.07} radius={u(26)} accessibilityRole="button" accessibilityLabel={x.title} style={{ width }}
      onPress={() => router.push({ pathname: '/tv/kids/watch/[id]', params: { id: x.id } })}>
      {(on) => (
        <View style={{ gap: u(10) }}>
          <View style={{ width: '100%', aspectRatio: 16 / 9, borderRadius: u(26), overflow: 'hidden', backgroundColor: KC.surface, borderWidth: on ? u(6) : 0, borderColor: KC.accent }}>
            <LinearGradient colors={tvGradient(x.id)} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={{ position: 'absolute', top: 0, bottom: 0, left: 0, right: 0 }} />
            {uri ? <Image source={{ uri }} style={{ position: 'absolute', top: 0, bottom: 0, left: 0, right: 0 }} contentFit="cover" /> : null}
            {x.completed ? (
              <View style={{ position: 'absolute', start: u(12), top: u(12), paddingHorizontal: u(14), paddingVertical: u(4), borderRadius: 999, backgroundColor: KC.ok }}>
                <Txt weight="extrabold" size={u(18)} color="#06210F">{t('kdSeen')}</Txt>
              </View>
            ) : null}
            {x.durationSeconds ? (
              <View style={{ position: 'absolute', end: u(12), bottom: pct ? u(16) : u(12), paddingHorizontal: u(12), paddingVertical: u(4), borderRadius: 999, backgroundColor: 'rgba(7,11,39,0.85)' }}>
                <Txt weight="bold" size={u(18)} color={KC.text}>{formatDuration(x.durationSeconds)}</Txt>
              </View>
            ) : null}
            {pct > 0 ? (
              <View style={{ position: 'absolute', start: 0, end: 0, bottom: 0, height: u(7), backgroundColor: 'rgba(255,255,255,0.25)' }}>
                <View style={{ width: `${Math.round(pct * 100)}%`, height: u(7), backgroundColor: KC.accent }} />
              </View>
            ) : null}
          </View>
          <Txt weight="extrabold" size={u(26)} numberOfLines={2} color={KC.text} style={{ lineHeight: u(32) }}>{x.title}</Txt>
          {stars ? <Txt size={u(20)} color={KC.accent}>{stars}</Txt> : null}
        </View>
      )}
    </Focusable>
  );
}
