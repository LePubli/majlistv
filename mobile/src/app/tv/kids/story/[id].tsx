// Histoire du soir sur la télé (refonte TV-R) : couverture, « Écouter » / « Reprendre », parties ; la lecture s'ouvre sur l'écran
// « En écoute » aux couleurs Kids.
import React, { useEffect, useState } from 'react';
import { View } from 'react-native';
import { Redirect, router, useLocalSearchParams } from 'expo-router';
import { useSession } from '@/lib/session';
import { useKid } from '@/lib/kidSession';
import { useAsync } from '@/lib/useAsync';
import { useAudyn } from '@/lib/audynPlayer';
import { audynResumeId, type AudynDetail } from '@/lib/audyn';
import { KC } from '@/lib/kids';
import { Txt } from '@/components/ui';
import { TvBookView } from '@/components/tv/TvBookView';
import { TV_KIDS_BOOK } from '@/components/tv/TvKidCard';

export default function TvKidsStory() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { t } = useSession();
  const { kid, kidApi, epoch } = useKid();
  const au = useAudyn();
  const [saved, setSaved] = useState(false);
  const d = useAsync(async () => {
    const r = await kidApi.get<AudynDetail>(`/kids/stories/${id}`);
    return { ...r, kids: true, resumeId: `kid-${kid?.profile.id}-${r.id}` } as AudynDetail;
  }, [id, kid?.profile.id, epoch]); // eslint-disable-line react-hooks/exhaustive-deps
  const b = d.data;
  useEffect(() => { if (b) void au.savedFor(audynResumeId(b)).then((s) => setSaved(!!s)); }, [b?.id]); // eslint-disable-line react-hooks/exhaustive-deps
  if (!kid) return <Redirect href="/tv/kids" />;
  if (!b) return <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: KC.bg }}><Txt color={KC.text2}>{d.error ? t('common.error') : '…'}</Txt></View>;
  const first = Math.max(0, b.chapters.findIndex((c) => c.playable));
  const go = async (fn: () => Promise<void>) => { await fn(); router.push('/tv/kids/listen'); };
  return (
    <TvBookView b={b} pal={TV_KIDS_BOOK} by={b.narrator ? t('aud.by', { name: b.narrator }) : ''} saved={saved}
      onListen={() => { void go(() => (saved ? au.openResume(b) : au.open(b, first, 0))); }}
      onChapter={(i) => { void go(() => au.open(b, i, 0)); }} />
  );
}
