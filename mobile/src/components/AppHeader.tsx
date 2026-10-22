// En-tête de l'application : logo (emblème + nom), recherche, menu. Même rôle que l'en-tête du site.
import React, { useState } from 'react';
import { Pressable, View, useWindowDimensions } from 'react-native';
import { Image } from 'expo-image';
import { router } from 'expo-router';
import { Feather } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useSession } from '@/lib/session';
import { colors } from '@/lib/theme';
import { MenuDrawer } from './MenuDrawer';
import { PrayerPill } from './PrayerPill';

export function AppHeader() {
  const { t, dirStyle } = useSession();
  const insets = useSafeAreaInsets();
  const [open, setOpen] = useState(false);
  const { width } = useWindowDimensions();
  return (
    <View style={[{ paddingTop: insets.top + 6, paddingBottom: 8, paddingHorizontal: 14, backgroundColor: 'rgba(11,9,6,0.96)', borderBottomWidth: 1, borderBottomColor: colors.borderSoft,
      flexDirection: 'row', alignItems: 'center', gap: 10 }, dirStyle]}>
      <Pressable accessibilityRole="link" accessibilityLabel="Mejliss TV" onPress={() => router.navigate('/')} style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flex: 1 }}>
        <Image source={require('../../assets/brand/emblem.png')} style={{ width: 32, height: 34 }} contentFit="contain" />
        <Image source={require('../../assets/brand/wordmark.png')} style={{ width: 88, height: 18 }} contentFit="contain" />
      </Pressable>
      <PrayerPill compact={width < 460} /> {/* petit écran : le logo complet garde sa place, la pastille ne montre que le compte à rebours */}
      <Pressable accessibilityRole="button" accessibilityLabel={t('hmSearch')} onPress={() => router.push('/search')} hitSlop={8}
        style={{ width: 42, height: 42, borderRadius: 21, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.panel, borderWidth: 1, borderColor: colors.border }}>
        <Feather name="search" size={19} color={colors.text} />
      </Pressable>
      <Pressable accessibilityRole="button" accessibilityLabel={t('hmMenu')} onPress={() => setOpen(true)} hitSlop={8}
        style={{ width: 42, height: 42, borderRadius: 21, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.panel, borderWidth: 1, borderColor: colors.border }}>
        <Feather name="menu" size={20} color={colors.text} />
      </Pressable>
      <MenuDrawer visible={open} onClose={() => setOpen(false)} />
    </View>
  );
}
