// Carte d'une collection sur la télé : image 16:9 arrondie avec dégradé, type en or, titre et nombre de vidéos dessous.
// Même comportement de focus que les vignettes vidéo (cadre blanc, léger agrandissement).
import React from 'react';
import { FlatList, View } from 'react-native';
import { router } from 'expo-router';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { useSession } from '@/lib/session';
import type { CollectionItem } from '@/lib/types';
import { tvc, tvGradient, useTv } from '@/lib/tvTheme';
import { Txt } from '@/components/ui';
import { kindLabel, videosLabel } from '@/components/CollectionCard';
import { Focusable } from './Focusable';

export function TvCollectionCard({ c, first, width, onFocusItem }: { c: CollectionItem; first?: boolean; width: number; onFocusItem?: (c: CollectionItem) => void }) {
  const { t } = useSession();
  const { u } = useTv();
  const fill = { position: 'absolute', top: 0, bottom: 0, left: 0, right: 0 } as const;
  return (
    <Focusable first={first} ring={false} scale={1.08} radius={u(16)} accessibilityRole="button" accessibilityLabel={`${c.title}, ${videosLabel(c.talks, t)}`}
      onFocus={() => onFocusItem?.(c)} onPress={() => router.push({ pathname: '/tv/collections/[id]', params: { id: c.id } })} style={{ width }}>
      {(on) => (
        <View style={{ gap: u(10) }}>
          <View style={{ width: '100%', aspectRatio: 16 / 9, borderRadius: u(16), overflow: 'hidden', backgroundColor: tvc.panel, borderWidth: on ? u(5) : 0, borderColor: tvc.text }}>
            <LinearGradient colors={tvGradient(c.id)} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={fill} />
            {c.posterUrl ? <Image source={{ uri: c.posterUrl }} style={fill} contentFit="cover" transition={150} /> : null}
            <LinearGradient colors={['rgba(0,0,0,0)', 'rgba(0,0,0,0.78)']} locations={[0.35, 1]} style={fill} />
            <View style={{ flex: 1, justifyContent: 'flex-end', padding: u(16), gap: u(4) }}>
              {c.kind ? <Txt weight="bold" size={u(16)} color={tvc.accentLight} style={{ letterSpacing: u(2), textTransform: 'uppercase' }}>{kindLabel(c.kind, t)}</Txt> : null}
              <Txt weight="extrabold" size={u(26)} numberOfLines={2} style={{ lineHeight: u(30) }}>{c.title}</Txt>
            </View>
          </View>
          <Txt size={u(19)} color={on ? tvc.text : tvc.muted} numberOfLines={1}>{videosLabel(c.talks, t)}</Txt>
        </View>
      )}
    </Focusable>
  );
}

/** Rangée horizontale de collections avec son titre (accueil, liste). */
export function TvCollectionRow({ title, items, first, cardW, padStart, onFocusItem }: { title: string; items: CollectionItem[]; first?: boolean; cardW: number; padStart: number; onFocusItem?: (c: CollectionItem) => void }) {
  const { u } = useTv();
  if (!items.length) return null;
  return (
    <View style={{ gap: u(14) }}>
      <Txt weight="extrabold" size={u(30)} style={{ paddingHorizontal: padStart }}>{title}</Txt>
      <FlatList horizontal data={items} keyExtractor={(x) => x.id} showsHorizontalScrollIndicator={false}
        contentContainerStyle={{ paddingStart: padStart, paddingEnd: u(96), gap: u(28), paddingVertical: u(14) }}
        renderItem={({ item, index }) => <TvCollectionCard c={item} width={cardW} first={first && index === 0} onFocusItem={onFocusItem} />} />
    </View>
  );
}
