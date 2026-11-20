// Bouton de la télé (refonte TV-R) : pilule translucide ; quand on l'atteint à la télécommande, elle devient blanche avec un halo bleu.
// `circle` : bouton rond avec une seule icône (Ma liste, −10 s…) ; `label` sert alors de nom lu par l'accessibilité.
import React from 'react';
import { View } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { tvc, useTv } from '@/lib/tvTheme';
import { Txt } from '@/components/ui';
import { Focusable } from './Focusable';

type Props = {
  label: string;
  onPress: () => void;
  icon?: React.ComponentProps<typeof Feather>['name'];
  first?: boolean;
  circle?: boolean;
  /** Texte court dans le rond (« −10 ») à la place de l'icône. */
  text?: string;
  big?: boolean;
  disabled?: boolean;
  /** Couleurs Kids (or vif) : `accent` remplace le blanc du focus. */
  accent?: string;
  onAccent?: string;
  onFocus?: () => void;
};

export function TvButton({ label, onPress, icon, first, circle, text, big, disabled, accent = tvc.text, onAccent = tvc.onLight, onFocus }: Props) {
  const { u } = useTv();
  const h = u(big ? 92 : circle ? 76 : 76);
  return (
    <Focusable first={first} ring={false} scale={1.06} radius={999} disabled={disabled} accessibilityRole="button" accessibilityLabel={label}
      accessibilityState={{ disabled: !!disabled }} onPress={onPress} onFocus={() => onFocus?.()} style={{ opacity: disabled ? 0.45 : 1 }}>
      {(on) => {
        const fg = on ? onAccent : tvc.text;
        return (
          <View style={{
            height: h, minWidth: h, borderRadius: 999, paddingHorizontal: circle ? 0 : u(38), flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: u(14),
            backgroundColor: on ? accent : tvc.glass, borderWidth: u(6), borderColor: on ? (accent === tvc.text ? tvc.halo : 'rgba(255,255,255,0.4)') : 'transparent',
          }}>
            {text ? <Txt weight="bold" size={u(20)} color={fg}>{text}</Txt> : icon ? <Feather name={icon} size={u(big ? 34 : 26)} color={fg} /> : null}
            {!circle ? <Txt weight="bold" size={u(26)} color={fg} numberOfLines={1}>{label}</Txt> : null}
          </View>
        );
      }}
    </Focusable>
  );
}
