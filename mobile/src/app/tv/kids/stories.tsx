// Histoires du soir de l'enfant sur la télé (refonte TV-R) : illimitées, hors limite quotidienne ; grandes couvertures carrées.
import React from 'react';
import { ScrollView, View } from 'react-native';
import { Redirect } from 'expo-router';
import { Feather } from '@expo/vector-icons';
import { useSession } from '@/lib/session';
import { useKid } from '@/lib/kidSession';
import { useAsync } from '@/lib/useAsync';
import type { AudynItem } from '@/lib/audyn';
import { KC } from '@/lib/kids';
import { useTv } from '@/lib/tvTheme';
import { Txt } from '@/components/ui';
import { TvSquare } from '@/components/tv/TvSquare';

export default function TvKidsStories() {
  const { t, dirStyle } = useSession();
  const { kid, kidApi, epoch } = useKid();
  const { u } = useTv();
  const d = useAsync(() => kidApi.get<{ items: AudynItem[] }>('/kids/stories'), [kid?.profile.id, epoch]); // eslint-disable-line react-hooks/exhaustive-deps
  if (!kid) return <Redirect href="/tv/kids" />;
  const items = d.data?.items ?? [];
  return (
    <ScrollView style={[{ backgroundColor: KC.bg }, dirStyle]} contentContainerStyle={{ paddingTop: u(54), paddingBottom: u(80), paddingHorizontal: u(96), gap: u(30) }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: u(18) }}>
        <Feather name="moon" size={u(44)} color={KC.accent} />
        <Txt weight="extrabold" size={u(56)} color={KC.text}>{t('aud.kTitle')}</Txt>
      </View>
      <Txt size={u(26)} color={KC.text2} style={{ lineHeight: u(38), maxWidth: u(1200) }}>{t('aud.kIntro')}</Txt>
      {d.loading && !d.data ? <Txt size={u(26)} color={KC.text2}>…</Txt> : null}
      {d.error && !d.data ? <Txt size={u(26)} color={KC.text2}>{t('common.error')}</Txt> : null}
      {d.data && items.length === 0 ? <Txt size={u(26)} color={KC.text2}>{t('aud.kEmpty')}</Txt> : null}
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: u(36) }}>
        {items.map((it, i) => (
          <TvSquare key={it.id} item={it} width={u(300)} first={i === 0} href={`/tv/kids/story/${it.id}`} accent={KC.accent} panel={KC.surface} muted={KC.muted} />
        ))}
      </View>
    </ScrollView>
  );
}
