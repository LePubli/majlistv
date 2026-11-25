// Une collection sur la télé : image de fond de la vidéo choisie, titre, description, repères, bouton « Commencer »
// (ouvre la première vidéo), puis la rangée des vidéos de la collection.
import React, { useState } from 'react';
import { ScrollView, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { useSession } from '@/lib/session';
import { useAsync } from '@/lib/useAsync';
import { tvCardWidth } from '@/lib/tv';
import { tvc, useTv } from '@/lib/tvTheme';
import type { Card, CollectionDetail } from '@/lib/types';
import { Loading, Txt } from '@/components/ui';
import { TvShell } from '@/components/tv/TvShell';
import { TvRow } from '@/components/tv/TvCard';
import { TvBackdrop } from '@/components/tv/TvBackdrop';
import { TvButton } from '@/components/tv/TvButton';
import { kindLabel, videosLabel } from '@/components/CollectionCard';
import { totalTime } from '@/lib/media';

export default function TvCollection() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { api, t } = useSession();
  const { u, W } = useTv();
  const c = useAsync(() => api.get<CollectionDetail>(`/collections/${id}`), [id]);
  const [bg, setBg] = useState<Card | null>(null);
  const pad = u(200);
  const cardW = tvCardWidth(W - pad + u(64), 4.4);
  const d = c.data;
  const talks = (d?.talks ?? []) as Card[];
  const first = talks[0] ?? null;
  const time = totalTime(talks, t('minutes'));
  return (
    <TvShell overlay>
      {c.loading && !d ? <Loading /> : !d ? <Txt size={u(26)} color={tvc.muted} style={{ padding: pad }}>{t('colNone')}</Txt> : (
        <View style={{ flex: 1 }}>
          <TvBackdrop talk={bg ?? first} style={{ top: 0, left: 0, right: 0, height: u(820) }} />
          <ScrollView contentContainerStyle={{ paddingBottom: u(80) }} showsVerticalScrollIndicator={false}>
            <View style={{ paddingTop: u(150), paddingStart: pad, width: pad + u(860), minHeight: u(600), gap: u(22) }}>
              {d.kind ? <Txt weight="bold" size={u(20)} color={tvc.accentLight} style={{ letterSpacing: u(2.6), textTransform: 'uppercase' }}>{kindLabel(d.kind, t)}</Txt> : null}
              <Txt weight="extrabold" size={u(68)} numberOfLines={3} style={{ lineHeight: u(74) }}>{d.title}</Txt>
              {d.description ? <Txt size={u(26)} color={tvc.text2} numberOfLines={3} style={{ lineHeight: u(38), maxWidth: u(760) }}>{d.description}</Txt> : null}
              <Txt weight="bold" size={u(24)} color={tvc.text2}>{[videosLabel(talks.length, t), time].filter(Boolean).join('  ·  ')}</Txt>
              {first ? (
                <View style={{ flexDirection: 'row', gap: u(20), marginTop: u(10) }}>
                  <TvButton first label={t('pmColPlayAll')} icon="play" onPress={() => router.push({ pathname: '/tv/talk/[id]', params: { id: first.id } })} />
                </View>
              ) : null}
            </View>
            <View style={{ marginTop: u(30) }}>
              <TvRow title={t('pmColIn')} talks={talks} cardW={cardW} padStart={pad} onFocusTalk={setBg} />
            </View>
          </ScrollView>
        </View>
      )}
    </TvShell>
  );
}
