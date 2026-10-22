// Éléments d'interface de l'espace enfant : fond bleu nuit, gros boutons, carte de vidéo, clavier du code parental.
import React from 'react';
import { Pressable, StyleProp, View, ViewStyle } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import { useSession } from '@/lib/session';
import { KC } from '@/lib/kids';
import { minutesLabel } from '@/lib/media';
import type { KidCard } from '@/lib/types';
import { Poster } from '@/components/TalkCard';
import { Txt } from '@/components/ui';

export function KTxt(p: React.ComponentProps<typeof Txt>) {
  return <Txt color={KC.text} {...p} />;
}

/** Écran de l'espace enfant : dégradé bleu nuit, zone sûre. */
export function KScreen({ children, edges }: { children: React.ReactNode; edges?: ('top' | 'bottom')[] }) {
  const { dirStyle } = useSession();
  return (
    <View style={[{ flex: 1, backgroundColor: KC.bg }, dirStyle]}>
      <LinearGradient colors={[KC.bgTop, KC.bg, KC.bgBottom]} style={{ position: 'absolute', inset: 0 }} />
      <SafeAreaView style={{ flex: 1 }} edges={edges ?? ['top', 'bottom']}>{children}</SafeAreaView>
    </View>
  );
}

export function KButton({ label, onPress, variant = 'accent', disabled, loading, style, icon }: {
  label: string; onPress?: () => void; variant?: 'accent' | 'soft' | 'ghost'; disabled?: boolean; loading?: boolean; style?: StyleProp<ViewStyle>; icon?: React.ReactNode;
}) {
  const bg = variant === 'accent' ? KC.accent : variant === 'soft' ? KC.surface2 : 'transparent';
  const fg = variant === 'accent' ? KC.onAccent : KC.text;
  return (
    <Pressable
      accessibilityRole="button" accessibilityLabel={label} accessibilityState={{ disabled: !!disabled || !!loading }} disabled={disabled || loading} onPress={onPress}
      style={({ pressed }) => [{
        minHeight: 56, paddingHorizontal: 26, borderRadius: 999, backgroundColor: bg, borderWidth: variant === 'accent' ? 0 : 2, borderColor: KC.line,
        flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, opacity: disabled ? 0.5 : pressed ? 0.85 : 1,
      }, style]}
    >
      {icon}
      <Txt weight="extrabold" size={17} color={fg}>{loading ? '…' : label}</Txt>
    </Pressable>
  );
}

export function KChip({ label, active, onPress }: { label: string; active?: boolean; onPress?: () => void }) {
  return (
    <Pressable accessibilityRole="button" accessibilityState={{ selected: !!active }} onPress={onPress}
      style={{ minHeight: 44, paddingHorizontal: 18, borderRadius: 999, justifyContent: 'center', backgroundColor: active ? KC.accent : KC.surface, borderWidth: active ? 0 : 2, borderColor: KC.line }}>
      <Txt weight="extrabold" size={15} color={active ? KC.onAccent : KC.text2}>{label}</Txt>
    </Pressable>
  );
}

export const starsText = (n: number | null | undefined) => (n ? '⭐'.repeat(Math.min(3, n)) + '☆'.repeat(Math.max(0, 3 - n)) : '');

/** Vignette d'une vidéo pour l'enfant : image, durée, étoiles gagnées, « Vu ✓ », barre de reprise. */
export function KidVideoCard({ x, width, onPress }: { x: KidCard; width?: number; onPress: () => void }) {
  const { t } = useSession();
  const mins = minutesLabel(x.durationSeconds, t);
  const pct = x.durationSeconds && x.positionMs > 0 && !x.completed ? Math.min(1, x.positionMs / 1000 / x.durationSeconds) : 0;
  const stars = starsText(x.stars);
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={x.title} onPress={onPress} style={({ pressed }) => ({ width: width ?? '100%', gap: 6, opacity: pressed ? 0.85 : 1 })}>
      <Poster talk={{ id: x.id, posterUrl: x.posterUrl, source: x.source as 'upload' | 'youtube' | 'vimeo' | 'archive', video_ref: undefined }} radiusPx={18}>
        {x.completed ? (
          <View style={{ position: 'absolute', start: 8, top: 8, paddingHorizontal: 10, paddingVertical: 2, borderRadius: 999, backgroundColor: KC.ok }}>
            <Txt weight="extrabold" size={12} color="#06210F">{t('kdSeen')}</Txt>
          </View>
        ) : null}
        {mins ? (
          <View style={{ position: 'absolute', end: 8, bottom: pct ? 10 : 8, paddingHorizontal: 8, paddingVertical: 2, borderRadius: 8, backgroundColor: 'rgba(7,11,39,0.8)' }}>
            <Txt weight="bold" size={12} color={KC.text}>{mins}</Txt>
          </View>
        ) : null}
        {pct > 0 ? (
          <View style={{ position: 'absolute', start: 0, end: 0, bottom: 0, height: 5, backgroundColor: 'rgba(255,255,255,0.25)' }}>
            <View style={{ width: `${Math.round(pct * 100)}%`, height: 5, backgroundColor: KC.accent }} />
          </View>
        ) : null}
      </Poster>
      <Txt weight="extrabold" size={15} numberOfLines={2} color={KC.text} style={{ marginTop: 2 }}>{x.title}</Txt>
      {stars ? <Txt size={13} color={KC.accent}>{stars}</Txt> : null}
    </Pressable>
  );
}

/** Clavier numérique à gros boutons pour le code parental (4 à 6 chiffres) : points au lieu des chiffres. */
export function PinPad({ value, onChange, max = 6, disabled }: { value: string; onChange: (v: string) => void; max?: number; disabled?: boolean }) {
  const { t } = useSession();
  const keys = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '', '0', '⌫'];
  const press = (k: string) => {
    if (disabled) return;
    if (k === '⌫') onChange(value.slice(0, -1));
    else if (k && value.length < max) onChange(value + k);
  };
  return (
    <View style={{ alignItems: 'center', gap: 18 }}>
      <View style={{ flexDirection: 'row', gap: 12, minHeight: 22 }} accessibilityLabel={`${value.length} / ${max}`}>
        {Array.from({ length: Math.max(4, value.length) }, (_, i) => (
          <View key={i} style={{ width: 18, height: 18, borderRadius: 9, backgroundColor: i < value.length ? KC.accent : 'transparent', borderWidth: 2, borderColor: i < value.length ? KC.accent : KC.line }} />
        ))}
      </View>
      <View style={{ width: 264, flexDirection: 'row', flexWrap: 'wrap', gap: 12, justifyContent: 'center' }}>
        {keys.map((k, i) => k === '' ? <View key={i} style={{ width: 76, height: 64 }} /> : (
          <Pressable key={i} accessibilityRole="button" accessibilityLabel={k === '⌫' ? t('kids.delete') : k} disabled={disabled} onPress={() => press(k)}
            style={({ pressed }) => ({ width: 76, height: 64, borderRadius: 20, alignItems: 'center', justifyContent: 'center', backgroundColor: pressed ? KC.surface2 : KC.surface, borderWidth: 2, borderColor: KC.line, opacity: disabled ? 0.5 : 1 })}>
            {k === '⌫' ? <Feather name="delete" size={24} color={KC.text} /> : <Txt weight="extrabold" size={26} color={KC.text}>{k}</Txt>}
          </Pressable>
        ))}
      </View>
    </View>
  );
}
