// Éléments communs des écrans Audyn : pochette, barre de position, ligne de livre.
import React, { useState } from 'react';
import { Pressable, View } from 'react-native';
import { Image } from 'expo-image';
import { Feather } from '@expo/vector-icons';
import { useSession } from '@/lib/session';
import { colors, radius } from '@/lib/theme';
import { Txt } from '@/components/ui';

export function Cover({ url, size, radiusPx }: { url: string | null; size: number; radiusPx?: number }) {
  const r = radiusPx ?? radius.card;
  return url
    ? <Image source={{ uri: url }} style={{ width: size, height: size, borderRadius: r, backgroundColor: colors.panel2 }} contentFit="cover" accessibilityIgnoresInvertColors />
    : (
      <View style={{ width: size, height: size, borderRadius: r, backgroundColor: colors.panel2, borderWidth: 1, borderColor: colors.border, alignItems: 'center', justifyContent: 'center' }}>
        <Feather name="headphones" size={Math.round(size / 3)} color={colors.gold} />
      </View>
    );
}

/** Barre de position : toucher pour se placer. `onSeek` reçoit des secondes. */
export function SeekBar({ pos, dur, onSeek, label }: { pos: number; dur: number; onSeek: (sec: number) => void; label: string }) {
  const { isRTL } = useSession();
  const [w, setW] = useState(0);
  const pct = dur > 0 ? Math.max(0, Math.min(1, pos / dur)) : 0;
  return (
    <Pressable accessibilityRole="adjustable" accessibilityLabel={label} accessibilityValue={{ min: 0, max: Math.round(dur), now: Math.round(pos) }}
      onLayout={(e) => setW(e.nativeEvent.layout.width)}
      onPress={(e) => { if (w > 0 && dur > 0) { const x = e.nativeEvent.locationX / w; onSeek((isRTL ? 1 - x : x) * dur); } }}
      style={{ height: 44, justifyContent: 'center' }}>
      <View style={{ height: 6, borderRadius: 3, backgroundColor: colors.border, overflow: 'hidden', flexDirection: 'row' }}>
        <View style={{ width: `${pct * 100}%`, backgroundColor: colors.gold }} />
      </View>
      <View pointerEvents="none" style={{ position: 'absolute', start: 0, end: 0, flexDirection: 'row' }}>
        <View style={{ width: `${pct * 100}%` }} />
        <View style={{ width: 14, height: 14, borderRadius: 7, marginStart: -7, backgroundColor: colors.goldLight }} />
      </View>
    </Pressable>
  );
}

export function RoundBtn({ icon, label, onPress, big, disabled }: { icon: React.ComponentProps<typeof Feather>['name']; label: string; onPress: () => void; big?: boolean; disabled?: boolean }) {
  const s = big ? 72 : 52;
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={label} accessibilityState={{ disabled: !!disabled }} disabled={disabled} onPress={onPress} hitSlop={6}
      style={({ pressed }) => ({ width: s, height: s, borderRadius: s / 2, alignItems: 'center', justifyContent: 'center', opacity: disabled ? 0.35 : pressed ? 0.8 : 1,
        backgroundColor: big ? colors.gold : colors.panel, borderWidth: big ? 0 : 1, borderColor: colors.border })}>
      <Feather name={icon} size={big ? 30 : 22} color={big ? colors.onGold : colors.text} />
    </Pressable>
  );
}
