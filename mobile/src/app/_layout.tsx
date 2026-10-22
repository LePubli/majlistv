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
import { SessionProvider, useSession } from '@/lib/session';
import { colors } from '@/lib/theme';

void SplashScreen.preventAutoHideAsync();

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
      </Stack>
    </>
  );
}

export default function RootLayout() {
  return (
    <SafeAreaProvider>
      <SessionProvider>
        <Shell />
      </SessionProvider>
    </SafeAreaProvider>
  );
}
