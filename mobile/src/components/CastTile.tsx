// Case « Diffuser » de la fiche : même aspect que les autres cases d'action ; le bouton natif (Chromecast ou AirPlay) est au centre.
import React from 'react';
import { View } from 'react-native';
import { colors } from '@/lib/theme';
import { Txt } from '@/components/ui';

export function CastTile({ label, active, children }: { label: string; active?: boolean; children: React.ReactNode }) {
  return (
    <View
      accessibilityLabel={label}
      style={{ flex: 1, minHeight: 64, borderRadius: 14, alignItems: 'center', justifyContent: 'center', gap: 2, paddingHorizontal: 4,
        backgroundColor: active ? colors.goldTint : colors.panel, borderWidth: 1, borderColor: active ? colors.goldLine : colors.border }}
    >
      <View style={{ width: 28, height: 28 }}>{children}</View>
      <Txt weight="bold" size={12} numberOfLines={1} color={active ? colors.goldLight : colors.text}>{label}</Txt>
    </View>
  );
}
