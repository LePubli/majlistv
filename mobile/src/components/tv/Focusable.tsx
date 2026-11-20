// Élément qu'on atteint et qu'on choisit à la télécommande (refonte TV-R) : quand il a le « focus », cadre blanc et léger
// agrandissement ; les autres restent calmes. `children` peut être une fonction (focus) => contenu, pour changer couleurs et
// textes de l'élément choisi (bouton blanc, titre en blanc…).
import React, { useState } from 'react';
import { Pressable, type PressableProps, type StyleProp, type ViewStyle } from 'react-native';
import { tvc } from '@/lib/tvTheme';

type Props = Omit<PressableProps, 'style' | 'children'> & {
  style?: StyleProp<ViewStyle>;
  focusStyle?: StyleProp<ViewStyle>;
  first?: boolean;
  radius?: number;
  /** Cadre blanc au focus (vrai par défaut ; faux pour les boutons qui deviennent blancs). */
  ring?: boolean;
  /** Agrandissement au focus (1.05 par défaut). */
  scale?: number;
  ringColor?: string;
  children?: React.ReactNode | ((focused: boolean) => React.ReactNode);
};

export function Focusable({ style, focusStyle, first, radius = 12, ring = true, scale = 1.05, ringColor = tvc.text, onFocus, onBlur, children, ...rest }: Props) {
  const [on, setOn] = useState(false);
  return (
    <Pressable
      focusable
      hasTVPreferredFocus={first}
      onFocus={(e) => { setOn(true); onFocus?.(e); }}
      onBlur={(e) => { setOn(false); onBlur?.(e); }}
      style={[
        { borderRadius: radius, borderWidth: ring ? 3 : 0, borderColor: ring && on ? ringColor : 'transparent', transform: [{ scale: on ? scale : 1 }] },
        style,
        on ? focusStyle : null,
      ]}
      {...rest}
    >
      {typeof children === 'function' ? children(on) : children}
    </Pressable>
  );
}
