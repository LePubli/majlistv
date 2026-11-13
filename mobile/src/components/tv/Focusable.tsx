// Élément qu'on atteint et qu'on choisit à la télécommande : contour doré et léger agrandissement quand il a le « focus ».
import React, { useState } from 'react';
import { Pressable, type PressableProps, type StyleProp, type ViewStyle } from 'react-native';
import { colors } from '@/lib/theme';

type Props = Omit<PressableProps, 'style'> & { style?: StyleProp<ViewStyle>; focusStyle?: StyleProp<ViewStyle>; first?: boolean; radius?: number };

export function Focusable({ style, focusStyle, first, radius = 12, onFocus, onBlur, children, ...rest }: Props) {
  const [on, setOn] = useState(false);
  return (
    <Pressable
      focusable
      hasTVPreferredFocus={first}
      onFocus={(e) => { setOn(true); onFocus?.(e); }}
      onBlur={(e) => { setOn(false); onBlur?.(e); }}
      style={[{ borderRadius: radius, borderWidth: 3, borderColor: on ? colors.gold : 'transparent', transform: [{ scale: on ? 1.05 : 1 }] }, style, on ? focusStyle : null]}
      {...rest}
    >
      {children}
    </Pressable>
  );
}
