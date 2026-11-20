// Commandes du lecteur intégré (YouTube, Vimeo, Dailymotion, directs) sur la télé (refonte TV-R) : titre en haut, boutons ronds
// en bas sur un dégradé sombre. Elles s'effacent après 5 s sans action ; toute flèche ou OK de la télécommande les fait revenir
// (les boutons gardent le focus même effacés). Le lecteur natif (vidéos du serveur) garde ses propres commandes Android.
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useSession } from '@/lib/session';
import { tvc, useTv } from '@/lib/tvTheme';
import { Txt } from '@/components/ui';
import { TvButton } from './TvButton';

export const TV_BAR_HIDE_MS = 5000;

type Props = {
  title?: string;
  subtitle?: string;
  playing: boolean;
  onToggle: () => void;
  /** Absent pour un direct (pas d'avance ni de recul). */
  onSeekBy?: (sec: number) => void;
  accent?: string;
  onAccent?: string;
};

export function TvPlayerBar({ title, subtitle, playing, onToggle, onSeekBy, accent, onAccent }: Props) {
  const { t, dirStyle } = useSession();
  const { u } = useTv();
  const [shown, setShown] = useState(true);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const wake = useCallback(() => {
    setShown(true);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setShown(false), TV_BAR_HIDE_MS);
  }, []);
  useEffect(() => { wake(); return () => { if (timer.current) clearTimeout(timer.current); }; }, [wake]);
  // Pause : les commandes restent affichées.
  useEffect(() => { if (!playing) { if (timer.current) clearTimeout(timer.current); setShown(true); } else wake(); }, [playing, wake]);
  const act = (fn: () => void) => () => { fn(); wake(); };
  return (
    <View pointerEvents="box-none" style={[{ position: 'absolute', top: 0, bottom: 0, left: 0, right: 0, opacity: shown ? 1 : 0 }, dirStyle]}>
      <LinearGradient pointerEvents="none" colors={['rgba(0,0,0,0.75)', 'rgba(0,0,0,0)']} style={{ position: 'absolute', top: 0, left: 0, right: 0, height: u(240) }} />
      <LinearGradient pointerEvents="none" colors={['rgba(0,0,0,0)', 'rgba(0,0,0,0.9)']} style={{ position: 'absolute', bottom: 0, left: 0, right: 0, height: u(360) }} />
      {title ? (
        <View pointerEvents="none" style={{ position: 'absolute', top: u(54), start: u(96), end: u(96), gap: u(10) }}>
          {subtitle ? <Txt weight="bold" size={u(22)} color={tvc.text2} numberOfLines={1}>{subtitle}</Txt> : null}
          <Txt weight="extrabold" size={u(40)} numberOfLines={1}>{title}</Txt>
        </View>
      ) : null}
      <View style={{ position: 'absolute', bottom: u(54), start: u(96), end: u(96), flexDirection: 'row', alignItems: 'center', gap: u(22) }}>
        {onSeekBy ? <TvButton circle text="−10" label={t('tv.back10')} onFocus={wake} onPress={act(() => onSeekBy(-10))} /> : null}
        <TvButton first circle big icon={playing ? 'pause' : 'play'} label={playing ? t('tv.pause') : t('tv.play')} onFocus={wake} onPress={act(onToggle)} accent={accent} onAccent={onAccent} />
        {onSeekBy ? <TvButton circle text="+10" label={t('tv.fwd10')} onFocus={wake} onPress={act(() => onSeekBy(10))} /> : null}
      </View>
    </View>
  );
}
