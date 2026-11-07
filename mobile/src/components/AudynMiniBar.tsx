// Mini-lecteur Audyn : visible sur toutes les pages tant qu'un livre est chargé (sauf sur le lecteur lui-même).
import React from 'react';
import { Pressable, View } from 'react-native';
import { router, usePathname, useSegments } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import { useAudyn } from '@/lib/audynPlayer';
import { useQuranPlayer } from '@/lib/quranPlayer';
import { useSession } from '@/lib/session';
import { colors, radius } from '@/lib/theme';
import { Txt } from '@/components/ui';

export function AudynMiniBar() {
  const au = useAudyn();
  const quran = useQuranPlayer();
  const { t } = useSession();
  const insets = useSafeAreaInsets();
  const path = usePathname();
  const segments = useSegments() as string[];
  if (!au.book || !au.chapter || path === '/audyn/player' || path === `/kids/story/${au.book.id}`) return null;
  const onTabs = segments[0] === '(tabs)';
  const bottom = (onTabs ? 58 : 0) + insets.bottom + 8 + (quran.current ? 64 : 0);
  return (
    <View pointerEvents="box-none" style={{ position: 'absolute', left: 12, right: 12, bottom, zIndex: 50 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, padding: 8, paddingStart: 14, borderRadius: radius.panel, backgroundColor: colors.panel2, borderWidth: 1, borderColor: colors.gold }}>
        <Pressable accessibilityRole="button" accessibilityLabel={`${t('aud.open')} — ${au.book.title}`} onPress={() => (au.book?.kids ? router.push({ pathname: '/kids/story/[id]', params: { id: au.book.id } }) : router.push('/audyn/player'))}
          style={{ flex: 1, minHeight: 44, justifyContent: 'center' }}>
          <Txt weight="bold" size={14} color={colors.goldLight} numberOfLines={1}>{au.book.title}</Txt>
          <Txt size={12} color={colors.text2} numberOfLines={1}>{au.chapter.title}</Txt>
        </Pressable>
        <Pressable accessibilityRole="button" accessibilityLabel={au.playing ? t('aud.pause') : t('aud.play')} onPress={au.toggle} disabled={au.loading}
          style={{ width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.gold, opacity: au.loading ? 0.5 : 1 }}>
          <Feather name={au.playing ? 'pause' : 'play'} size={18} color={colors.onGold} />
        </Pressable>
        <Pressable accessibilityRole="button" accessibilityLabel={t('aud.stop')} onPress={au.stop}
          style={{ width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: colors.border }}>
          <Feather name="x" size={18} color={colors.text} />
        </Pressable>
      </View>
    </View>
  );
}
