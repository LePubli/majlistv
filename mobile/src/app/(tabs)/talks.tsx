// Conférences : recherche, filtre par catégorie, liste qui se charge au fil du défilement.
import React, { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, FlatList, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import { useSession } from '@/lib/session';
import { useAsync } from '@/lib/useAsync';
import type { Card, Category } from '@/lib/types';
import { colors, fonts, radius } from '@/lib/theme';
import { Chip, ErrorBox, Loading, Txt, screenStyle, titleStyle } from '@/components/ui';
import { TalkCard } from '@/components/TalkCard';
import { Text } from 'react-native';

const PAGE = 20;

export default function TalksScreen() {
  const { api, t, dirStyle, isRTL } = useSession();
  const [q, setQ] = useState('');
  const [query, setQuery] = useState(''); // valeur envoyée au serveur (après une courte pause de frappe)
  const [category, setCategory] = useState<number | null>(null);
  const [items, setItems] = useState<Card[]>([]);
  const [more, setMore] = useState(true);
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  const run = useRef(0);

  useEffect(() => { const id = setTimeout(() => setQuery(q.trim()), 350); return () => clearTimeout(id); }, [q]);

  const cats = useAsync(async () => (await api.get<Category[]>('/categories').catch(() => [])).filter((c) => c.parentId == null), []);

  async function load(reset: boolean) {
    const id = ++run.current;
    setBusy(true);
    setFailed(false);
    try {
      const offset = reset ? 0 : items.length;
      const rows = await api.get<Card[]>('/talks', { q: query || undefined, category: category ?? undefined, limit: PAGE, offset });
      if (id !== run.current) return;
      setItems(reset ? rows : [...items, ...rows]);
      setMore(rows.length === PAGE);
    } catch {
      if (id === run.current) setFailed(true);
    } finally {
      if (id === run.current) setBusy(false);
    }
  }

  useEffect(() => { void load(true); }, [query, category]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <SafeAreaView style={[screenStyle, dirStyle]} edges={['top']}>
      <View style={{ paddingHorizontal: 18, paddingTop: 14, gap: 12 }}>
        <Text style={titleStyle}>{t('tabs.talks')}</Text>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 48, paddingHorizontal: 16, borderRadius: radius.pill, backgroundColor: colors.panel, borderWidth: 1, borderColor: colors.border }}>
          <Feather name="search" size={18} color={colors.muted} />
          <TextInput
            value={q}
            onChangeText={setQ}
            placeholder={t('talks.search')}
            placeholderTextColor={colors.muted}
            returnKeyType="search"
            autoCorrect={false}
            accessibilityLabel={t('talks.search')}
            style={{ flex: 1, color: colors.text, fontFamily: fonts.medium, fontSize: 15, paddingVertical: 10, textAlign: isRTL ? 'right' : 'left' }}
          />
        </View>
        <FlatList
          horizontal
          showsHorizontalScrollIndicator={false}
          data={[{ id: -1, name: t('talks.all') } as { id: number; name: string }, ...(cats.data ?? [])]}
          keyExtractor={(c) => String(c.id)}
          contentContainerStyle={{ gap: 8 }}
          renderItem={({ item }) => (
            <Chip label={item.name} active={(item.id === -1 && category === null) || item.id === category} onPress={() => setCategory(item.id === -1 ? null : item.id)} />
          )}
        />
      </View>

      {items.length === 0 && busy ? <Loading /> : items.length === 0 && failed ? <ErrorBox onRetry={() => load(true)} /> : (
        <FlatList
          data={items}
          keyExtractor={(x) => x.id}
          numColumns={1}
          contentContainerStyle={{ padding: 18, gap: 18 }}
          renderItem={({ item }) => <TalkCard talk={item} />}
          onEndReachedThreshold={0.6}
          onEndReached={() => { if (more && !busy && items.length) void load(false); }}
          ListEmptyComponent={<Txt color={colors.muted}>{t('talks.empty')}</Txt>}
          ListFooterComponent={busy && items.length ? <ActivityIndicator color={colors.gold} style={{ marginVertical: 12 }} /> : undefined}
          keyboardShouldPersistTaps="handled"
        />
      )}
    </SafeAreaView>
  );
}
