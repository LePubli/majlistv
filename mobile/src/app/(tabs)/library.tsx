// Bibliothèque — étape N7 (16/11), comme le site (étape N5) : 4 onglets — Reprendre · Ma liste (favoris + « plus tard » réunis)
// · Listes (listes personnelles ; le contenu d'une liste s'ouvre sur son écran) · Notes (notes et marque-pages de toutes les vidéos).
// Anciens liens : ?tab=fav et ?tab=later → Ma liste.
import React, { useState } from 'react';
import { FlatList, Pressable, ScrollView, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { Feather } from '@expo/vector-icons';
import { useSession } from '@/lib/session';
import { useAsync } from '@/lib/useAsync';
import { ApiError } from '@/lib/api';
import type { Card, ListsResponse } from '@/lib/types';
import { colors } from '@/lib/theme';
import { Button, Chip, ErrorBox, Field, Loading, Panel, Txt, screenStyle, Title } from '@/components/ui';
import { TalkCard } from '@/components/TalkCard';
import { progressOf } from '@/lib/media';
import { libTabOf, mergeMyList, type LibTab, type MyListItem } from '@/lib/mylist';
import { clock } from '@/lib/learnHub';

export default function LibraryScreen() {
  const { user, t, dirStyle, feat } = useSession();
  const params = useLocalSearchParams<{ tab?: string }>();
  const listOn = feat('favorites') || feat('watchlater');
  const tabs: [LibTab, string][] = [
    ['resume', t('tbResume')],
    ...(listOn ? [['list', t('lbMyList')] as [LibTab, string]] : []),
    ...(feat('lists') ? [['lists', t('lib.lists')] as [LibTab, string]] : []),
    ...(feat('notes') ? [['notes', t('tbNotes')] as [LibTab, string]] : []),
  ];
  const valid = (x: LibTab) => (tabs.some(([k]) => k === x) ? x : 'resume');
  const [tab, setTab] = useState<LibTab>(() => valid(libTabOf(params.tab)));
  // Ouverture depuis l'accueil (« Tout voir » de la rangée « Ma liste ») : l'onglet suit le lien.
  React.useEffect(() => { if (params.tab) setTab(valid(libTabOf(params.tab))); }, [params.tab]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <SafeAreaView style={[screenStyle, dirStyle]} edges={[]}>
      <View style={{ padding: 18, paddingBottom: 8, gap: 14 }}>
        <Title>{t('lib.title')}</Title>
        {user ? (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }} accessibilityRole="tablist">
            {tabs.map(([k, label]) => <Chip key={k} label={label} active={tab === k} onPress={() => setTab(k)} />)}
          </ScrollView>
        ) : null}
      </View>
      {!user ? (
        <View style={{ padding: 18 }}>
          <Panel style={{ gap: 14 }}>
            <Txt color={colors.text2}>{t('lib.guest')}</Txt>
            <Button label={t('account.signin')} onPress={() => router.push('/login')} />
          </Panel>
        </View>
      ) : tab === 'list' ? <MyList /> : tab === 'lists' ? <Lists /> : tab === 'notes' ? <Notes /> : <Resume />}
    </SafeAreaView>
  );
}

// « Reprendre » : les vidéos commencées (la plus récente d'abord), avec leur avancement.
function Resume() {
  const { api, user, t } = useSession();
  const cont = useAsync(() => api.get<Card[]>('/me/continue'), [user?.id]);
  useFocusEffect(React.useCallback(() => { void cont.reload(); }, [])); // eslint-disable-line react-hooks/exhaustive-deps
  if (cont.loading && !cont.data) return <Loading />;
  if (!cont.data) return <ErrorBox onRetry={cont.reload} />;
  return (
    <FlatList
      data={cont.data}
      keyExtractor={(c) => c.id}
      contentContainerStyle={{ padding: 18, gap: 18, paddingBottom: 40 }}
      ListEmptyComponent={(
        <Panel style={{ gap: 12 }}>
          <Txt color={colors.text2}>{t('nothingToContinue')}</Txt>
          <Button label={t('esFindTalk')} variant="dark" onPress={() => router.navigate('/talks')} />
        </Panel>
      )}
      renderItem={({ item }) => <TalkCard talk={item} progress={progressOf(item)} />}
      onRefresh={cont.reload}
      refreshing={cont.loading}
    />
  );
}

// « Ma liste » : favoris et « plus tard » ensemble, la plus récente d'abord ; « Retirer » enlève des deux.
function MyList() {
  const { api, user, t, feat, inMyList, toggleMyList } = useSession();
  const list = useAsync(async () => {
    const [l, f] = await Promise.all([
      feat('watchlater') ? api.get<Card[]>('/me/watchlater').catch(() => [] as Card[]) : Promise.resolve([] as Card[]),
      feat('favorites') ? api.get<Card[]>('/me/favorites').catch(() => [] as Card[]) : Promise.resolve([] as Card[]),
    ]);
    return mergeMyList(l, f);
  }, [user?.id]);
  useFocusEffect(React.useCallback(() => { void list.reload(); }, [])); // eslint-disable-line react-hooks/exhaustive-deps
  async function drop(x: MyListItem) {
    list.setData((l) => (l ?? []).filter((y) => y.id !== x.id));
    if (inMyList(x.id)) await toggleMyList(x.id);
    else {
      if (x.srcs.includes('fav')) await api.del(`/me/favorites/${x.id}`).catch(() => {});
      if (x.srcs.includes('later')) await api.del(`/me/watchlater/${x.id}`).catch(() => {});
    }
  }
  if (list.loading && !list.data) return <Loading />;
  if (!list.data) return <ErrorBox onRetry={list.reload} />;
  return (
    <FlatList
      data={list.data}
      keyExtractor={(c) => c.id}
      contentContainerStyle={{ padding: 18, gap: 18, paddingBottom: 40 }}
      ListHeaderComponent={<Txt size={13} color={colors.muted}>{t('lbMyListIntro')}</Txt>}
      ListEmptyComponent={(
        <Panel style={{ gap: 12 }}>
          <Txt color={colors.text2}>{t('lbMyListEmpty')}</Txt>
          <Button label={t('esFindTalk')} variant="dark" onPress={() => router.navigate('/talks')} />
        </Panel>
      )}
      renderItem={({ item }) => (
        <View style={{ gap: 6 }}>
          <TalkCard talk={item} progress={progressOf(item)} />
          <Pressable accessibilityRole="button" accessibilityLabel={`${t('lbMyListRemove')} : ${item.title}`} onPress={() => { void drop(item); }}
            style={({ pressed }) => ({ alignSelf: 'flex-start', minHeight: 40, flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 12, opacity: pressed ? 0.7 : 1 })}>
            <Feather name="x-circle" size={16} color={colors.muted} />
            <Txt size={13} weight="bold" color={colors.muted}>{t('lbMyListRemove')}</Txt>
          </Pressable>
        </View>
      )}
      onRefresh={list.reload}
      refreshing={list.loading}
    />
  );
}

// « Notes » : notes et marque-pages de toutes les vidéos ; toucher l'heure rouvre la vidéo à ce passage.
type NoteGroup = { talkId: string; slug?: string | null; title: string; notes: { id: string; positionMs: number; body: string }[] };
function Notes() {
  const { api, user, t } = useSession();
  const groups = useAsync(() => api.get<NoteGroup[]>('/me/notes'), [user?.id]);
  useFocusEffect(React.useCallback(() => { void groups.reload(); }, [])); // eslint-disable-line react-hooks/exhaustive-deps
  async function drop(gid: string, nid: string) {
    groups.setData((l) => (l ?? []).map((g) => (g.talkId === gid ? { ...g, notes: g.notes.filter((n) => n.id !== nid) } : g)).filter((g) => g.notes.length));
    await api.del(`/me/notes/${nid}`).catch(() => {});
  }
  if (groups.loading && !groups.data) return <Loading />;
  if (!groups.data) return <ErrorBox onRetry={groups.reload} />;
  return (
    <ScrollView contentContainerStyle={{ padding: 18, gap: 14, paddingBottom: 40 }}>
      {groups.data.length === 0 ? <Txt color={colors.muted}>{t('ntLibEmpty')}</Txt> : null}
      {groups.data.map((g) => (
        <Panel key={g.talkId} style={{ gap: 8 }}>
          <Pressable accessibilityRole="link" onPress={() => router.push({ pathname: '/talk/[id]', params: { id: g.talkId } })}>
            <Txt weight="bold" size={16}>{g.title}</Txt>
          </Pressable>
          {g.notes.map((n) => (
            <View key={n.id} style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 10 }}>
              <Pressable accessibilityRole="link" accessibilityLabel={`${clock(n.positionMs)} : ${g.title}`} onPress={() => router.push({ pathname: '/talk/[id]', params: { id: g.talkId, at: String(n.positionMs) } })} style={{ minHeight: 40, justifyContent: 'center' }}>
                <Txt size={14} weight="bold" color={colors.goldLight} style={{ writingDirection: 'ltr' }}>{n.body ? '📝' : '🔖'} {clock(n.positionMs)}</Txt>
              </Pressable>
              <View style={{ flex: 1, gap: 4, paddingTop: 9 }}>
                <Txt size={14} color={n.body ? colors.text : colors.muted}>{n.body || t('ntBookmark')}</Txt>
                <Txt size={13} weight="bold" color={colors.muted} onPress={() => { void drop(g.talkId, n.id); }} accessibilityRole="button">{t('ntDelete')}</Txt>
              </View>
            </View>
          ))}
        </Panel>
      ))}
    </ScrollView>
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
