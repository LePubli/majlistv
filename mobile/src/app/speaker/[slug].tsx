// Intervenant / chaîne : présentation, bouton suivre, séries, conférences.
import React, { useState } from 'react';
import { View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { useSession } from '@/lib/session';
import { useAsync } from '@/lib/useAsync';
import type { Card, SpeakerDetail } from '@/lib/types';
import { colors } from '@/lib/theme';
import { Page } from '@/components/Page';
import { Grid } from '@/components/Grid';
import { TalkCard } from '@/components/TalkCard';
import { SeriesCard } from '@/components/SeriesCard';
import { Button, Txt } from '@/components/ui';

export default function SpeakerScreen() {
  const { slug } = useLocalSearchParams<{ slug: string }>();
  const { api, t, user } = useSession();
  const [following, setFollowing] = useState(false);
  const sp = useAsync(() => api.get<SpeakerDetail>(`/channels/${slug}`).catch(() => api.get<SpeakerDetail>(`/speakers/${slug}`)), [slug]);
  const talks = useAsync(async () => (sp.data ? await api.get<Card[]>('/talks', { speaker: sp.data.name, limit: 60 }).catch(() => [] as Card[]) : []), [sp.data?.name]);
  async function toggle() {
    if (!user) { router.push({ pathname: '/login', params: { mode: 'register' } }); return; }
    const next = !following;
    setFollowing(next);
    try { if (next) await api.put(`/speakers/${slug}/follow`); else await api.del(`/speakers/${slug}/follow`); } catch { setFollowing(!next); }
  }
  const d = sp.data;
  return (
    <Page title={d?.name ?? ''} loading={sp.loading && !d} error={!!sp.error && !d} onRetry={sp.reload} onRefresh={sp.reload}>
      {d ? (
        <>
          {d.bio ? <Txt color={colors.text2} style={{ lineHeight: 24 }}>{d.bio}</Txt> : null}
          <Button label={following ? t('nfUnfollow') : t('nfFollow')} variant={following ? 'dark' : 'gold'} onPress={toggle} />
          {d.series?.length ? <View style={{ gap: 10 }}><Txt weight="extrabold" size={18}>{t('seriesNav')}</Txt><Grid items={d.series} render={(s, w) => <SeriesCard series={s} width={w} />} /></View> : null}
          {talks.data?.length ? <View style={{ gap: 10 }}><Txt weight="extrabold" size={18}>{t('navCatalogue')}</Txt><Grid items={talks.data} render={(x, w) => <TalkCard talk={x} width={w} />} /></View> : null}
        </>
      ) : null}
    </Page>
  );
}
