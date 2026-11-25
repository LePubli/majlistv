// Liste des collections, immersive : une plein écran (épinglée en priorité), pastilles pour changer de une,
// puis une rangée de grandes cartes par type (cycles, séries d'un intervenant, thèmes du moment).
import React, { useMemo, useState } from 'react';
import { Pressable, ScrollView, View, RefreshControl } from 'react-native';
import { Image } from 'expo-image';
import { useSession } from '@/lib/session';
import { useAsync } from '@/lib/useAsync';
import type { CollectionItem } from '@/lib/types';
import { colors, radius } from '@/lib/theme';
import { screenStyle, ErrorBox, Loading, Button, Txt } from '@/components/ui';
import { Rail } from '@/components/Rail';
import { ImmersiveHero } from '@/components/ImmersiveHero';
import { CollectionCard, kindLabel, kindPlural, openCollection, videosLabel } from '@/components/CollectionCard';

const KINDS = ['cycle', 'speaker', 'theme'];

export default function CollectionsScreen() {
  const { api, t, dirStyle } = useSession();
  const list = useAsync(() => api.get<CollectionItem[]>('/collections'), []);
  const [pick, setPick] = useState<string | null>(null);
  const items = list.data ?? [];
  const featured = useMemo(() => items.find((c) => c.id === pick) ?? items.find((c) => c.pinned && c.posterUrl) ?? items.find((c) => c.posterUrl) ?? items[0], [items, pick]);
  const strip = useMemo(() => [...items].sort((a, b) => Number(!!b.pinned) - Number(!!a.pinned)).slice(0, 6), [items]);
  if (list.loading && !list.data) return <View style={[screenStyle, dirStyle]}><Loading /></View>;
  if (list.error && !list.data) return <View style={[screenStyle, dirStyle]}><ErrorBox onRetry={list.reload} /></View>;
  if (!featured) return <View style={[screenStyle, dirStyle, { padding: 18 }]}><Txt color={colors.muted}>{t('colNone')}</Txt></View>;
  return (
    <View style={[screenStyle, dirStyle]}>
      <ScrollView contentContainerStyle={{ paddingBottom: 56, gap: 26 }} refreshControl={<RefreshControl refreshing={false} onRefresh={list.reload} tintColor={colors.gold} />}>
        <ImmersiveHero id={featured.id} uri={featured.posterUrl}>
          <Txt weight="bold" size={11} color={colors.goldLight} style={{ letterSpacing: 2, textTransform: 'uppercase' }}>{featured.pinned ? t('colPinned') : kindLabel(featured.kind ?? '', t)}</Txt>
          <Txt weight="extrabold" size={32} accessibilityRole="header" numberOfLines={3} style={{ lineHeight: 36 }}>{featured.title}</Txt>
          {featured.description ? <Txt color={colors.text2} numberOfLines={3} style={{ lineHeight: 22 }}>{featured.description}</Txt> : null}
          <Txt weight="bold" size={13}>{videosLabel(featured.talks, t)}</Txt>
          <Button label={`▶  ${t('pmColsOpen')}`} onPress={() => openCollection(featured.id)} />
          {strip.length > 1 ? (
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 10, paddingTop: 10 }}>
              {strip.map((c) => (
                <Pressable key={c.id} accessibilityRole="button" accessibilityLabel={c.title} accessibilityState={{ selected: c.id === featured.id }} onPress={() => setPick(c.id)}
                  style={{ width: 104, aspectRatio: 16 / 9, borderRadius: radius.thumb, overflow: 'hidden', backgroundColor: colors.panel, borderWidth: 2, borderColor: c.id === featured.id ? colors.goldLight : 'transparent', opacity: c.id === featured.id ? 1 : 0.7 }}>
                  {c.posterUrl ? <Image source={{ uri: c.posterUrl }} style={{ position: 'absolute', top: 0, bottom: 0, start: 0, end: 0 }} contentFit="cover" /> : null}
                  <View style={{ flex: 1, justifyContent: 'flex-end', padding: 5, backgroundColor: 'rgba(0,0,0,0.35)' }}><Txt weight="bold" size={9} numberOfLines={2}>{c.title}</Txt></View>
                </Pressable>
              ))}
            </ScrollView>
          ) : null}
        </ImmersiveHero>
        {KINDS.filter((k) => items.some((c) => c.kind === k)).map((k) => (
          <Rail key={k} title={kindPlural(k, t)} items={items.filter((c) => c.kind === k)} render={(c, w) => <CollectionCard c={c} width={Math.round(w * 1.05)} />} />
        ))}
      </ScrollView>
    </View>
  );
}
