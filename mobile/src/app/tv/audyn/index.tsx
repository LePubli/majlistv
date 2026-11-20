// Audyn sur la télé (refonte TV-R) : titre, une rangée par catégorie (« Nouveautés » d'abord), couvertures carrées ; OK ouvre la fiche.
// Un livre est en écoute : pastille « En écoute » en bas (OK = écran des commandes).
import React from 'react';
import { FlatList, ScrollView, View } from 'react-native';
import { router } from 'expo-router';
import { Image } from 'expo-image';
import { Feather } from '@expo/vector-icons';
import { useSession } from '@/lib/session';
import { useAsync } from '@/lib/useAsync';
import { useAudyn } from '@/lib/audynPlayer';
import type { AudynList } from '@/lib/audyn';
import { audynRows } from '@/lib/tvRules';
import { tvc, useTv } from '@/lib/tvTheme';
import { Loading, Txt } from '@/components/ui';
import { TvShell } from '@/components/tv/TvShell';
import { TvSquare } from '@/components/tv/TvSquare';
import { Focusable } from '@/components/tv/Focusable';

export default function TvAudyn() {
  const { api, t } = useSession();
  const au = useAudyn();
  const { u } = useTv();
  const d = useAsync(() => api.get<AudynList>('/audyn'), []);
  const rows = audynRows(d.data, t('tv.audynNew'), t('tv.audynOther'));
  const pad = u(88);
  return (
    <TvShell>
      {d.loading && !d.data ? <Loading /> : (
        <ScrollView contentContainerStyle={{ paddingTop: u(54), paddingBottom: u(160), gap: u(40) }}>
          <View style={{ gap: u(14), paddingHorizontal: pad }}>
            <Txt weight="extrabold" size={u(52)}>Audyn</Txt>
            <Txt size={u(24)} color={tvc.text2}>{t('tv.audynIntro')}</Txt>
          </View>
          {rows.length === 0 ? <Txt size={u(26)} color={tvc.muted} style={{ paddingHorizontal: pad }}>{t('tv.empty')}</Txt> : rows.map((r, i) => (
            <View key={r.key} style={{ gap: u(14) }}>
              <Txt weight="extrabold" size={u(30)} style={{ paddingHorizontal: pad }}>{r.title}</Txt>
              <FlatList horizontal data={r.items} keyExtractor={(x) => x.id} showsHorizontalScrollIndicator={false}
                contentContainerStyle={{ paddingStart: pad, paddingEnd: u(96), gap: u(30), paddingVertical: u(14) }}
                renderItem={({ item, index }) => <TvSquare item={item} width={u(260)} first={i === 0 && index === 0} />} />
            </View>
          ))}
        </ScrollView>
      )}
      {au.book ? (
        <View style={{ position: 'absolute', bottom: u(54), end: u(96) }}>
          <Focusable ring={false} scale={1.04} radius={u(20)} accessibilityRole="button" accessibilityLabel={`${t('tv.nowPlaying')} · ${au.book.title}`} onPress={() => router.push('/tv/audyn/player')}>
            {(on) => (
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: u(18), padding: u(12), paddingEnd: u(26), borderRadius: u(20), backgroundColor: on ? tvc.text : 'rgba(13,30,53,0.95)', borderWidth: 1, borderColor: 'rgba(143,169,204,0.25)' }}>
                <View style={{ width: u(64), height: u(64), borderRadius: u(12), overflow: 'hidden', backgroundColor: tvc.panel }}>
                  {au.book!.coverUrl ? <Image source={{ uri: au.book!.coverUrl }} style={{ position: 'absolute', top: 0, bottom: 0, left: 0, right: 0 }} contentFit="cover" /> : null}
                </View>
                <View style={{ maxWidth: u(420) }}>
                  <Txt weight="bold" size={u(20)} color={on ? tvc.onLight : tvc.text} numberOfLines={1}>{au.chapter?.title || au.book!.title}</Txt>
                  <Txt size={u(17)} color={on ? tvc.onLight : tvc.muted} numberOfLines={1}>{t('tv.nowPlaying')}</Txt>
                </View>
                <Feather name={au.playing ? 'pause' : 'play'} size={u(24)} color={on ? tvc.onLight : tvc.text} />
              </View>
            )}
          </Focusable>
        </View>
      ) : null}
    </TvShell>
  );
}
