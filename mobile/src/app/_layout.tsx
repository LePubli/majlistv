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
import { router, useSegments } from 'expo-router';
import * as Notifications from 'expo-notifications';
import { SessionProvider, useSession } from '@/lib/session';
import { KidProvider, useKid } from '@/lib/kidSession';
import { PrayerProvider } from '@/lib/prayerStore';
import { DownloadProvider } from '@/lib/downloadStore';
import { routeForPath } from '@/lib/notifRoute';
import { PrayerGate } from '@/components/PrayerGate';
import { AdGate } from '@/components/AdGate';
import { LogoIntro } from '@/components/LogoIntro';
import { WidgetSync } from '@/components/WidgetSync';
import { AppUpdate } from '@/components/AppUpdate';
import { QuranPlayerProvider } from '@/lib/quranPlayer';
import { QuranMiniBar } from '@/components/QuranMiniBar';
import { AudynPlayerProvider } from '@/lib/audynPlayer';
import { AudynMiniBar } from '@/components/AudynMiniBar';
import { colors } from '@/lib/theme';
import { installGlobalErrorReporting, reportAppError } from '@/lib/reportError';
import { Pressable, Text, View } from 'react-native';
import type { ErrorBoundaryProps } from 'expo-router';

void SplashScreen.preventAutoHideAsync();
installGlobalErrorReporting();

// Écran affiché quand une page plante (au lieu de fermer l'application) ; l'erreur est envoyée au serveur (Admin → Erreurs).
export function ErrorBoundary({ error, retry }: ErrorBoundaryProps) {
  useEffect(() => { reportAppError(error, 'écran'); }, [error]);
  return (
    <View style={{ flex: 1, backgroundColor: colors.bg, alignItems: 'center', justifyContent: 'center', padding: 24, gap: 16 }}>
      <Text style={{ color: '#fff', fontSize: 18, fontWeight: '700', textAlign: 'center' }}>Oups, un problème est survenu. · Something went wrong.</Text>
      <Text style={{ color: colors.muted, fontSize: 13, textAlign: 'center' }}>{String(error?.message || '').slice(0, 200)}</Text>
      <Pressable accessibilityRole="button" onPress={() => { void retry(); }} style={{ paddingHorizontal: 22, paddingVertical: 12, borderRadius: 24, backgroundColor: colors.gold }}>
        <Text style={{ color: '#000', fontWeight: '700' }}>↻</Text>
      </Pressable>
    </View>
  );
}

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

// Espace enfant verrouillé : tant qu'un enfant y est, tout écran hors de l'espace (lien profond, notification, retour) ramène à son accueil.
function KidLock() {
  const { kid, ready } = useKid();
  const segments = useSegments() as string[];
  useEffect(() => {
    if (ready && kid && segments[0] !== 'kids') router.replace('/kids/home');
  }, [ready, kid, segments]);
  return null;
}

function Shell() {
  const { ready, dirStyle, skin } = useSession();
  const kidState = useKid();
  const [fontsLoaded, fontError] = useFonts({
    Montserrat_700Bold, Montserrat_800ExtraBold, DMSans_400Regular, DMSans_500Medium, DMSans_700Bold,
    NotoSansArabic_400Regular, NotoSansArabic_500Medium, NotoSansArabic_700Bold, NotoKufiArabic_700Bold, NotoKufiArabic_800ExtraBold,
    // Thème « Nuit et or » : polices gardées dans assets/fonts (licence OFL) plutôt qu'en dépendance,
    // pour que cette évolution arrive par mise à jour du contenu, sans réinstaller l'application.
    Marcellus_400Regular: require('../../assets/fonts/Marcellus_400Regular.ttf'),
    Amiri_400Regular: require('../../assets/fonts/Amiri_400Regular.ttf'),
    Amiri_700Bold: require('../../assets/fonts/Amiri_700Bold.ttf'),
  });
  const done = ready && kidState.ready && (fontsLoaded || !!fontError);
  useEffect(() => { if (done) void SplashScreen.hideAsync(); }, [done]);
  if (!done) return null;
  // Stack key={skin} : quand l'administrateur change de thème, toute l'application est redessinée avec les nouvelles couleurs.
  return (
    <>
      <StatusBar style="light" />
      <NotificationRouter />
      <KidLock />
      <PrayerGate />
      <WidgetSync />
      <AppUpdate />
      <Stack key={skin} screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.bg, ...dirStyle } }}>
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
        <Stack.Screen name="shorts" options={{ animation: 'slide_from_bottom' }} />
        <Stack.Screen name="prayer" />
        <Stack.Screen name="downloads" />
        <Stack.Screen name="offline/[id]" />
        <Stack.Screen name="offline/quiz/[id]" />
        <Stack.Screen name="kids" />
        <Stack.Screen name="athkar" />
        <Stack.Screen name="ramadan" />
        <Stack.Screen name="quran/index" />
        <Stack.Screen name="quran/[n]" />
        <Stack.Screen name="events/index" />
        <Stack.Screen name="events/[id]" />
        <Stack.Screen name="audyn/index" />
        <Stack.Screen name="audyn/[id]" />
        <Stack.Screen name="audyn/player" options={{ animation: 'slide_from_bottom' }} />
      </Stack>
      <QuranMiniBar />
      <AudynMiniBar />
      <AdGate />
      <LogoIntro />
    </>
  );
}

export default function RootLayout() {
  return (
    <SafeAreaProvider>
      <SessionProvider>
        <KidProvider>
          <PrayerProvider>
            <DownloadProvider>
              <QuranPlayerProvider>
                <AudynPlayerProvider>
                  <Shell />
                </AudynPlayerProvider>
              </QuranPlayerProvider>
            </DownloadProvider>
          </PrayerProvider>
        </KidProvider>
      </SessionProvider>
    </SafeAreaProvider>
  );
}
