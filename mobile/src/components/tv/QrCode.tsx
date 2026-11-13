// QR code dessiné avec de simples carrés (aucune dépendance native) : modules calculés par qrcode-generator (JavaScript pur).
import React, { useMemo } from 'react';
import { View } from 'react-native';
import { qrMatrix } from '@/lib/qr';

export function QrCode({ value, size = 240 }: { value: string; size?: number }) {
  const m = useMemo(() => qrMatrix(value), [value]);
  const cell = Math.max(2, Math.floor(size / m.length));
  return (
    <View accessibilityRole="image" style={{ width: cell * m.length, height: cell * m.length, backgroundColor: '#fff' }}>
      {m.map((row, r) => (
        <View key={r} style={{ flexDirection: 'row' }}>
          {row.map((dark, c) => <View key={c} style={{ width: cell, height: cell, backgroundColor: dark ? '#000' : '#fff' }} />)}
        </View>
      ))}
    </View>
  );
}
