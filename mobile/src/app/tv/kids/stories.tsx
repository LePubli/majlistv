// Histoires du soir de l'enfant sur la télé (illimitées, hors limite quotidienne).
import React from 'react';
import { ScrollView, View, useWindowDimensions } from 'react-native';
import { Redirect, router } from 'expo-router';
import { Image } from 'expo-image';
import { useSession } from '@/lib/session';
import { useKid } from '@/lib/kidSession';
import { useAsync } from '@/lib/useAsync';
import { fmtLong, type AudynItem } from '@/lib/audyn';
import { KC } from '@/lib/kids';
import { tvCardWidth } from '@/lib/tv';
import { Txt } from '@/components/ui';
import { Focusable } from '@/components/tv/Focusable';

export default function TvKidsStories() {
  const { t } = useSession();
  const { kid, kidApi, epoch } = useKid();
  const { width } = useWindowDimensions();
  const w = tvCardWidth(width, 5);
  const d = useAsync(() => kidApi.get<{ items: AudynItem[] }>('/kids/stories'), [kid?.profile.id, epoch]); // eslint-disable-line react-hooks/exhaustive-deps
  if (!kid) return <Redirect href="/tv/kids" />;
  const items = d.data?.items ?? [];
  return (
    <ScrollView style={{ backgroundColor: KC.bg }} contentContainerStyle={{ padding: 32, gap: 18 }}>
      <Txt weight="extrabold" size={26} color={KC.text}>🌙 {t('aud.kTitle')}</Txt>
      <Txt size={16} color={KC.text2}>{t('aud.kIntro')}</Txt>
      {d.loading && !d.data ? <Txt color={KC.text2}>…</Txt> : null}
      {d.error && !d.data ? <Txt color={KC.text2}>{t('common.error')}</Txt> : null}
      {d.data && items.length === 0 ? <Txt color={KC.text2}>{t('aud.kEmpty')}</Txt> : null}
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 16 }}>
        {items.map((it, i) => (
          <Focusable key={it.id} first={i === 0} radius={18} accessibilityRole="button" accessibilityLabel={it.title} style={{ width: w, padding: 4 }}
            onPress={() => router.push({ pathname: '/tv/kids/story/[id]', params: { id: it.id } })}>
            <View style={{ width: '100%', aspectRatio: 1, borderRadius: 14, overflow: 'hidden', backgroundColor: KC.surface, alignItems: 'center', justifyContent: 'center' }}>
              {it.coverUrl ? <Image source={{ uri: it.coverUrl }} style={{ position: 'absolute', inset: 0 }} contentFit="cover" /> : <Txt size={40}>🌙</Txt>}
            </View>
            <Txt weight="extrabold" size={15} color={KC.text} numberOfLines={2} style={{ marginTop: 6 }}>{it.title}</Txt>
            <Txt size={12} color={KC.muted}>{fmtLong(it.durationSeconds)}</Txt>
          </Focusable>
        ))}
      </View>
    </ScrollView>
  );
}
