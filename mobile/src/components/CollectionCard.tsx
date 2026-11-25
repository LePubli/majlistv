// Carte d'une collection (rangée de l'accueil, liste des collections) : affiche verticale, type en or, titre et nombre de vidéos.
import React from 'react';
import { Pressable, View } from 'react-native';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { router } from 'expo-router';
import type { CollectionItem } from '@/lib/types';
import { colors, gradientFor, radius } from '@/lib/theme';
import { useSession } from '@/lib/session';
import type { Tr } from '@/lib/media';
import { Txt } from './ui';

export const openCollection = (id: string) => router.push({ pathname: '/collections/[id]', params: { id } });

/** « 4 vidéos » / « 1 vidéo » (mêmes mots que le site). */
export function videosLabel(n: number, t: Tr): string {
  return `${n} ${n === 1 ? t('pmColVideo') : t('pmColVideos')}`;
}

export function CollectionCard({ c, width }: { c: CollectionItem; width: number }) {
  const { t } = useSession();
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={`${c.title}, ${videosLabel(c.talks, t)}`} onPress={() => openCollection(c.id)}
      style={({ pressed }) => ({ width, aspectRatio: 4 / 5, borderRadius: radius.panel, overflow: 'hidden', backgroundColor: colors.panel, borderWidth: 1, borderColor: colors.borderSoft, opacity: pressed ? 0.88 : 1 })}>
      <LinearGradient colors={gradientFor(c.id)} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={{ position: 'absolute', top: 0, bottom: 0, start: 0, end: 0 }} />
      {c.posterUrl ? <Image source={{ uri: c.posterUrl }} style={{ position: 'absolute', top: 0, bottom: 0, start: 0, end: 0 }} contentFit="cover" transition={150} /> : null}
      <LinearGradient colors={['rgba(0,0,0,0)', 'rgba(0,0,0,0.55)', 'rgba(0,0,0,0.92)']} locations={[0.25, 0.6, 1]} style={{ position: 'absolute', top: 0, bottom: 0, start: 0, end: 0 }} />
      <View style={{ flex: 1, justifyContent: 'flex-end', padding: 14, gap: 4 }}>
        {c.kind ? <Txt weight="bold" size={10} color={colors.goldLight} style={{ letterSpacing: 1.6, textTransform: 'uppercase' }}>{kindLabel(c.kind, t)}</Txt> : null}
        <Txt weight="extrabold" size={17} numberOfLines={3} style={{ lineHeight: 21 }}>{c.title}</Txt>
        <Txt size={12} color={colors.muted}>{videosLabel(c.talks, t)}</Txt>
      </View>
    </Pressable>
  );
}

/** Libellé du type (textes du site : « Cycle », « Série d'un intervenant », « Thème du moment »). */
export function kindLabel(kind: string, t: Tr): string {
  return kind === 'cycle' ? t('colKind_cycle') : kind === 'speaker' ? t('colKind_speaker') : kind === 'theme' ? t('colKind_theme') : '';
}

/** Titre pluriel d'une rangée de collections d'un même type. */
export function kindPlural(kind: string, t: Tr): string {
  return kind === 'cycle' ? t('pmColsPl_cycle') : kind === 'speaker' ? t('pmColsPl_speaker') : t('pmColsPl_theme');
}
