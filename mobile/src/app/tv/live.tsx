// Chaînes en direct sur la télé (La Mecque, Médine…) : une grande vignette par chaîne ; OK ouvre le direct en plein écran.
import React from 'react';
import { ScrollView, View, useWindowDimensions } from 'react-native';
import { router } from 'expo-router';
import { Image } from 'expo-image';
import { useSession } from '@/lib/session';
import { useAsync } from '@/lib/useAsync';
import { tvCardWidth, tvMenuWidth } from '@/lib/tv';
import type { LiveChannel } from '@/components/LiveChannels';
import { colors } from '@/lib/theme';
import { Loading, Txt } from '@/components/ui';
import { TvShell } from '@/components/tv/TvShell';
import { Focusable } from '@/components/tv/Focusable';

export default function TvLive() {
  const { api, t, feat } = useSession();
  const { width } = useWindowDimensions();
  const w = tvCardWidth(width - tvMenuWidth(width), 2.2);
  const d = useAsync(async () => (feat('livetv') ? (await api.get<{ channels: LiveChannel[] }>('/live').catch(() => ({ channels: [] }))).channels : []), []);
  const list = (d.data ?? []).filter((c) => c.video && /^[\w-]{11}$/.test(c.video.ref));
  return (
    <TvShell>
      {d.loading && !d.data ? <Loading /> : (
        <ScrollView contentContainerStyle={{ padding: 32, gap: 18 }}>
          <Txt weight="extrabold" size={24}>{t('lv.title')}</Txt>
          {list.length === 0 ? <Txt color={colors.muted}>{t('tv.noLive')}</Txt> : (
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 20 }}>
              {list.map((c, i) => (
                <Focusable key={c.id} first={i === 0} accessibilityRole="button" accessibilityLabel={c.name} style={{ width: w, padding: 4 }}
                  onPress={() => router.push({ pathname: '/tv/embed', params: { kind: 'youtube', id: c.video!.ref, title: c.name, live: '1' } })}>
                  <View style={{ width: '100%', aspectRatio: 16 / 9, borderRadius: 12, overflow: 'hidden', backgroundColor: '#000' }}>
                    <Image source={{ uri: `https://i.ytimg.com/vi/${c.video!.ref}/hqdefault.jpg` }} style={{ position: 'absolute', inset: 0 }} contentFit="cover" />
                    {c.live ? (
                      <View style={{ position: 'absolute', top: 10, left: 10, paddingVertical: 4, paddingHorizontal: 10, borderRadius: 999, backgroundColor: '#E5484D' }}>
                        <Txt weight="extrabold" size={13} color="#fff">● {t('lv.live')}</Txt>
                      </View>
                    ) : null}
                  </View>
                  <Txt weight="extrabold" size={18} style={{ marginTop: 8 }}>{c.name}</Txt>
                  {c.title ? <Txt size={13} color={colors.text2} numberOfLines={1}>{c.title}</Txt> : null}
                </Focusable>
              ))}
            </View>
          )}
        </ScrollView>
      )}
    </TvShell>
  );
}
