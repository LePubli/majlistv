// Clavier du code parental pour la télécommande : chiffres atteints avec les flèches, OK pour taper. Points au lieu des chiffres.
import React from 'react';
import { View } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { useSession } from '@/lib/session';
import { KC } from '@/lib/kids';
import { Txt } from '@/components/ui';
import { Focusable } from './Focusable';

export function TvPinPad({ value, onChange, max = 6, disabled }: { value: string; onChange: (v: string) => void; max?: number; disabled?: boolean }) {
  const { t } = useSession();
  const keys = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '', '0', '⌫'];
  const press = (k: string) => {
    if (disabled) return;
    if (k === '⌫') onChange(value.slice(0, -1));
    else if (k && value.length < max) onChange(value + k);
  };
  return (
    <View style={{ alignItems: 'center', gap: 16 }}>
      <View style={{ flexDirection: 'row', gap: 12, minHeight: 22 }} accessibilityLabel={`${value.length} / ${max}`}>
        {Array.from({ length: Math.max(4, value.length) }, (_, i) => (
          <View key={i} style={{ width: 18, height: 18, borderRadius: 9, backgroundColor: i < value.length ? KC.accent : 'transparent', borderWidth: 2, borderColor: i < value.length ? KC.accent : KC.line }} />
        ))}
      </View>
      <View style={{ width: 300, flexDirection: 'row', flexWrap: 'wrap', gap: 12, justifyContent: 'center' }}>
        {keys.map((k, i) => k === '' ? <View key={i} style={{ width: 84, height: 56 }} /> : (
          <Focusable key={i} first={i === 0} radius={18} accessibilityRole="button" accessibilityLabel={k === '⌫' ? t('kids.delete') : k} disabled={disabled} onPress={() => press(k)}
            style={{ width: 84, height: 56, alignItems: 'center', justifyContent: 'center', backgroundColor: KC.surface, opacity: disabled ? 0.5 : 1 }}>
            {k === '⌫' ? <Feather name="delete" size={24} color={KC.text} /> : <Txt weight="extrabold" size={24} color={KC.text}>{k}</Txt>}
          </Focusable>
        ))}
      </View>
    </View>
  );
}
