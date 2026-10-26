// Commandes de lecture sous le lecteur (page de lecture « étude ») : barre de progression touchable, temps, −10 s,
// chapitre précédent / suivant, lecture-pause, vitesse. Les mêmes pour la vidéo native et pour YouTube / Vimeo / Dailymotion,
// dont les commandes d'origine sont masquées (une seule barre, celle de l'appli).
import React, { useState } from 'react';
import { Pressable, View } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { useSession } from '@/lib/session';
import { formatClock } from '@/lib/format';
import { colors } from '@/lib/theme';
import { seekFromTouch } from '@/lib/playback';
import { Txt } from '../ui';

export function PlayerControls({ positionSec, durationSec, playing, speed, hasChapters, onToggle, onSeekSec, onPrev, onNext, onSpeed }: {
  positionSec: number; durationSec: number; playing: boolean; speed: number; hasChapters: boolean;
  onToggle: () => void; onSeekSec: (s: number) => void; onPrev: () => void; onNext: () => void; onSpeed: () => void;
}) {
  const { t } = useSession();
  const [width, setWidth] = useState(0);
  const ratio = durationSec > 0 ? Math.min(1, positionSec / durationSec) : 0;
  const round = (extra: object) => ({ width: 48, height: 48, borderRadius: 24, alignItems: 'center', justifyContent: 'center', ...extra } as const);
  return (
    <View style={{ paddingHorizontal: 16, paddingTop: 6, paddingBottom: 10, backgroundColor: colors.panel, borderBottomWidth: 1, borderBottomColor: colors.border }}>
      {/* La barre reste de gauche à droite, y compris en arabe (usage des lecteurs vidéo). */}
      <Pressable
        accessibilityRole="adjustable" accessibilityLabel={t('talk.seekBar')} accessibilityValue={{ min: 0, max: Math.round(durationSec), now: Math.round(positionSec) }}
        onLayout={(e) => setWidth(e.nativeEvent.layout.width)}
        onPress={(e) => onSeekSec(seekFromTouch(e.nativeEvent.locationX, width, durationSec))}
        style={{ height: 28, justifyContent: 'center', direction: 'ltr' }}
      >
        <View style={{ height: 4, borderRadius: 2, backgroundColor: colors.border }}>
          <View style={{ width: `${ratio * 100}%`, height: 4, borderRadius: 2, backgroundColor: colors.gold }} />
        </View>
        <View style={{ position: 'absolute', left: `${ratio * 100}%`, marginLeft: -6, width: 12, height: 12, borderRadius: 6, backgroundColor: colors.gold }} />
      </Pressable>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', direction: 'ltr' }}>
        <Txt size={12} color={colors.muted}>{formatClock(positionSec)}</Txt>
        <Txt size={12} color={colors.muted}>{durationSec > 0 ? formatClock(durationSec) : '--:--'}</Txt>
      </View>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 2, direction: 'ltr' }}>
        <Pressable accessibilityRole="button" accessibilityLabel={t('talk.back10')} onPress={() => onSeekSec(Math.max(0, positionSec - 10))} style={round({ borderWidth: 1, borderColor: colors.border })}>
          <Txt weight="bold" size={12}>−10</Txt>
        </Pressable>
        <Pressable accessibilityRole="button" accessibilityLabel={t('talk.prevCh')} disabled={!hasChapters} onPress={onPrev} style={round({ opacity: hasChapters ? 1 : 0.35 })}>
          <Feather name="skip-back" size={22} color={colors.text} />
        </Pressable>
        <Pressable accessibilityRole="button" accessibilityLabel={playing ? t('talk.pause') : t('talk.play')} onPress={onToggle}
          style={({ pressed }) => ({ width: 60, height: 60, borderRadius: 30, backgroundColor: colors.gold, alignItems: 'center', justifyContent: 'center', opacity: pressed ? 0.85 : 1 })}>
          <Feather name={playing ? 'pause' : 'play'} size={26} color={colors.onGold} />
        </Pressable>
        <Pressable accessibilityRole="button" accessibilityLabel={t('talk.nextCh')} disabled={!hasChapters} onPress={onNext} style={round({ opacity: hasChapters ? 1 : 0.35 })}>
          <Feather name="skip-forward" size={22} color={colors.text} />
        </Pressable>
        <Pressable accessibilityRole="button" accessibilityLabel={`${t('talk.speed')} ${speed}×`} onPress={onSpeed} style={round({ borderWidth: 1, borderColor: colors.border })}>
          <Txt weight="extrabold" size={13}>{speed}×</Txt>
        </Pressable>
      </View>
    </View>
  );
}
