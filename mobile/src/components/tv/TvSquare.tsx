// Couverture carrée d'un livre audio / podcast (Audyn) sur la télé (refonte TV-R) : la couverture choisie grandit avec un cadre blanc.
import React from 'react';
import { View } from 'react-native';
import { router } from 'expo-router';
import { Image } from 'expo-image';
import { Feather } from '@expo/vector-icons';
import type { AudynItem } from '@/lib/audyn';
import { tvc, useTv } from '@/lib/tvTheme';
import { Txt } from '@/components/ui';
import { Focusable } from './Focusable';

export function TvSquare({ item, width, first, href, accent = tvc.text, panel = tvc.panel, muted = tvc.muted }: {
  item: AudynItem; width: number; first?: boolean; href?: string; accent?: string; panel?: string; muted?: string;
}) {
  const { u } = useTv();
  return (
    <Focusable first={first} ring={false} scale={1.08} radius={u(18)} accessibilityRole="button" accessibilityLabel={item.title} style={{ width }}
      onPress={() => (href ? router.push(href as never) : router.push({ pathname: '/tv/audyn/[id]', params: { id: item.id } }))}>
      {(on) => (
        <View style={{ gap: u(10) }}>
          <View style={{ width: '100%', aspectRatio: 1, borderRadius: u(18), overflow: 'hidden', backgroundColor: panel, alignItems: 'center', justifyContent: 'center', borderWidth: on ? u(5) : 0, borderColor: accent }}>
            <Feather name="headphones" size={u(64)} color={muted} />
            {item.coverUrl ? <Image source={{ uri: item.coverUrl }} style={{ position: 'absolute', top: 0, bottom: 0, left: 0, right: 0 }} contentFit="cover" /> : null}
          </View>
          <Txt weight="bold" size={u(on ? 23 : 21)} color={on ? tvc.text : tvc.text2} numberOfLines={2} style={{ lineHeight: u(28) }}>{item.title}</Txt>
          {item.author || item.narrator ? <Txt size={u(19)} color={muted} numberOfLines={1}>{item.author || item.narrator}</Txt> : null}
        </View>
      )}
    </Focusable>
  );
}
