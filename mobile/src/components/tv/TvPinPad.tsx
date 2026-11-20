// Pavé numérique de la télé (code parental) — refonte TV-R : grosses touches arrondies, la touche choisie devient blanche.
import React from 'react';
import { View } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { useSession } from '@/lib/session';
import { KC } from '@/lib/kids';
import { useTv } from '@/lib/tvTheme';
import { Txt } from '@/components/ui';
import { Focusable } from './Focusable';

/** Points du code saisi (au moins 4). */
export function TvPinDots({ value, max = 6 }: { value: string; max?: number }) {
  const { u } = useTv();
  return (
    <View style={{ flexDirection: 'row', gap: u(22), minHeight: u(34) }} accessibilityLabel={`${value.length} / ${max}`}>
      {Array.from({ length: Math.max(4, value.length) }, (_, i) => (
        <View key={i} style={{ width: u(34), height: u(34), borderRadius: u(17), backgroundColor: i < value.length ? '#FFFFFF' : 'transparent', borderWidth: i < value.length ? 0 : u(4), borderColor: KC.line }} />
      ))}
    </View>
  );
}

export function TvPinPad({ value, onChange, max = 6, disabled }: { value: string; onChange: (v: string) => void; max?: number; disabled?: boolean }) {
  const { t } = useSession();
  const { u } = useTv();
  const keys = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '', '0', '⌫'];
  const press = (k: string) => {
    if (disabled) return;
    if (k === '⌫') onChange(value.slice(0, -1));
    else if (k && value.length < max) onChange(value + k);
  };
  const w = u(160);
  return (
    <View style={{ width: w * 3 + u(22) * 2, flexDirection: 'row', flexWrap: 'wrap', gap: u(22) }}>
      {keys.map((k, i) => k === '' ? <View key={i} style={{ width: w, height: u(130) }} /> : (
        <Focusable key={i} first={i === 0} ring={false} scale={1.06} radius={u(32)} accessibilityRole="button" accessibilityLabel={k === '⌫' ? t('kids.delete') : k} disabled={disabled} onPress={() => press(k)}>
          {(on) => (
            <View style={{ width: w, height: u(130), borderRadius: u(32), alignItems: 'center', justifyContent: 'center', opacity: disabled ? 0.5 : 1,
              backgroundColor: on ? '#FFFFFF' : 'rgba(255,255,255,0.09)', borderWidth: u(6), borderColor: on ? 'rgba(69,163,255,0.6)' : 'transparent' }}>
              {k === '⌫' ? <Feather name="delete" size={u(40)} color={on ? KC.bg : KC.text} /> : <Txt weight="extrabold" size={u(54)} color={on ? KC.bg : KC.text}>{k}</Txt>}
            </View>
          )}
        </Focusable>
      ))}
    </View>
  );
}
