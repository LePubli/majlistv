// Bibliothèque : mes favoris et mes listes personnelles (création, suppression ; le contenu d'une liste s'ouvre sur son écran).
import React, { useState } from 'react';
import { FlatList, Pressable, ScrollView, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router, useFocusEffect } from 'expo-router';
import { Feather } from '@expo/vector-icons';
import { Text } from 'react-native';
import { useSession } from '@/lib/session';
import { useAsync } from '@/lib/useAsync';
import { ApiError } from '@/lib/api';
import type { Card, ListsResponse } from '@/lib/types';
import { colors } from '@/lib/theme';
import { Button, Chip, ErrorBox, Field, Loading, Panel, Txt, screenStyle, titleStyle } from '@/components/ui';
import { TalkCard } from '@/components/TalkCard';

export default function LibraryScreen() {
  const { user, t, dirStyle } = useSession();
  const [tab, setTab] = useState<'fav' | 'lists'>('fav');

  return (
    <SafeAreaView style={[screenStyle, dirStyle]} edges={['top']}>
      <View style={{ padding: 18, paddingBottom: 8, gap: 14 }}>
        <Text style={titleStyle}>{t('lib.title')}</Text>
        {user ? (
          <View style={{ flexDirection: 'row', gap: 8 }}>
            <Chip label={t('lib.favorites')} active={tab === 'fav'} onPress={() => setTab('fav')} />
            <Chip label={t('lib.lists')} active={tab === 'lists'} onPress={() => setTab('lists')} />
          </View>
        ) : null}
      </View>
      {!user ? (
        <View style={{ padding: 18 }}>
          <Panel style={{ gap: 14 }}>
            <Txt color={colors.text2}>{t('lib.guest')}</Txt>
            <Button label={t('account.signin')} onPress={() => router.push('/login')} />
          </Panel>
        </View>
      ) : tab === 'fav' ? <Favorites /> : <Lists />}
    </SafeAreaView>
  );
}

function Favorites() {
  const { api, user, t } = useSession();
  const favs = useAsync(() => api.get<Card[]>('/me/favorites'), [user?.id]);
  useFocusEffect(React.useCallback(() => { void favs.reload(); }, [])); // eslint-disable-line react-hooks/exhaustive-deps
  if (favs.loading && !favs.data) return <Loading />;
  if (!favs.data) return <ErrorBox onRetry={favs.reload} />;
  return (
    <FlatList
      data={favs.data}
      keyExtractor={(c) => c.id}
      numColumns={1}
      contentContainerStyle={{ padding: 18, gap: 18, paddingBottom: 40 }}
      ListEmptyComponent={<Txt color={colors.muted}>{t('lib.noFav')}</Txt>}
      renderItem={({ item }) => <TalkCard talk={item} />}
      onRefresh={favs.reload}
      refreshing={favs.loading}
    />
  );
}

function Lists() {
  const { api, user, t, isRTL } = useSession();
  const lists = useAsync(() => api.get<ListsResponse>('/me/lists'), [user?.id]);
  useFocusEffect(React.useCallback(() => { void lists.reload(); }, [])); // eslint-disable-line react-hooks/exhaustive-deps
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');

  async function create() {
    const title = name.trim();
    if (!title) return;
    setBusy(true);
    setMsg('');
    try {
      await api.post('/me/lists', { title });
      setName('');
      await lists.reload();
    } catch (e) {
      setMsg(e instanceof ApiError && e.code === 'limit' ? t('lib.limit') : t('common.error'));
    } finally { setBusy(false); }
  }

  if (lists.loading && !lists.data) return <Loading />;
  if (!lists.data) return <ErrorBox onRetry={lists.reload} />;
  return (
    <ScrollView contentContainerStyle={{ padding: 18, gap: 14, paddingBottom: 40 }}>
      <Panel>
        <Field label={t('lib.listName')} value={name} onChangeText={setName} maxLength={100} onSubmitEditing={create} returnKeyType="done" />
        <Button label={t('lib.create')} onPress={create} loading={busy} disabled={!name.trim()} />
        {msg ? <Txt color={colors.danger} accessibilityRole="alert">{msg}</Txt> : null}
      </Panel>
      {lists.data.lists.length === 0 ? <Txt color={colors.muted}>{t('lib.noLists')}</Txt> : null}
      {lists.data.lists.map((l) => (
        <Pressable key={l.id} accessibilityRole="button" accessibilityLabel={l.title}
          onPress={() => router.push({ pathname: '/list/[id]', params: { id: l.id } })}
          style={({ pressed }) => ({ opacity: pressed ? 0.85 : 1 })}>
          <Panel style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
            <Feather name="list" size={22} color={colors.goldLight} />
            <View style={{ flex: 1, gap: 2 }}>
              <Txt weight="bold" size={16} numberOfLines={1}>{l.title}</Txt>
              <Txt size={13} color={colors.muted}>{t('lib.items', { n: l.items })}</Txt>
            </View>
            <Feather name={isRTL ? 'chevron-left' : 'chevron-right'} size={20} color={colors.muted} />
          </Panel>
        </Pressable>
      ))}
    </ScrollView>
  );
}
