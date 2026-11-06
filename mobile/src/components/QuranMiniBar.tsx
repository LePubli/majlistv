// Mini-lecteur de la récitation : visible sur toutes les pages tant qu'une récitation joue (sauf sur la sourate en cours).
// Toucher la barre ouvre la sourate au verset lu ; le carré arrête la récitation.
import React from 'react';
import { Pressable, View } from 'react-native';
import { router, usePathname, useSegments } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import { useQuranPlayer } from '@/lib/quranPlayer';
import { useSession } from '@/lib/session';
import { colors, radius } from '@/lib/theme';
import { Txt } from '@/components/ui';

export function QuranMiniBar() {
  const { current, title, stop } = useQuranPlayer();
  const { t } = useSession();
  const insets = useSafeAreaInsets();
  const path = usePathname();
  const segments = useSegments() as string[];
  if (!current) return null;
  if (path === `/quran/${current.sura}`) return null; // déjà sur la sourate : les boutons des versets suffisent
  const onTabs = segments[0] === '(tabs)';
  const bottom = (onTabs ? 58 : 0) + insets.bottom + 8;
  return (
    <View pointerEvents="box-none" style={{ position: 'absolute', left: 12, right: 12, bottom, zIndex: 50 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, padding: 8, paddingStart: 14, borderRadius: radius.panel, backgroundColor: colors.panel2, borderWidth: 1, borderColor: colors.gold }}>
        <Pressable accessibilityRole="button" accessibilityLabel={title} onPress={() => router.push(`/quran/${current.sura}?aya=${current.aya}` as never)}
          style={{ flex: 1, minHeight: 44, justifyContent: 'center' }}>
          <Txt weight="bold" size={14} color={colors.goldLight} numberOfLines={1}>{title}</Txt>
        </Pressable>
        <Pressable accessibilityRole="button" accessibilityLabel={t('qrStop')} onPress={stop}
          style={{ width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.gold }}>
          <Feather name="square" size={18} color={colors.onGold} />
        </Pressable>
      </View>
    </View>
  );
}
