// Racine de l'application : polices, session, langue, navigation.
import React, { useEffect } from 'react';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import * as SplashScreen from 'expo-splash-screen';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { useFonts } from 'expo-font';
import { Montserrat_700Bold, Montserrat_800ExtraBold } from '@expo-google-fonts/montserrat';
import { DMSans_400Regular, DMSans_500Medium, DMSans_700Bold } from '@expo-google-fonts/dm-sans';
import { NotoSansArabic_400Regular, NotoSansArabic_500Medium, NotoSansArabic_700Bold } from '@expo-google-fonts/noto-sans-arabic';
import { NotoKufiArabic_700Bold, NotoKufiArabic_800ExtraBold } from '@expo-google-fonts/noto-kufi-arabic';
import { router } from 'expo-router';
import * as Notifications from 'expo-notifications';
import { SessionProvider, useSession } from '@/lib/session';
import { PrayerProvider } from '@/lib/prayerStore';
import { DownloadProvider } from '@/lib/downloadStore';
import { routeForPath } from '@/lib/notifRoute';
import { PrayerGate } from '@/components/PrayerGate';
import { AppUpdate } from '@/components/AppUpdate';
import { colors } from '@/lib/theme';

void SplashScreen.preventAutoHideAsync();

// Toucher une notification (application fermée, en arrière-plan ou ouverte) mène à la bonne page.
function NotificationRouter() {
  const response = Notifications.useLastNotificationResponse();
  const handled = React.useRef<string | null>(null);
  const { ready } = useSession();
  useEffect(() => {
    if (!ready || !response) return;
    const id = response.notification.request.identifier + ':' + response.notification.date;
    if (handled.current === id || response.actionIdentifier !== Notifications.DEFAULT_ACTION_IDENTIFIER) return;
    handled.current = id;
    const data = (response.notification.request.content.data ?? {}) as { path?: unknown; kind?: unknown };
    const target = routeForPath(data.path);
    if (target !== '/') router.push(target as never);
  }, [ready, response]);
  return null;
}

function Shell() {
  const { ready, dirStyle } = useSession();
  const [fontsLoaded, fontError] = useFonts({
    Montserrat_700Bold, Montserrat_800ExtraBold, DMSans_400Regular, DMSans_500Medium, DMSans_700Bold,
    NotoSansArabic_400Regular, NotoSansArabic_500Medium, NotoSansArabic_700Bold, NotoKufiArabic_700Bold, NotoKufiArabic_800ExtraBold,
  });
  const done = ready && (fontsLoaded || !!fontError);
  useEffect(() => { if (done) void SplashScreen.hideAsync(); }, [done]);
  if (!done) return null;
  return (
    <>
      <StatusBar style="light" />
      <NotificationRouter />
      <PrayerGate />
      <AppUpdate />
      <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.bg, ...dirStyle } }}>
        <Stack.Screen name="(tabs)" />
        <Stack.Screen name="login" options={{ presentation: 'modal' }} />
        <Stack.Screen name="talk/[id]" />
        <Stack.Screen name="list/[id]" />
        <Stack.Screen name="quiz/[id]" />
        <Stack.Screen name="practice/[id]" />
        <Stack.Screen name="search" />
        <Stack.Screen name="series/index" />
        <Stack.Screen name="series/[id]" />
        <Stack.Screen name="collections/index" />
        <Stack.Screen name="collections/[id]" />
        <Stack.Screen name="theme/[id]" />
        <Stack.Screen name="speaker/[slug]" />
        <Stack.Screen name="prayer" />
        <Stack.Screen name="downloads" />
        <Stack.Screen name="offline/[id]" />
      </Stack>
    </>
  );
}

export default function RootLayout() {
  return (
    <SafeAreaProvider>
      <SessionProvider>
        <PrayerProvider>
          <DownloadProvider>
            <Shell />
          </DownloadProvider>
        </PrayerProvider>
      </SessionProvider>
    </SafeAreaProvider>
  );
}
