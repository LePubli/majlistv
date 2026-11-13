// Chaînes TV en direct 24 h/24 (fonction « livetv ») : en tête de l'écran « En direct ». Onglets = chaînes ; lecteur YouTube du
// direct en cours (retrouvé par le serveur). Liste relue toutes les 5 minutes.
import React, { useEffect, useState } from 'react';
import { View } from 'react-native';
import { useSession } from '@/lib/session';
import { useAsync } from '@/lib/useAsync';
import { validEmbedId } from '@/lib/embed';
import { colors, radius } from '@/lib/theme';
import { Chip, Txt } from '@/components/ui';
import { ExternalVideo } from '@/components/ExternalVideo';

export type LiveChannel = { id: number; name: string; live: boolean; video: { source: 'youtube'; ref: string } | null; title: string };

export function LiveChannels() {
  const { api, t, feat } = useSession();
  const on = feat('livetv');
  const d = useAsync(async () => (on ? (await api.get<{ channels: LiveChannel[] }>('/live').catch(() => ({ channels: [] }))).channels : []), [on]);
  const [cur, setCur] = useState(0);
  useEffect(() => { if (!on) return undefined; const h = setInterval(() => { void d.reload(); }, 5 * 60000); return () => clearInterval(h); }, [on]); // eslint-disable-line react-hooks/exhaustive-deps
  const list = (d.data ?? []).filter((c) => c.video && validEmbedId('youtube', c.video.ref));
  if (!on || list.length === 0) return null;
  const c = list[Math.min(cur, list.length - 1)];
  return (
    <View style={{ gap: 10, paddingBottom: 14 }}>
      <Txt weight="extrabold" size={18}>{t('lv.title')}</Txt>
      {list.length > 1 ? (
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
          {list.map((x, i) => <Chip key={x.id} label={`${x.live ? '● ' : ''}${x.name}`} active={i === cur} onPress={() => setCur(i)} />)}
        </View>
      ) : null}
      <View style={{ aspectRatio: 16 / 9, borderRadius: radius.card, overflow: 'hidden', backgroundColor: '#000' }}>
        <ExternalVideo key={c.id} kind="youtube" id={c.video!.ref} startSeconds={0} limitSeconds={0} onMessage={() => {}} />
      </View>
      <Txt size={13} color={c.live ? '#FF6B6B' : colors.text2} numberOfLines={2}>{c.live ? `● ${t('lv.live')}` : t('lv.notLive')}{c.title ? ` · ${c.title}` : ''}</Txt>
    </View>
  );
}
