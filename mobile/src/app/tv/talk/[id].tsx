// Fiche d'une vidéo sur la télé : image, titre, intervenant, description ; « Regarder » / « Reprendre » / « Depuis le début ».
// Vidéo réservée aux abonnés et compte sans formule : message (l'abonnement se prend sur le site).
import React from 'react';
import { ScrollView, View, useWindowDimensions } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { useSession } from '@/lib/session';
import { useAsync } from '@/lib/useAsync';
import { formatDuration } from '@/lib/format';
import { tvResumeSeconds } from '@/lib/tv';
import type { Talk } from '@/lib/types';
import { colors } from '@/lib/theme';
import { ErrorBox, Loading, Txt } from '@/components/ui';
import { Poster } from '@/components/TalkCard';
import { Focusable } from '@/components/tv/Focusable';
import { TvSale } from '@/components/tv/TvSale';
import { SalePill } from '@/components/SaleCard';

const btn = { paddingVertical: 12, paddingHorizontal: 24, borderRadius: 999 } as const;

export default function TvTalk() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { api, user, t } = useSession();
  const talk = useAsync(() => api.get<Talk>(`/talks/${id}`), [id, user?.id]);
  const { width } = useWindowDimensions();
  if (talk.loading && !talk.data) return <Loading />;
  if (!talk.data) return <ErrorBox onRetry={talk.reload} />;
  const x = talk.data;
  const resume = tvResumeSeconds(x.resumeMs, x.durationSeconds);
  const play = (from: number) => router.push({ pathname: '/tv/play/[id]', params: { id: x.id, at: String(from) } });
  return (
    <ScrollView contentContainerStyle={{ padding: 36, gap: 24 }} style={{ backgroundColor: colors.bg }}>
      <View style={{ flexDirection: 'row', gap: 32 }}>
        <View style={{ width: Math.round(width * 0.42) }}><Poster talk={x} /></View>
        <View style={{ flex: 1, gap: 12 }}>
          <Txt weight="extrabold" size={26}>{x.title}</Txt>
          <Txt size={18} color={colors.text2}>{[x.speaker, x.durationSeconds ? formatDuration(x.durationSeconds) : null].filter(Boolean).join(' · ')}</Txt>
          <SalePill sale={x.sale} />
          {x.locked && x.sale ? (
            <TvSale kind="talk" id={x.id} sale={x.sale} onRefresh={talk.reload} />
          ) : x.locked ? (
            <Txt size={17} color={colors.goldLight}>{user ? t('tv.locked') : t('tv.lockedGuest')}</Txt>
          ) : (
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 14, marginTop: 8 }}>
              <Focusable first accessibilityRole="button" onPress={() => play(resume)} radius={999} style={[btn, { backgroundColor: colors.gold }]}>
                <Txt weight="extrabold" size={18} color="#111">▶ {resume ? t('tv.resume') : t('tv.watch')}</Txt>
              </Focusable>
              {resume ? (
                <Focusable accessibilityRole="button" onPress={() => play(0)} radius={999} style={[btn, { backgroundColor: colors.panel }]}>
                  <Txt weight="bold" size={18}>{t('tv.fromStart')}</Txt>
                </Focusable>
              ) : null}
            </View>
          )}
          {x.locked && !user ? (
            <Focusable first accessibilityRole="button" onPress={() => router.push('/tv/account')} radius={999} style={[btn, { alignSelf: 'flex-start', backgroundColor: colors.gold }]}>
              <Txt weight="extrabold" size={18} color="#111">{t('tv.login')}</Txt>
            </Focusable>
          ) : null}
          {x.description ? <Txt size={16} color={colors.text2} style={{ marginTop: 12, lineHeight: 24 }} numberOfLines={12}>{x.description}</Txt> : null}
        </View>
      </View>
    </ScrollView>
  );
}
