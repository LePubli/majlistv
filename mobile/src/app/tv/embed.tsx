// Lecteur plein écran d'une vidéo de plateforme (direct YouTube d'une chaîne) sur la télé : lecteur de la plateforme et,
// par-dessus, nos boutons Lecture / Pause (un direct n'a pas d'avance / recul). « Retour » de la télécommande : écran précédent.
import React, { useRef, useState } from 'react';
import { View } from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import { useSession } from '@/lib/session';
import { validEmbedId, type EmbedMessage } from '@/lib/embed';
import { ExternalVideo, type PlayerHandle } from '@/components/ExternalVideo';
import { TvPlayerBar } from '@/components/tv/TvPlayerBar';
import { TvMessage } from '@/components/tv/TvMessage';

export default function TvEmbed() {
  const { kind, id, title, live } = useLocalSearchParams<{ kind: string; id: string; title?: string; live?: string }>();
  const { t } = useSession();
  const ref = useRef<PlayerHandle>(null);
  const [playing, setPlaying] = useState(true);
  const k = kind === 'vimeo' || kind === 'dailymotion' ? kind : 'youtube';
  if (!validEmbedId(k, id)) return <TvMessage text={t('tv.cannotPlay')} />;
  const onMsg = (m: EmbedMessage) => { if (m.t === 'time' || m.t === 'state') setPlaying(m.playing); };
  return (
    <View style={{ flex: 1, backgroundColor: '#000' }}>
      <ExternalVideo ref={ref} kind={k} id={id} startSeconds={0} limitSeconds={0} onMessage={onMsg} />
      <TvPlayerBar title={title} subtitle={live === '1' ? t('lv.live') : undefined} playing={playing} onToggle={() => (playing ? ref.current?.pause() : ref.current?.play())} />
    </View>
  );
}
