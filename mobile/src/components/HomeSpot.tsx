// « Sélection » en grand cadre sur l'accueil (comme le site) : image de la collection en fond, texte, lien, deux affiches.
import React from 'react';
import { Pressable, View, useWindowDimensions } from 'react-native';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { useSession } from '@/lib/session';
import type { Card } from '@/lib/types';
import { colors, radius, veil } from '@/lib/theme';
import { thumbOf } from '@/lib/media';
import { Txt } from './ui';
import { GUTTER } from './Rail';
import { TalkCard } from './TalkCard';
import { openCollection } from './CollectionCard';

export type HomeCollection = { id: string; title: string; description?: string; kind?: string; mode?: string; talks: Card[] };

/** Les deux premières collections de l'accueil qui ont au moins 2 vidéos deviennent des sélections ; les autres des rangées. */
export function splitHomeCollections(cols: HomeCollection[]) {
  const spots = cols.filter((c) => (c.talks || []).length >= 2).slice(0, 2);
  return { spots, rest: cols.filter((c) => !spots.includes(c)) };
}

export function HomeSpot({ c }: { c: HomeCollection }) {
  const { t, config } = useSession();
  const { width } = useWindowDimensions();
  const uri = thumbOf(c.talks[0]);
  const cardW = Math.floor((width - GUTTER * 2 - 32 - 12) / 2);
  return (
    <View style={{ marginHorizontal: GUTTER, borderRadius: radius.panel, overflow: 'hidden', backgroundColor: colors.panel, borderWidth: 1, borderColor: colors.border }}>
      {uri ? <Image source={{ uri }} blurRadius={30} contentFit="cover" style={{ position: 'absolute', top: 0, bottom: 0, left: 0, right: 0, opacity: 0.55 }} /> : null}
      <LinearGradient colors={[veil(0.35), veil(0.85)]} style={{ position: 'absolute', top: 0, bottom: 0, left: 0, right: 0 }} />
      <View style={{ padding: 16, gap: 10 }}>
        <Txt weight="bold" size={11} color={colors.goldLight} style={{ letterSpacing: 1.4, textTransform: 'uppercase' }}>{t('pmSelection', { name: config?.appName ?? 'Mejliss TV' })}</Txt>
        <Txt weight="extrabold" size={22} color="#fff" style={{ lineHeight: 28 }} accessibilityRole="header">{c.title}</Txt>
        {c.description ? <Txt size={14} color={colors.text2} numberOfLines={3}>{c.description}</Txt> : null}
        {c.mode !== 'personal' ? (
          <Pressable accessibilityRole="link" onPress={() => openCollection(c.id)} hitSlop={8}>
            <Txt weight="bold" size={14} color={colors.goldLight}>{t('pmExploreCollection')} ↗</Txt>
          </Pressable>
        ) : null}
        <View style={{ flexDirection: 'row', gap: 12, marginTop: 4 }}>
          {c.talks.slice(0, 2).map((x) => <TalkCard key={x.id} talk={x} width={cardW} />)}
        </View>
      </View>
    </View>
  );
}
