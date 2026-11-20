// Chaînes en direct sur la télé (refonte TV-R) : deux grandes vignettes par ligne, pastille « EN DIRECT », nom de la chaîne sur
// l'image ; OK ouvre le direct en plein écran.
import React from 'react';
import { ScrollView, View } from 'react-native';
import { router } from 'expo-router';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { useSession } from '@/lib/session';
import { useAsync } from '@/lib/useAsync';
import type { LiveChannel } from '@/components/LiveChannels';
import { tvc, tvVeil, useTv } from '@/lib/tvTheme';
import { Loading, Txt } from '@/components/ui';
import { TvShell } from '@/components/tv/TvShell';
import { Focusable } from '@/components/tv/Focusable';

export default function TvLive() {
  const { api, t, feat } = useSession();
  const { u, W, rail } = useTv();
  const d = useAsync(async () => (feat('livetv') ? (await api.get<{ channels: LiveChannel[] }>('/live').catch(() => ({ channels: [] }))).channels : []), []);
  const list = (d.data ?? []).filter((c) => c.video && /^[\w-]{11}$/.test(c.video.ref));
  const pad = u(88);
  const gap = u(40);
  const w = Math.floor((W - rail - pad - u(96) - gap) / 2);
  return (
    <TvShell>
      {d.loading && !d.data ? <Loading /> : (
        <ScrollView contentContainerStyle={{ paddingTop: u(54), paddingBottom: u(80), paddingStart: pad, paddingEnd: u(96), gap: u(44) }}>
          <View style={{ gap: u(14) }}>
            <Txt weight="extrabold" size={u(52)}>{t('lv.title')}</Txt>
            <Txt size={u(24)} color={tvc.text2}>{t('tv.liveIntro')}</Txt>
          </View>
          {list.length === 0 ? <Txt size={u(26)} color={tvc.muted}>{t('tv.noLive')}</Txt> : (
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap }}>
              {list.map((c, i) => (
                <Focusable key={c.id} first={i === 0} ring={false} scale={1.03} radius={u(22)} accessibilityRole="button" accessibilityLabel={c.name} style={{ width: w }}
                  onPress={() => router.push({ pathname: '/tv/embed', params: { kind: 'youtube', id: c.video!.ref, title: c.name, live: c.live ? '1' : '0' } })}>
                  {(on) => (
                    <View style={{ gap: u(16) }}>
                      <View style={{ width: '100%', aspectRatio: 16 / 9, borderRadius: u(22), overflow: 'hidden', backgroundColor: '#000', borderWidth: on ? u(6) : 0, borderColor: tvc.text }}>
                        <Image source={{ uri: `https://i.ytimg.com/vi/${c.video!.ref}/hqdefault.jpg` }} style={{ position: 'absolute', top: 0, bottom: 0, left: 0, right: 0 }} contentFit="cover" />
                        <LinearGradient colors={[tvVeil(0), tvVeil(0.85)]} locations={[0.45, 1]} style={{ position: 'absolute', top: 0, bottom: 0, left: 0, right: 0 }} />
                        {c.live ? (
                          <View style={{ position: 'absolute', top: u(22), start: u(22), flexDirection: 'row', alignItems: 'center', gap: u(10), paddingVertical: u(9), paddingHorizontal: u(16), borderRadius: u(10), backgroundColor: tvc.live }}>
                            <View style={{ width: u(10), height: u(10), borderRadius: u(5), backgroundColor: '#fff' }} />
                            <Txt weight="extrabold" size={u(20)} color="#fff" style={{ letterSpacing: u(1.6), textTransform: 'uppercase' }}>{t('lv.live')}</Txt>
                          </View>
                        ) : null}
                        <Txt weight="extrabold" size={u(40)} numberOfLines={1} style={{ position: 'absolute', start: u(26), end: u(26), bottom: u(22) }}>{c.name}</Txt>
                      </View>
                      {c.title ? <Txt size={u(22)} color={tvc.muted} numberOfLines={1}>{c.title}</Txt> : null}
                    </View>
                  )}
                </Focusable>
              ))}
            </View>
          )}
        </ScrollView>
      )}
    </TvShell>
  );
}
