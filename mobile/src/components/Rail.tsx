// Rangée horizontale de vignettes avec titre et « Tout voir ›» (comme les rangées du site), compatible droite-à-gauche.
import React from 'react';
import { FlatList, Pressable, View, useWindowDimensions } from 'react-native';
import { useSession } from '@/lib/session';
import { colors } from '@/lib/theme';
import { Txt } from './ui';

export const GUTTER = 16;

/** Largeur d'une vignette dans une rangée : un peu plus de deux sur un téléphone, davantage sur tablette. */
export function useCardWidth() {
  const { width } = useWindowDimensions();
  return Math.round(Math.min(300, Math.max(150, (width - GUTTER * 2) / (width >= 700 ? 3.2 : 1.7))));
}

export type RailSize = 'wide' | 'tall' | 'big';
/** Cycle des tailles de rangée, comme sur le site : large, affiche verticale, grande vignette. */
export const railSizeAt = (i: number): RailSize => (['wide', 'tall', 'big'] as const)[i % 3];

export function Rail<T extends { id: string }>({ title, badge, items, render, onSeeAll, seeAllLabel, size = 'wide' }: {
  title: React.ReactNode; badge?: string | null; items: T[]; render: (item: T, width: number, size: RailSize) => React.ReactElement;
  onSeeAll?: () => void; seeAllLabel?: string; size?: RailSize;
}) {
  const { t } = useSession();
  const base = useCardWidth();
  const w = size === 'tall' ? Math.round(base * 0.7) : size === 'big' ? Math.round(base * 1.45) : base;
  if (!items.length) return null;
  return (
    <View style={{ gap: 10 }}>
      <View style={{ flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', gap: 12, paddingHorizontal: GUTTER }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flexShrink: 1 }}>
          <Txt weight="extrabold" size={19} color="#fff" accessibilityRole="header" style={{ flexShrink: 1 }}>{title}</Txt>
          {badge ? <View style={{ paddingHorizontal: 8, paddingVertical: 1, borderRadius: 999, backgroundColor: colors.goldTint }}><Txt weight="bold" size={11} color={colors.goldLight}>{badge}</Txt></View> : null}
        </View>
        {onSeeAll ? (
          <Pressable accessibilityRole="link" onPress={onSeeAll} hitSlop={8}>
            <Txt weight="bold" size={13} color={colors.goldLight}>{seeAllLabel ?? t('rowSeeAll')} ›</Txt>
          </Pressable>
        ) : null}
      </View>
      <FlatList
        horizontal
        data={items}
        keyExtractor={(x) => x.id}
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={{ paddingHorizontal: GUTTER, gap: 12 }}
        renderItem={({ item }) => render(item, w, size)}
      />
    </View>
  );
}
