// Lecteur plein écran d'une vidéo de plateforme (direct YouTube d'une chaîne) sur la télé : lecteur de la plateforme et,
// en bas, nos boutons Lecture / Pause (un direct n'a pas d'avance / recul). « Retour » de la télécommande : écran précédent.
import React, { useRef, useState } from 'react';
import { View } from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import { useSession } from '@/lib/session';
import { validEmbedId, type EmbedMessage } from '@/lib/embed';
import { colors } from '@/lib/theme';
import { Txt } from '@/components/ui';
import { ExternalVideo, type PlayerHandle } from '@/components/ExternalVideo';
import { Focusable } from '@/components/tv/Focusable';

export default function TvEmbed() {
  const { kind, id, title } = useLocalSearchParams<{ kind: string; id: string; title?: string }>();
  const { t } = useSession();
  const ref = useRef<PlayerHandle>(null);
  const [playing, setPlaying] = useState(true);
  const k = kind === 'vimeo' || kind === 'dailymotion' ? kind : 'youtube';
  if (!validEmbedId(k, id)) return <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}><Txt>{t('tv.cannotPlay')}</Txt></View>;
  const onMsg = (m: EmbedMessage) => { if (m.t === 'time' || m.t === 'state') setPlaying(m.playing); };
  return (
    <View style={{ flex: 1, backgroundColor: '#000' }}>
      <View style={{ flex: 1 }}><ExternalVideo ref={ref} kind={k} id={id} startSeconds={0} limitSeconds={0} onMessage={onMsg} /></View>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 18, padding: 12, backgroundColor: colors.nav }}>
        {title ? <Txt weight="bold" size={16} numberOfLines={1} style={{ flexShrink: 1 }}>{title}</Txt> : null}
        <Focusable first accessibilityRole="button" onPress={() => (playing ? ref.current?.pause() : ref.current?.play())} radius={999}
          style={{ paddingVertical: 10, paddingHorizontal: 28, backgroundColor: colors.gold }}>
          <Txt weight="extrabold" size={18} color="#111">{playing ? `❚❚ ${t('tv.pause')}` : `▶ ${t('tv.play')}`}</Txt>
        </Focusable>
      </View>
    </View>
  );
}
