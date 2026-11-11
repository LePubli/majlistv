// Onglet « Pratique » (navigation de novembre 2026, lot G) : le bloc « Aujourd'hui » puis une carte par geste quotidien
// — Prière, Coran, Adhkar, Ramadan. Chaque carte ouvre l'écran existant. Même contenu que la page /pratique du site.
import React from 'react';
import { Pressable, ScrollView, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { Feather } from '@expo/vector-icons';
import { useSession } from '@/lib/session';
import { colors } from '@/lib/theme';
import { Panel, Title, Txt, screenStyle } from '@/components/ui';
import { TodayBlock } from '@/components/TodayBlock';
import { practiceCards } from '@/lib/practice';

export default function PracticeScreen() {
  const { t, user, feat, dirStyle, isRTL } = useSession();
  const cards = practiceCards(feat, !!user);
  return (
    <SafeAreaView style={[screenStyle, dirStyle]} edges={[]}>
      <ScrollView contentContainerStyle={{ padding: 18, gap: 14, paddingBottom: 48 }}>
        <Title>{t('pqHub')}</Title>
        <Txt color={colors.muted}>{t('pqHubIntro')}</Txt>
        {user ? <TodayBlock /> : null}
        {cards.map((c) => (
          <Pressable key={c.key} accessibilityRole="link" accessibilityLabel={t(c.title)} onPress={() => router.push(c.pathname)} style={({ pressed }) => ({ opacity: pressed ? 0.85 : 1 })}>
            <Panel style={{ flexDirection: 'row', alignItems: 'center', gap: 12, borderColor: colors.goldLine }}>
              <Feather name={c.icon as React.ComponentProps<typeof Feather>['name']} size={22} color={colors.goldLight} />
              <View style={{ flex: 1, gap: 2 }}>
                <Txt weight="bold" size={16}>{t(c.title)}</Txt>
                <Txt size={13} color={colors.muted} numberOfLines={2}>{t(c.text)}</Txt>
              </View>
              <Feather name={isRTL ? 'chevron-left' : 'chevron-right'} size={20} color={colors.muted} />
            </Panel>
          </Pressable>
        ))}
      </ScrollView>
    </SafeAreaView>
  );
}
