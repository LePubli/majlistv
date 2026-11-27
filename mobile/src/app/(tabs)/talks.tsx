// Explorer (ex-Catalogue, 27/11) : sans filtre, les grandes tuiles des thèmes comme sur le site ; un thème choisi ouvre sa liste (filtres format/niveau).
// Avant : titre, accès à la recherche, entrée « En direct » (TV 24 h/24 et événements, étape N1 du 15/11), filtres
// (catégorie, format, niveau), liste en grille qui se charge au fil du défilement.
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
import { ExploreTiles } from '@/components/ExploreTiles';

const PAGE = 24;
const LEVELS = ['beginner', 'intermediate', 'advanced'] as const;
const LEVEL_KEY = { beginner: 'lvBeginner', intermediate: 'lvInter', advanced: 'lvAdvanced' } as const;

export default function CatalogueScreen() {
  const { api, t, dirStyle, locale, feat } = useSession();
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
  useEffect(() => { if (category !== null || format !== null || level !== null) void load(true); }, [category, format, level]); // eslint-disable-line react-hooks/exhaustive-deps

  const fname = (f: FormatItem) => (locale === 'ar' ? f.nameAr : locale === 'en' ? f.nameEn : f.nameFr) || f.nameFr;
  // « En direct » : la page qui réunit TV et événements ; sans la TV, directement les événements.
  const liveHref = feat('livetv') ? '/live' : feat('events') ? '/events' : null;
  const row = (children: React.ReactNode) => <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>{children}</View>;

  // Sans aucun filtre : page Explorer (tuiles des thèmes). Dès qu'un thème, un format ou un niveau est choisi : liste des vidéos.
  const exploring = category === null && format === null && level === null;
  const header = (
    <View style={{ gap: 12, paddingBottom: 8 }}>
      <Title>{t('navExplorer')}</Title>
      <Pressable accessibilityRole="search" accessibilityLabel={t('hmSearch')} onPress={() => router.push('/search')}
        style={{ flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 48, paddingHorizontal: 16, borderRadius: radius.pill, backgroundColor: colors.panel, borderWidth: 1, borderColor: colors.border }}>
        <Feather name="search" size={18} color={colors.muted} />
        <Txt color={colors.muted}>{t('hmSearch')}</Txt>
      </Pressable>
      {liveHref ? (
        <Pressable accessibilityRole="link" accessibilityLabel={t('lv.live')} onPress={() => router.push(liveHref)}
          style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 48, paddingHorizontal: 16, borderRadius: radius.card, backgroundColor: colors.panel, borderWidth: 1, borderColor: colors.border, opacity: pressed ? 0.85 : 1 })}>
          <View style={{ width: 9, height: 9, borderRadius: 5, backgroundColor: '#E5484D' }} />
          <Txt weight="bold" style={{ flex: 1 }}>{t('lv.live')}</Txt>
          <Feather name={dirStyle.direction === 'rtl' ? 'chevron-left' : 'chevron-right'} size={18} color={colors.muted} />
        </Pressable>
      ) : null}
      {feat('collections') ? (
        <Pressable accessibilityRole="link" accessibilityLabel={t('colNav')} onPress={() => router.push('/collections')}
          style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 48, paddingHorizontal: 16, borderRadius: radius.card, backgroundColor: colors.panel, borderWidth: 1, borderColor: colors.border, opacity: pressed ? 0.85 : 1 })}>
          <Feather name="folder" size={16} color={colors.goldLight} />
          <Txt weight="bold" style={{ flex: 1 }}>{t('colNav')}</Txt>
          <Feather name={dirStyle.direction === 'rtl' ? 'chevron-left' : 'chevron-right'} size={18} color={colors.muted} />
        </Pressable>
      ) : null}
      {exploring ? <ExploreTiles onPick={(id) => setCategory(id)} /> : null}
      {exploring ? null : row(<>
        <Chip label={t('ex.back')} active={false} onPress={() => { setCategory(null); setFormat(null); setLevel(null); }} />
        {(cats.data ?? []).map((c) => <Chip key={c.id} label={c.name} active={category === c.id} onPress={() => setCategory(category === c.id ? null : c.id)} />)}
      </>)}
      {exploring ? null : formats.data?.length ? row(formats.data.map((f) => <Chip key={f.slug} label={fname(f)} active={format === f.slug} onPress={() => setFormat(format === f.slug ? null : f.slug)} />)) : null}
      {exploring ? null : row(LEVELS.map((l) => <Chip key={l} label={t(LEVEL_KEY[l])} active={level === l} onPress={() => setLevel(level === l ? null : l)} />))}
    </View>
  );

  return (
    <SafeAreaView style={[screenStyle, dirStyle]} edges={[]}>
      {items.length === 0 && failed ? <ErrorBox onRetry={() => load(true)} /> : (
        <FlatList
          key={cols}
          data={exploring ? [] : items}
          numColumns={cols}
          keyExtractor={(x) => x.id}
          columnWrapperStyle={cols > 1 ? { gap: 12 } : undefined}
          contentContainerStyle={{ padding: 16, gap: 16, paddingBottom: 40 }}
          ListHeaderComponent={header}
          renderItem={({ item }) => <TalkCard talk={item} width={cardW} />}
          onEndReachedThreshold={0.6}
          onEndReached={() => { if (!exploring && more && !busy && items.length) void load(false); }}
          ListEmptyComponent={exploring ? undefined : busy ? <Loading /> : <Txt color={colors.muted}>{t('talks.empty')}</Txt>}
          ListFooterComponent={busy && items.length ? <ActivityIndicator color={colors.gold} style={{ marginVertical: 12 }} /> : undefined}
          keyboardShouldPersistTaps="handled"
        />
      )}
    </SafeAreaView>
  );
}
