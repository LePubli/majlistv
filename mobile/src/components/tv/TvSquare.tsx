// Vignette carrée d'un livre audio / podcast (Audyn) sur la télé.
import React from 'react';
import { View } from 'react-native';
import { router } from 'expo-router';
import { Image } from 'expo-image';
import type { AudynItem } from '@/lib/audyn';
import { colors } from '@/lib/theme';
import { Txt } from '@/components/ui';
import { Focusable } from './Focusable';

export function TvSquare({ item, width, first }: { item: AudynItem; width: number; first?: boolean }) {
  return (
    <Focusable first={first} accessibilityRole="button" accessibilityLabel={item.title} style={{ width, padding: 4 }}
      onPress={() => router.push({ pathname: '/tv/audyn/[id]', params: { id: item.id } })}>
      <View style={{ width: '100%', aspectRatio: 1, borderRadius: 12, overflow: 'hidden', backgroundColor: colors.panel, alignItems: 'center', justifyContent: 'center' }}>
        {item.coverUrl ? <Image source={{ uri: item.coverUrl }} style={{ position: 'absolute', inset: 0 }} contentFit="cover" /> : <Txt size={40}>🎧</Txt>}
      </View>
      <Txt weight="bold" size={14} numberOfLines={2} style={{ marginTop: 6 }}>{item.title}</Txt>
      {item.author || item.narrator ? <Txt size={12} color={colors.text2} numberOfLines={1}>{item.author || item.narrator}</Txt> : null}
    </Focusable>
  );
}
