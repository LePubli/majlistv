// « En direct » (étape N1 du 15/11) : ouvert depuis le Catalogue. Réunit la TV 24 h/24 (fonction « livetv » : chaînes YouTube
// gérées dans Studio → TV en direct, lecteur YouTube du direct en cours) et les prochains événements en direct (fonction « events »).
// La TV reste indépendante du module « Événements en direct » : chaque partie suit sa propre fonction.
import React from 'react';
import { Pressable, ScrollView } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { useSession } from '@/lib/session';
import { colors } from '@/lib/theme';
import { ScreenHeader, Txt, screenStyle } from '@/components/ui';
import { LiveChannels } from '@/components/LiveChannels';
import { EventsBand } from '@/components/HomeBands';

export default function LiveTvScreen() {
  const { t, dirStyle, feat } = useSession();
  const events = feat('events');
  return (
    <SafeAreaView style={[screenStyle, dirStyle]} edges={['top', 'bottom']}>
      <ScreenHeader title={t('lv.live')} />
      <ScrollView contentContainerStyle={{ padding: 16, gap: 12, paddingBottom: 120 }}>
        {feat('livetv') ? (
          <>
            <Txt size={14} color={colors.text2}>{events ? t('lv.hubIntro') : t('lv.intro')}</Txt>
            <LiveChannels empty={<Txt color={colors.muted}>{t('tv.noLive')}</Txt>} />
          </>
        ) : <Txt color={colors.muted}>{t('tv.noLive')}</Txt>}
        {events ? (
          <EventsBand gutter={0} empty={(
            <Pressable accessibilityRole="link" onPress={() => router.navigate('/events')}>
              <Txt size={14} color={colors.goldLight}>{t('evn.seeAll')}</Txt>
            </Pressable>
          )} />
        ) : null}
      </ScrollView>
    </SafeAreaView>
  );
}
