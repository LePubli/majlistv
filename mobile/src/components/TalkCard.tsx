// Vignette d'une conférence : miniature 16/9, durée, barre de progression, titre, intervenant.
import React from 'react';
import { Pressable, View } from 'react-native';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { router } from 'expo-router';
import type { Card } from '@/lib/types';
import { colors, gradientFor, radius } from '@/lib/theme';
import { formatDuration, percent } from '@/lib/format';
import { Txt } from './ui';

export function Poster({ talk, radiusPx = radius.card, children }: { talk: Pick<Card, 'id' | 'posterUrl'>; radiusPx?: number; children?: React.ReactNode }) {
  const g = gradientFor(talk.id);
  return (
    <View style={{ width: '100%', aspectRatio: 16 / 9, borderRadius: radiusPx, overflow: 'hidden', backgroundColor: colors.panel }}>
      <LinearGradient colors={g} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={{ position: 'absolute', inset: 0 }} />
      {talk.posterUrl ? <Image source={{ uri: talk.posterUrl }} style={{ position: 'absolute', inset: 0 }} contentFit="cover" transition={150} /> : null}
      {children}
    </View>
  );
}

export function openTalk(id: string) {
  router.push({ pathname: '/talk/[id]', params: { id } });
}

export function TalkCard({ talk, width }: { talk: Card; width?: number }) {
  const dur = formatDuration(talk.durationSeconds);
  const pct = talk.positionMs ? percent(talk.positionMs, talk.durationMs || (talk.durationSeconds ?? 0) * 1000) : 0;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${talk.title}, ${talk.speaker}`}
      onPress={() => openTalk(talk.id)}
      style={({ pressed }) => ({ width: width ?? '100%', gap: 8, opacity: pressed ? 0.85 : 1 })}
    >
      <Poster talk={talk}>
        {dur ? (
          <View style={{ position: 'absolute', end: 8, bottom: pct ? 10 : 8, paddingHorizontal: 7, paddingVertical: 2, borderRadius: 6, backgroundColor: 'rgba(11,9,6,0.75)' }}>
            <Txt weight="semibold" size={12}>{dur}</Txt>
          </View>
        ) : null}
        {pct > 0 ? (
          <View style={{ position: 'absolute', start: 0, end: 0, bottom: 0, height: 4, backgroundColor: 'rgba(243,235,221,0.25)' }}>
            <View style={{ width: `${pct}%`, height: 4, backgroundColor: colors.gold }} />
          </View>
        ) : null}
      </Poster>
      <View style={{ gap: 2 }}>
        <Txt weight="bold" size={14} numberOfLines={2}>{talk.title}</Txt>
        <Txt size={12} color={colors.muted} numberOfLines={1}>{talk.speaker}</Txt>
      </View>
    </Pressable>
  );
}
