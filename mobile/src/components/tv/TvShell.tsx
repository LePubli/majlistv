// Cadre des écrans TV : menu à gauche (atteint avec la flèche gauche de la télécommande), contenu à droite.
import React from 'react';
import { View } from 'react-native';
import { router, usePathname } from 'expo-router';
import { Feather } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { useSession } from '@/lib/session';
import { colors } from '@/lib/theme';
import { Txt } from '@/components/ui';
import { Focusable } from './Focusable';

type Entry = { href: string; icon: React.ComponentProps<typeof Feather>['name']; label: string; on: boolean };

export function TvShell({ children }: { children: React.ReactNode }) {
  const { t, user } = useSession();
  const path = usePathname();
  const entries: Entry[] = [
    { href: '/tv', icon: 'home', label: t('tv.home'), on: true },
    { href: '/tv/account', icon: 'user', label: user ? t('tv.account') : t('tv.login'), on: true },
  ];
  return (
    <View style={{ flex: 1, flexDirection: 'row', backgroundColor: colors.bg }}>
      <View style={{ width: 210, paddingVertical: 28, paddingHorizontal: 14, gap: 8, borderEndWidth: 1, borderColor: colors.borderSoft, backgroundColor: colors.nav }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 8, paddingBottom: 18 }}>
          <Image source={require('../../../assets/brand/emblem.png')} style={{ width: 34, height: 36 }} contentFit="contain" />
          <Image source={require('../../../assets/brand/wordmark.png')} style={{ width: 110, height: 22 }} contentFit="contain" />
        </View>
        {entries.filter((e) => e.on).map((e) => {
          const active = e.href === '/tv' ? path === '/tv' : path.startsWith(e.href);
          return (
            <Focusable key={e.href} accessibilityRole="link" accessibilityLabel={e.label} onPress={() => router.replace(e.href as never)}
              style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 12, paddingHorizontal: 12, backgroundColor: active ? colors.panel : 'transparent' }}>
              <Feather name={e.icon} size={22} color={active ? colors.goldLight : colors.text2} />
              <Txt weight="bold" size={17} color={active ? colors.goldLight : colors.text}>{e.label}</Txt>
            </Focusable>
          );
        })}
      </View>
      <View style={{ flex: 1 }}>{children}</View>
    </View>
  );
}
