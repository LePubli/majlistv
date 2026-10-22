// Accueil : comme celui du site. Bannière, « À réviser » / « Quiz à rattraper » / « Continuer à regarder », explorer par format,
// rangées du catalogue (séries comprises), bande Kids, citation du jour. Visiteur : même accueil avec invitation à créer un compte.
import React, { useCallback, useState } from 'react';
import { RefreshControl, ScrollView, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router, useFocusEffect } from 'expo-router';
import { useSession } from '@/lib/session';
import { useAsync } from '@/lib/useAsync';
import { useDownloads } from '@/lib/downloadStore';
import { progressOf } from '@/lib/media';
import { isLearningRequired } from '@/lib/learn';
import type { Card, Citation, Home, KidsHome, RevisionResponse } from '@/lib/types';
import { colors } from '@/lib/theme';
import { Button, ErrorBox, Loading, Panel, Txt, screenStyle } from '@/components/ui';
import { Hero } from '@/components/Hero';
import { Rail } from '@/components/Rail';
import { SeriesCard } from '@/components/SeriesCard';
import { TalkCard } from '@/components/TalkCard';
import { CitationCard } from '@/components/CitationCard';
import { FormatTiles, KidsBand } from '@/components/HomeBands';

export default function HomeScreen() {
  const { api, user, t, config, feat, dirStyle } = useSession();
  const dls = useDownloads();
  const home = useAsync(() => api.get<Home>('/home'), [user?.id]);
  const cont = useAsync(async () => (user ? await api.get<Card[]>('/me/continue').catch(() => []) : []), [user?.id]);
  const review = useAsync(async () => (user ? await api.get<RevisionResponse>('/me/revision').then((r) => r.items).catch((e) => (isLearningRequired(e) ? [] : [])) : []), [user?.id]);
  const todo = useAsync(async () => (user ? await api.get<Card[]>('/me/quiz/todo').catch(() => []) : []), [user?.id]);
  const kids = useAsync(async () => (feat('kids') ? await api.get<KidsHome>('/home/kids', undefined, false).catch(() => null) : null), [feat('kids')]); // eslint-disable-line react-hooks/exhaustive-deps
  const cit = useAsync(async () => (feat('citations') ? await api.get<Citation>('/citation/today', undefined, false).catch(() => null) : null), [feat('citations')]); // eslint-disable-line react-hooks/exhaustive-deps
  const [refreshing, setRefreshing] = useState(false);

  // Au retour sur l'accueil (après avoir regardé), « Continuer à regarder » se met à jour.
  useFocusEffect(useCallback(() => { void cont.reload(); void todo.reload(); }, [user?.id])); // eslint-disable-line react-hooks/exhaustive-deps

  if (home.loading && !home.data) return <SafeAreaView style={[screenStyle, dirStyle]} edges={[]}><Loading /></SafeAreaView>;
  if (!home.data) {
    // Hors connexion : l'accueil ne peut pas se charger, mais les téléchargements restent accessibles (22b-6).
    return (
      <SafeAreaView style={[screenStyle, dirStyle]}>
        <ErrorBox onRetry={home.reload} />
        {dls.records.length ? <View style={{ padding: 18 }}><Button label={t('dl.open')} onPress={() => router.push('/downloads')} /></View> : null}
      </SafeAreaView>
    );
  }
  const rows = home.data.rows ?? [];
  const trial = config?.trialDays ?? 0;

  return (
    <View style={[screenStyle, dirStyle]}>
      <ScrollView
        contentContainerStyle={{ paddingBottom: 40, gap: 22 }}
        refreshControl={<RefreshControl refreshing={refreshing} tintColor={colors.gold} onRefresh={async () => { setRefreshing(true); await Promise.all([home.reload(), cont.reload(), review.reload(), todo.reload()]); setRefreshing(false); }} />}
      >
        <Hero hero={home.data.hero} />

        {(review.data ?? []).length > 0 ? <Rail title={<>{t('revRow')}</>} items={review.data ?? []} onSeeAll={() => router.navigate('/learn')} seeAllLabel={t('lrTitle')} render={(x, w) => <TalkCard talk={x} width={w} />} /> : null}
        {(todo.data ?? []).length > 0 ? <Rail title={t('qpTodoRow')} items={todo.data ?? []} onSeeAll={() => router.navigate('/learn')} seeAllLabel={t('navLearn')} render={(x, w) => <TalkCard talk={x} width={w} />} /> : null}
        {(cont.data ?? []).length > 0 ? <Rail title={t('continueWatching')} items={cont.data ?? []} onSeeAll={() => router.navigate('/library')} seeAllLabel={t('library')} render={(x, w) => <TalkCard talk={x} width={w} progress={progressOf(x)} />} /> : null}

        {user ? <FormatTiles /> : null}

        {rows.length === 0 ? <Txt color={colors.muted} style={{ paddingHorizontal: 16 }}>{t('noTalks')}</Txt> : null}
        {rows.map((r, i) => (
          <React.Fragment key={r.key}>
            {r.key === 'series' ? (
              <Rail title={t('rowSeries')} items={r.series ?? []} onSeeAll={() => router.navigate('/series')} render={(x, w) => <SeriesCard series={x} width={w} />} />
            ) : (
              <Rail
                title={r.key === 'new' ? t('rowNew') : r.key === 'beginner' ? t('rowBeginner') : (r.title ?? '')}
                badge={r.forYou ? `★ ${t('forYou')}` : null}
                items={r.talks ?? []}
                onSeeAll={r.categoryId && (r.total ?? 0) > (r.talks?.length ?? 0) ? () => router.navigate({ pathname: '/talks', params: { cat: String(r.categoryId) } }) : undefined}
                render={(x, w) => <TalkCard talk={x} width={w} />}
              />
            )}
            {i === 0 ? <KidsBand data={kids.data} /> : null}
          </React.Fragment>
        ))}
        {rows.length === 0 ? <KidsBand data={kids.data} /> : null}

        <CitationCard c={cit.data} />

        {!user ? (
          <Panel style={{ marginHorizontal: 16, gap: 12 }}>
            <Txt weight="bold" size={16}>{t('heroEyebrow')}</Txt>
            <Button label={trial > 0 ? t('heroCta') : t('register')} onPress={() => router.push({ pathname: '/login', params: { mode: 'register' } })} />
            {trial > 0 ? <Txt size={12} color={colors.muted}>{t('heroNote', { n: trial })}</Txt> : null}
          </Panel>
        ) : null}
      </ScrollView>
    </View>
  );
}
