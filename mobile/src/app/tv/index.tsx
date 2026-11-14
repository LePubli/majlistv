// Accueil TV : grande vidéo à la une, puis rangées horizontales (Continuer, puis les rangées de l'accueil du site).
// La flèche haut / bas passe d'une rangée à l'autre, gauche / droite d'une vidéo à l'autre ; la liste défile toute seule.
import React from 'react';
import { FlatList, ScrollView, View, useWindowDimensions } from 'react-native';
import { router } from 'expo-router';
import { useSession } from '@/lib/session';
import { useAsync } from '@/lib/useAsync';
import { tvCardWidth, tvMenuWidth, tvRows } from '@/lib/tv';
import type { Card, Home } from '@/lib/types';
import { colors } from '@/lib/theme';
import { Loading, Txt } from '@/components/ui';
import { Poster } from '@/components/TalkCard';
import { TvShell } from '@/components/tv/TvShell';
import { TvCard } from '@/components/tv/TvCard';
import { Focusable } from '@/components/tv/Focusable';

function Row({ title, talks, first, cardW }: { title: string; talks: Card[]; first?: boolean; cardW: number }) {
  return (
    <View style={{ gap: 8 }}>
      <Txt weight="extrabold" size={20} style={{ paddingHorizontal: 32 }}>{title}</Txt>
      <FlatList horizontal data={talks} keyExtractor={(x) => x.id} showsHorizontalScrollIndicator={false}
        contentContainerStyle={{ paddingHorizontal: 28, gap: 16, paddingVertical: 8 }}
        renderItem={({ item, index }) => <TvCard talk={item} width={cardW} first={first && index === 0} />} />
    </View>
  );
}

export default function TvHome() {
  const { api, user, t } = useSession();
  const home = useAsync(() => api.get<Home>('/home'), [user?.id]);
  const cont = useAsync(async () => (user ? await api.get<Card[]>('/me/continue').catch(() => []) : []), [user?.id]);
  const hero = home.data?.hero && home.data.hero.mode === 'featured' ? home.data.hero.items[0] : null;
  const rows = tvRows(home.data?.rows ?? []);
  const { width } = useWindowDimensions();
  const contentW = width - tvMenuWidth(width);
  const cardW = tvCardWidth(contentW);
  return (
    <TvShell>
      {home.loading && !home.data ? <Loading /> : (
        <ScrollView contentContainerStyle={{ paddingVertical: 28, gap: 28 }}>
          {hero ? (
            <View style={{ flexDirection: 'row', gap: 28, paddingHorizontal: 32, alignItems: 'center' }}>
              <View style={{ flex: 1, gap: 12 }}>
                <Txt weight="bold" size={14} color={colors.goldLight} style={{ letterSpacing: 1.5, textTransform: 'uppercase' }}>{t('tv.featured')}</Txt>
                <Txt weight="extrabold" size={28} numberOfLines={2}>{hero.title}</Txt>
                {hero.speaker ? <Txt size={18} color={colors.text2}>{hero.speaker}</Txt> : null}
                {hero.summary ? <Txt size={16} color={colors.text2} numberOfLines={3}>{hero.summary}</Txt> : null}
                <Focusable first={!cont.data?.length} accessibilityRole="button" onPress={() => router.push({ pathname: '/tv/talk/[id]', params: { id: hero.id } })}
                  style={{ alignSelf: 'flex-start', backgroundColor: colors.gold, paddingVertical: 12, paddingHorizontal: 26, borderRadius: 999 }} radius={999}>
                  <Txt weight="extrabold" size={18} color="#111">▶ {t('tv.watch')}</Txt>
                </Focusable>
              </View>
              <View style={{ width: Math.round(contentW * 0.42) }}><Poster talk={hero} /></View>
            </View>
          ) : null}
          {cont.data && cont.data.length > 0 ? <Row title={t('tv.continue')} talks={cont.data} cardW={cardW} first /> : null}
          {rows.map((r, i) => <Row key={r.key} title={r.title || t('tv.featured')} talks={(r.talks ?? []) as Card[]} cardW={cardW} first={!hero && !cont.data?.length && i === 0} />)}
          {!hero && rows.length === 0 ? <Txt color={colors.muted} style={{ paddingHorizontal: 40 }}>{t('tv.empty')}</Txt> : null}
        </ScrollView>
      )}
    </TvShell>
  );
}
