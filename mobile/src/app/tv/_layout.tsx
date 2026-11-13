// Application TV : pile d'écrans propre à la télé (accueil, fiche, lecteur, compte / connexion par code).
import React from 'react';
import { Stack } from 'expo-router';
import { colors } from '@/lib/theme';

export default function TvLayout() {
  return <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.bg } }} />;
}
