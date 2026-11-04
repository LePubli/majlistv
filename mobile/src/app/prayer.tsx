// Page « Prière » de l'application (amélioration 4.3) : horaires du jour + date hégirienne, calendrier du mois, Qibla avec boussole, réglages.
// Même organisation que la page /priere du site (web/components/PrayerPage.js). Onglet demandé par l'adresse : /prayer?tab=settings.
import React, { useState } from 'react';
import { ScrollView, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams } from 'expo-router';
import { useSession } from '@/lib/session';
import { usePrayer } from '@/lib/prayerStore';
import { colors } from '@/lib/theme';
import { Chip, Title, Txt, screenStyle } from '@/components/ui';
import { AppHeader } from '@/components/AppHeader';
import { PrayerToday } from '@/components/PrayerToday';
import { PrayerMonth } from '@/components/PrayerMonth';
import { PrayerQibla } from '@/components/PrayerQibla';
import { PrayerSettingsPanel } from '@/components/PrayerSettingsPanel';

const TABS = ['today', 'month', 'qibla', 'settings'] as const;
type Tab = (typeof TABS)[number];
const TAB_KEY = { today: 'pqTabToday', month: 'pqTabMonth', qibla: 'pqTabQibla', settings: 'pqTabSettings' } as const;

export default function PrayerScreen() {
  const { t, dirStyle, isRTL } = useSession();
  const prayer = usePrayer();
  const params = useLocalSearchParams<{ tab?: string }>();
  const [tab, setTab] = useState<Tab>(TABS.includes(params.tab as Tab) ? (params.tab as Tab) : 'today');
  const { prefs } = prayer;
  const place = prefs.loc.mode === 'geo' ? t('pryMyPos') : prefs.loc.name;

  return (
    <SafeAreaView style={[screenStyle, dirStyle]} edges={['bottom']}>
      <AppHeader />
      <ScrollView contentContainerStyle={{ padding: 18, gap: 16, paddingBottom: 32 }} keyboardShouldPersistTaps="handled">
        <Title>{t('pqTitle')}</Title>
        {!prayer.on ? <Txt color={colors.muted}>{t('ftOffText')}</Txt> : !prayer.ready ? <Txt color={colors.muted}>…</Txt> : (
          <>
            <Txt color={colors.text2} style={{ textAlign: isRTL ? 'right' : 'left' }}>
              <Txt color={colors.muted}>{t('pqPlace')} </Txt><Txt weight="bold">{place}</Txt>
            </Txt>
            <View accessibilityRole="tablist" style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
              {TABS.map((id) => <Chip key={id} label={t(TAB_KEY[id])} active={tab === id} onPress={() => setTab(id)} />)}
            </View>
            {tab === 'today' ? <PrayerToday /> : tab === 'month' ? <PrayerMonth /> : tab === 'qibla' ? <PrayerQibla /> : <PrayerSettingsPanel />}
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}
