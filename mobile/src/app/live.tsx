// TV en direct (fonction « livetv », indépendante des événements en direct depuis le 14/11) : chaînes YouTube 24 h/24
// (ex. La Mecque, Médine) gérées dans Studio → TV en direct ; lecteur YouTube du direct en cours.
import React from 'react';
import { ScrollView } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useSession } from '@/lib/session';
import { colors } from '@/lib/theme';
import { ScreenHeader, Txt, screenStyle } from '@/components/ui';
import { LiveChannels } from '@/components/LiveChannels';

export default function LiveTvScreen() {
  const { t, dirStyle, feat } = useSession();
  return (
    <SafeAreaView style={[screenStyle, dirStyle]} edges={['top', 'bottom']}>
      <ScreenHeader title={t('lv.nav')} />
      <ScrollView contentContainerStyle={{ padding: 16, gap: 12, paddingBottom: 120 }}>
        {feat('livetv') ? (
          <>
            <Txt size={14} color={colors.text2}>{t('lv.intro')}</Txt>
            <LiveChannels empty={<Txt color={colors.muted}>{t('tv.noLive')}</Txt>} />
          </>
        ) : <Txt color={colors.muted}>{t('tv.noLive')}</Txt>}
      </ScrollView>
    </SafeAreaView>
  );
}
