// Bandeaux de l'accueil : « Explorer par format » et bande « Espace Kids ».
import React from 'react';
import { Pressable, View } from 'react-native';
import { Image } from 'expo-image';
import { router } from 'expo-router';
import { useSession } from '@/lib/session';
import { useAsync } from '@/lib/useAsync';
import type { FormatItem, KidsHome } from '@/lib/types';
import { colors, radius } from '@/lib/theme';
import { minutesLabel, thumbOf } from '@/lib/media';
import { Button, Txt } from './ui';
import { GUTTER } from './Rail';

export const formatName = (f: FormatItem, locale: string) => (locale === 'en' ? f.nameEn : locale === 'ar' ? f.nameAr : f.nameFr) || f.nameFr;

export function FormatTiles() {
  const { api, t, locale } = useSession();
  const list = useAsync(async () => { const r = await api.get<FormatItem[]>('/formats', { used: 1 }, false).catch(() => []); return Array.isArray(r) ? r : []; }, []);
  const items = list.data ?? [];
  if (items.length < 2) return null; // un seul format = rien à explorer
  return (
    <View style={{ gap: 10, paddingHorizontal: GUTTER }}>
      <Txt weight="extrabold" size={18} accessibilityRole="header">{t('fmExplore')}</Txt>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}>
        {items.map((f) => (
          <Pressable key={f.id} accessibilityRole="link" onPress={() => router.navigate({ pathname: '/talks', params: { format: f.slug } })}
            style={({ pressed }) => ({ flexGrow: 1, minWidth: '45%', padding: 14, borderRadius: radius.card, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.panel, gap: 2, opacity: pressed ? 0.85 : 1 })}>
            <Txt weight="bold" size={15}>{formatName(f, locale)}</Txt>
            <Txt size={12} color={colors.muted}>{t('fmCount', { n: f.count })}</Txt>
          </Pressable>
        ))}
      </View>
    </View>
  );
}

const KID_COLORS = ['#FF6B6B', '#FFC83D', '#4ECDC4', '#7C9CFF'];

/** « Kids » en lettres de couleur, façon autocollant. */
export function KidsWord({ size = 24 }: { size?: number }) {
  return (
    <View accessibilityLabel="Kids" style={{ flexDirection: 'row' }}>
      {['K', 'i', 'd', 's'].map((c, i) => <Txt key={i} weight="extrabold" size={size} color={KID_COLORS[i]} style={{ lineHeight: size * 1.2 }}>{c}</Txt>)}
    </View>
  );
}

export function KidsBand({ data }: { data: KidsHome }) {
  const { t, config } = useSession();
  if (!data?.enabled || !data.talks?.length) return null;
  const open = () => { router.push('/kids'); };
  return (
    <View style={{ marginHorizontal: GUTTER, padding: 16, borderRadius: radius.panel, backgroundColor: '#0A1038', borderWidth: 1, borderColor: '#34459F', gap: 12 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
        <Image source={require('../../assets/brand/emblem.png')} style={{ width: 40, height: 43 }} contentFit="contain" />
        <View style={{ flex: 1 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            <Txt weight="extrabold" size={17}>{config?.appName ?? 'Mejliss TV'}</Txt><KidsWord />
          </View>
          <Txt size={12} color="#AEB6EE">{t('kdBandSub')}</Txt>
        </View>
      </View>
      <View style={{ flexDirection: 'row', gap: 10 }}>
        {data.talks.slice(0, 3).map((x) => {
          const uri = thumbOf(x);
          return (
            <Pressable key={x.id} accessibilityRole="link" accessibilityLabel={x.title} onPress={open} style={{ flex: 1, gap: 4 }}>
              <View style={{ aspectRatio: 16 / 9, borderRadius: 10, overflow: 'hidden', backgroundColor: '#16215F' }}>
                {uri ? <Image source={{ uri }} style={{ position: 'absolute', inset: 0 }} contentFit="cover" /> : null}
              </View>
              <Txt size={11} weight="medium" numberOfLines={2}>{x.title}</Txt>
              <Txt size={10} color="#AEB6EE">{minutesLabel(x.durationSeconds, t)}</Txt>
            </Pressable>
          );
        })}
      </View>
      <Button label={t('kdBandCta')} onPress={open} style={{ backgroundColor: '#FFC83D' }} />
    </View>
  );
}
