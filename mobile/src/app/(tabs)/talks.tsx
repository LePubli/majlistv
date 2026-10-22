// Catalogue : titre, accès à la recherche, filtres (catégorie, format, niveau), liste en grille qui se charge au fil du défilement.
import React, { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, View, useWindowDimensions } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router, useLocalSearchParams } from 'expo-router';
import { Feather } from '@expo/vector-icons';
import { useSession } from '@/lib/session';
import { useAsync } from '@/lib/useAsync';
import type { Card, Category, FormatItem } from '@/lib/types';
import { colors, radius } from '@/lib/theme';
import { Chip, ErrorBox, Loading, Title, Txt, screenStyle } from '@/components/ui';
import { TalkCard } from '@/components/TalkCard';

const PAGE = 24;
const LEVELS = ['beginner', 'intermediate', 'advanced'] as const;
const LEVEL_KEY = { beginner: 'lvBeginner', intermediate: 'lvInter', advanced: 'lvAdvanced' } as const;

export default function CatalogueScreen() {
  const { api, t, dirStyle, locale } = useSession();
  const params = useLocalSearchParams<{ cat?: string; format?: string }>();
  const [category, setCategory] = useState<number | null>(params.cat ? Number(params.cat) : null);
  const [format, setFormat] = useState<string | null>(params.format ?? null);
  const [level, setLevel] = useState<string | null>(null);
  const [items, setItems] = useState<Card[]>([]);
  const [more, setMore] = useState(true);
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  const run = useRef(0);
  const { width } = useWindowDimensions();
  const cols = width >= 1000 ? 5 : width >= 700 ? 4 : width >= 480 ? 3 : 2;
  const cardW = Math.floor((width - 32 - 12 * (cols - 1)) / cols);

  // Les liens du menu et de l'accueil changent les filtres même si l'onglet est déjà ouvert.
  useEffect(() => { setCategory(params.cat ? Number(params.cat) : null); setFormat(params.format ?? null); }, [params.cat, params.format]);

  const cats = useAsync(async () => (await api.get<Category[]>('/categories').catch(() => [])).filter((c) => c.parentId == null), []);
  const formats = useAsync(async () => await api.get<FormatItem[]>('/formats', { used: 1 }).catch(() => [] as FormatItem[]), []);

  async function load(reset: boolean) {
    const id = ++run.current;
    setBusy(true); setFailed(false);
    try {
      const offset = reset ? 0 : items.length;
      const rows = await api.get<Card[]>('/talks', { category: category ?? undefined, format: format ?? undefined, level: level ?? undefined, limit: PAGE, offset });
      if (id !== run.current) return;
      setItems(reset ? rows : [...items, ...rows]);
      setMore(rows.length === PAGE);
    } catch { if (id === run.current) setFailed(true); }
    finally { if (id === run.current) setBusy(false); }
  }
  useEffect(() => { void load(true); }, [category, format, level]); // eslint-disable-line react-hooks/exhaustive-deps

  const fname = (f: FormatItem) => (locale === 'ar' ? f.nameAr : locale === 'en' ? f.nameEn : f.nameFr) || f.nameFr;
  const row = (children: React.ReactNode) => <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>{children}</View>;

  const header = (
    <View style={{ gap: 12, paddingBottom: 8 }}>
      <Title>{t('navCatalogue')}</Title>
      <Pressable accessibilityRole="search" accessibilityLabel={t('hmSearch')} onPress={() => router.push('/search')}
        style={{ flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 48, paddingHorizontal: 16, borderRadius: radius.pill, backgroundColor: colors.panel, borderWidth: 1, borderColor: colors.border }}>
        <Feather name="search" size={18} color={colors.muted} />
        <Txt color={colors.muted}>{t('hmSearch')}</Txt>
      </Pressable>
      {row(<>
        <Chip label={t('talks.all')} active={category === null} onPress={() => setCategory(null)} />
        {(cats.data ?? []).map((c) => <Chip key={c.id} label={c.name} active={category === c.id} onPress={() => setCategory(category === c.id ? null : c.id)} />)}
      </>)}
      {formats.data?.length ? row(formats.data.map((f) => <Chip key={f.slug} label={fname(f)} active={format === f.slug} onPress={() => setFormat(format === f.slug ? null : f.slug)} />)) : null}
      {row(LEVELS.map((l) => <Chip key={l} label={t(LEVEL_KEY[l])} active={level === l} onPress={() => setLevel(level === l ? null : l)} />))}
    </View>
  );

  return (
    <SafeAreaView style={[screenStyle, dirStyle]} edges={[]}>
      {items.length === 0 && failed ? <ErrorBox onRetry={() => load(true)} /> : (
        <FlatList
          key={cols}
          data={items}
          numColumns={cols}
          keyExtractor={(x) => x.id}
          columnWrapperStyle={cols > 1 ? { gap: 12 } : undefined}
          contentContainerStyle={{ padding: 16, gap: 16, paddingBottom: 40 }}
          ListHeaderComponent={header}
          renderItem={({ item }) => <TalkCard talk={item} width={cardW} />}
          onEndReachedThreshold={0.6}
          onEndReached={() => { if (more && !busy && items.length) void load(false); }}
          ListEmptyComponent={busy ? <Loading /> : <Txt color={colors.muted}>{t('talks.empty')}</Txt>}
          ListFooterComponent={busy && items.length ? <ActivityIndicator color={colors.gold} style={{ marginVertical: 12 }} /> : undefined}
          keyboardShouldPersistTaps="handled"
        />
      )}
    </SafeAreaView>
  );
}
