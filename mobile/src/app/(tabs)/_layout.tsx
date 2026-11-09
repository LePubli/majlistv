// Barre de navigation du bas : Accueil, Vidéos, Apprendre, Bibliothèque, Compte.
import React from 'react';
import { Tabs } from 'expo-router';
import { Feather } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useSession } from '@/lib/session';
import { colors, fonts } from '@/lib/theme';
import { AppHeader } from '@/components/AppHeader';
import { MenuTabBar } from '@/components/MenuTabBar';
import { resolveTabs } from '@/lib/menus';
import { SITE_URL } from '@/lib/config';

export default function TabsLayout() {
  const { t, dirStyle, menus, user, config, feat, locale } = useSession();
  const insets = useSafeAreaInsets();
  // Projet Menus : onglets choisis dans Admin → Menus (« Application — onglets du bas ») ; sans menu affecté, la barre d'origine.
  const tabs = resolveTabs(menus?.app_tabs, { locale, loggedIn: !!user, role: user?.role, hasSeries: !!config?.hasSeries, feat, siteUrl: SITE_URL });
  return (
    <Tabs
      tabBar={tabs && tabs.length ? () => <MenuTabBar tabs={tabs} /> : undefined}
      screenOptions={{
        headerShown: true,
        header: () => <AppHeader />,
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
      <Tabs.Screen name="talks" options={{ title: t('navCatalogue'), tabBarIcon: ({ color }) => <Feather name="film" size={22} color={color as string} /> }} />
      <Tabs.Screen name="learn" options={{ title: t('tabs.learn'), tabBarIcon: ({ color }) => <Feather name="book-open" size={22} color={color as string} /> }} />
      <Tabs.Screen name="library" options={{ title: t('tabs.library'), tabBarIcon: ({ color }) => <Feather name="bookmark" size={22} color={color as string} /> }} />
      <Tabs.Screen name="account" options={{ title: t('tabs.account'), tabBarIcon: ({ color }) => <Feather name="user" size={22} color={color as string} /> }} />
    </Tabs>
  );
}
