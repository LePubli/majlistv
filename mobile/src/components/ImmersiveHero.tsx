// En-tête plein écran des écrans Collections : image de fond, dégradé vers le fond de l'application, bouton retour, texte en bas.
import React from 'react';
import { View, useWindowDimensions } from 'react-native';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { router } from 'expo-router';
import { Feather } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useSession } from '@/lib/session';
import { colors, gradientFor } from '@/lib/theme';
import { IconButton } from './ui';

export function ImmersiveHero({ id, uri, children }: { id: string; uri?: string | null; children: React.ReactNode }) {
  const { t, isRTL } = useSession();
  const { width, height } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const h = Math.min(Math.max(width * 1.05, 400), height * 0.78);
  const fill = { position: 'absolute', top: 0, bottom: 0, start: 0, end: 0 } as const;
  return (
    <View style={{ width: '100%', height: h, justifyContent: 'flex-end' }}>
      <LinearGradient colors={gradientFor(id)} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={fill} />
      {uri ? <Image source={{ uri }} style={fill} contentFit="cover" transition={250} /> : null}
      <LinearGradient colors={['rgba(0,0,0,0.55)', 'rgba(0,0,0,0)']} locations={[0, 0.35]} style={fill} />
      <LinearGradient colors={['rgba(0,0,0,0)', colors.bg]} locations={[0.35, 0.98]} style={fill} />
      <View style={{ position: 'absolute', top: insets.top + 6, start: 14 }}>
        <IconButton label={t('common.close')} onPress={() => (router.canGoBack() ? router.back() : router.replace('/'))} style={{ backgroundColor: 'rgba(0,0,0,0.45)' }}>
          <Feather name={isRTL ? 'arrow-right' : 'arrow-left'} size={20} color={colors.text} />
        </IconButton>
      </View>
      <View style={{ paddingHorizontal: 18, paddingBottom: 18, gap: 10 }}>{children}</View>
    </View>
  );
}
