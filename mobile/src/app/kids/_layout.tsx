// Espace Mejliss Kids : pile d'écrans à part (fond bleu nuit). Tant qu'un enfant est dans l'espace, le bouton « retour » d'Android
// ne permet jamais d'en sortir : seul le code parental le fait (écran « exit »).
import React, { useEffect } from 'react';
import { BackHandler } from 'react-native';
import { Stack, useSegments } from 'expo-router';
import { useKid } from '@/lib/kidSession';
import { KC } from '@/lib/kids';

export default function KidsLayout() {
  const { kid } = useKid();
  const segments = useSegments() as string[];
  const leaf = segments[1] ?? 'index';
  // Sur l'accueil enfant, « retour » est absorbé (on ne quitte pas l'espace). Ailleurs, il revient à l'écran précédent de l'espace.
  useEffect(() => {
    if (!kid) return undefined;
    const sub = BackHandler.addEventListener('hardwareBackPress', () => leaf === 'home' || leaf === 'index');
    return () => sub.remove();
  }, [kid, leaf]);
  return (
    <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: KC.bg } }}>
      <Stack.Screen name="index" />
      <Stack.Screen name="home" options={{ gestureEnabled: false }} />
      <Stack.Screen name="watch/[id]" />
      <Stack.Screen name="shorts" />
      <Stack.Screen name="parent" />
      <Stack.Screen name="exit" options={{ presentation: 'modal' }} />
    </Stack>
  );
}
