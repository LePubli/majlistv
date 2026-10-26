// Menu latéral (comme le tiroir du site) : pages à découvrir, catégories, compte, langue.
import React from 'react';
import { Linking, Modal, Pressable, ScrollView, View } from 'react-native';
import { Image } from 'expo-image';
import { router } from 'expo-router';
import { Feather } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useSession } from '@/lib/session';
import { useAsync } from '@/lib/useAsync';
import { LOCALES, Locale } from '@/lib/i18n';
import { SITE_URL } from '@/lib/config';
import type { Category } from '@/lib/types';
import { colors } from '@/lib/theme';
import { Button, Chip, Txt } from './ui';

type Item = { key: string; label: string; icon: React.ComponentProps<typeof Feather>['name']; go: () => void; on: boolean };

export function MenuDrawer({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const { t, user, config, feat, api, locale, setLocale, logout, dirStyle } = useSession();
  const insets = useSafeAreaInsets();
  const cats = useAsync(async () => (await api.get<Category[]>('/categories').catch(() => [])).filter((c) => c.parentId == null), []);
  const site = (path: string) => () => { onClose(); void Linking.openURL(`${SITE_URL}${path}`); };
  const nav = (path: Parameters<typeof router.navigate>[0]) => () => { onClose(); router.navigate(path); };

  const items: Item[] = [
    { key: 'home', label: t('home'), icon: 'home', go: nav('/'), on: true },
    { key: 'catalogue', label: t('navCatalogue'), icon: 'film', go: nav('/talks'), on: true },
    { key: 'series', label: t('seriesNav'), icon: 'layers', go: nav('/series'), on: !!config?.hasSeries },
    { key: 'collections', label: t('colNav'), icon: 'folder', go: nav('/collections'), on: feat('collections') },
    { key: 'shorts', label: t('shrTitle'), icon: 'zap', go: nav('/shorts'), on: feat('shorts') },
    { key: 'books', label: t('bkNav'), icon: 'book', go: site('/books'), on: !!config?.hasBooks },
    { key: 'learning', label: t('navLearn'), icon: 'book-open', go: nav('/learn'), on: feat('learning') },
    { key: 'library', label: t('library'), icon: 'bookmark', go: nav('/library'), on: !!user && (feat('favorites') || feat('lists')) },
    { key: 'downloads', label: t('dl.open'), icon: 'download', go: nav('/downloads'), on: feat('offline') },
    { key: 'kids', label: t('kdNav'), icon: 'smile', go: nav('/kids'), on: feat('kids') },
  ];

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={[{ flex: 1, flexDirection: 'row' }, dirStyle]}>
        <View style={{ width: '82%', maxWidth: 360, backgroundColor: colors.bg, borderEndWidth: 1, borderColor: colors.border, paddingTop: insets.top + 8, paddingBottom: insets.bottom + 8 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingBottom: 10 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <Image source={require('../../assets/brand/emblem.png')} style={{ width: 32, height: 34 }} contentFit="contain" />
              <Image source={require('../../assets/brand/wordmark.png')} style={{ width: 88, height: 18 }} contentFit="contain" />
            </View>
            <Pressable accessibilityRole="button" accessibilityLabel={t('hmClose')} onPress={onClose} hitSlop={10}><Feather name="x" size={22} color={colors.text} /></Pressable>
          </View>
          <ScrollView contentContainerStyle={{ paddingHorizontal: 12, paddingBottom: 24, gap: 2 }}>
            <Txt weight="bold" size={11} color={colors.muted} style={{ letterSpacing: 1, textTransform: 'uppercase', padding: 8 }}>{t('hmDiscover')}</Txt>
            {items.filter((i) => i.on).map((i) => (
              <Pressable key={i.key} accessibilityRole="link" onPress={i.go} style={({ pressed }) => ({ minHeight: 48, flexDirection: 'row', alignItems: 'center', gap: 14, paddingHorizontal: 10, borderRadius: 12, backgroundColor: pressed ? colors.panel2 : 'transparent' })}>
                <Feather name={i.icon} size={19} color={colors.goldLight} />
                <Txt weight="medium" size={15}>{i.label}</Txt>
              </Pressable>
            ))}
            {(cats.data ?? []).length > 0 ? (
              <>
                <Txt weight="bold" size={11} color={colors.muted} style={{ letterSpacing: 1, textTransform: 'uppercase', padding: 8, marginTop: 10 }}>{t('msCats')}</Txt>
                {(cats.data ?? []).map((c) => (
                  <Pressable key={c.id} accessibilityRole="link" onPress={() => { onClose(); router.navigate({ pathname: '/talks', params: { cat: String(c.id) } }); }}
                    style={({ pressed }) => ({ minHeight: 44, justifyContent: 'center', paddingHorizontal: 10, borderRadius: 12, backgroundColor: pressed ? colors.panel2 : 'transparent' })}>
                    <Txt size={14} color={colors.text2}>{c.name}</Txt>
                  </Pressable>
                ))}
              </>
            ) : null}
            <View style={{ height: 1, backgroundColor: colors.borderSoft, marginVertical: 12 }} />
            <Pressable accessibilityRole="link" onPress={nav('/account')} style={{ minHeight: 48, flexDirection: 'row', alignItems: 'center', gap: 14, paddingHorizontal: 10 }}>
              <Feather name="user" size={19} color={colors.goldLight} /><Txt weight="medium" size={15}>{user ? t('account') : t('login')}</Txt>
            </Pressable>
            <Pressable accessibilityRole="link" onPress={site('/pricing')} style={{ minHeight: 48, flexDirection: 'row', alignItems: 'center', gap: 14, paddingHorizontal: 10 }}>
              <Feather name="credit-card" size={19} color={colors.goldLight} /><Txt weight="medium" size={15}>{t('pricing')}</Txt>
            </Pressable>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, padding: 10 }}>
              {(Object.keys(LOCALES) as Locale[]).map((l) => <Chip key={l} label={LOCALES[l]} active={l === locale} onPress={() => setLocale(l)} />)}
            </View>
            <View style={{ paddingHorizontal: 10, gap: 10 }}>
              {!user ? <Button label={t('hmSubscribe')} onPress={() => { onClose(); router.push({ pathname: '/login', params: { mode: 'register' } }); }} /> : <Button label={t('logout')} variant="dark" onPress={() => { onClose(); void logout(); }} />}
            </View>
          </ScrollView>
        </View>
        <Pressable accessibilityLabel={t('hmClose')} onPress={onClose} style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.6)' }} />
      </View>
    </Modal>
  );
}
