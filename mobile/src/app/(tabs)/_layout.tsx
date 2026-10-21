// Barre de navigation du bas : Accueil, Conférences, Compte (Apprendre et Bibliothèque arrivent à la tranche 2).
import React from 'react';
import { Tabs } from 'expo-router';
import { Feather } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useSession } from '@/lib/session';
import { colors, fonts } from '@/lib/theme';

export default function TabsLayout() {
  const { t, dirStyle } = useSession();
  const insets = useSafeAreaInsets();
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: colors.goldLight,
        tabBarInactiveTintColor: colors.muted,
        tabBarLabelStyle: { fontFamily: fonts.semibold, fontSize: 12 },
        tabBarStyle: {
          backgroundColor: colors.nav, borderTopColor: colors.border, borderTopWidth: 1,
          height: 58 + insets.bottom, paddingTop: 6, paddingBottom: Math.max(insets.bottom, 8),
          ...dirStyle,
        },
        sceneStyle: { backgroundColor: colors.bg },
      }}
    >
      <Tabs.Screen name="index" options={{ title: t('tabs.home'), tabBarIcon: ({ color }) => <Feather name="home" size={22} color={color as string} /> }} />
      <Tabs.Screen name="talks" options={{ title: t('tabs.talks'), tabBarIcon: ({ color }) => <Feather name="film" size={22} color={color as string} /> }} />
      <Tabs.Screen name="account" options={{ title: t('tabs.account'), tabBarIcon: ({ color }) => <Feather name="user" size={22} color={color as string} /> }} />
    </Tabs>
  );
}
