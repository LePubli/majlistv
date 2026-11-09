// Barre du bas pilotée par Admin → Menus (« Application — onglets du bas ») : mêmes couleurs et même hauteur que la barre d'origine.
import React from 'react';
import { Linking, Pressable, View } from 'react-native';
import { router, usePathname } from 'expo-router';
import { Feather } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors, fonts } from '@/lib/theme';
import { useSession } from '@/lib/session';
import { tabActive, type AppItem } from '@/lib/menus';
import { Txt } from './ui';

export function MenuTabBar({ tabs }: { tabs: AppItem[] }) {
  const { dirStyle } = useSession();
  const insets = useSafeAreaInsets();
  const path = usePathname();
  return (
    <View accessibilityRole="tablist" style={[{ flexDirection: 'row', backgroundColor: colors.nav, borderTopColor: colors.border, borderTopWidth: 1, height: 58 + insets.bottom, paddingTop: 6, paddingBottom: Math.max(insets.bottom, 8) }, dirStyle]}>
      {tabs.map((tab) => {
        const on = tabActive(tab.target, path);
        const color = on ? colors.goldLight : colors.muted;
        return (
          <Pressable key={tab.key} accessibilityRole="tab" accessibilityState={{ selected: on }} accessibilityLabel={tab.label}
            onPress={() => {
              const tg = tab.target;
              if (!tg) return;
              if (tg.type === 'route') router.navigate({ pathname: tg.pathname, params: tg.params } as never);
              else void Linking.openURL(tg.url);
            }}
            style={{ flex: 1, alignItems: 'center', justifyContent: 'center', gap: 3 }}>
            <Feather name={tab.icon as never} size={22} color={color} />
            <Txt weight="semibold" size={12} color={color} numberOfLines={1} style={{ fontFamily: fonts.semibold }}>{tab.label}</Txt>
          </Pressable>
        );
      })}
    </View>
  );
}
