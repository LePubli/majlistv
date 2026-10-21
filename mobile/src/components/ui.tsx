// Éléments d'interface réutilisables : texte, bouton, pastille, message d'erreur, indicateur de chargement.
import React from 'react';
import { ActivityIndicator, Pressable, StyleProp, Text, TextProps, TextStyle, View, ViewStyle } from 'react-native';
import { colors, fonts, radius } from '@/lib/theme';
import { useSession } from '@/lib/session';

type Weight = keyof typeof fonts;

export function Txt({ weight = 'regular', size = 15, color = colors.text, style, ...rest }:
  TextProps & { weight?: Weight; size?: number; color?: string }) {
  return <Text {...rest} style={[{ fontFamily: fonts[weight], fontSize: size, color, lineHeight: Math.round(size * 1.4) }, style]} />;
}

export function Button({ label, onPress, variant = 'gold', icon, disabled, loading, style, accessibilityLabel }: {
  label?: string; onPress?: () => void; variant?: 'gold' | 'dark' | 'ghost'; icon?: React.ReactNode;
  disabled?: boolean; loading?: boolean; style?: StyleProp<ViewStyle>; accessibilityLabel?: string;
}) {
  const bg = variant === 'gold' ? colors.gold : variant === 'dark' ? colors.panel : 'transparent';
  const fg = variant === 'gold' ? colors.onGold : colors.text;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? label}
      accessibilityState={{ disabled: !!disabled || !!loading }}
      disabled={disabled || loading}
      onPress={onPress}
      style={({ pressed }) => [{
        minHeight: 48, paddingHorizontal: 22, borderRadius: radius.pill, backgroundColor: bg,
        borderWidth: variant === 'gold' ? 0 : 1, borderColor: colors.border,
        flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
        opacity: disabled ? 0.5 : pressed ? 0.85 : 1,
      }, style]}
    >
      {loading ? <ActivityIndicator color={fg} /> : <>
        {icon}
        {label ? <Txt weight="extrabold" size={15} color={fg}>{label}</Txt> : null}
      </>}
    </Pressable>
  );
}

export function IconButton({ children, onPress, label, size = 44, style }: {
  children: React.ReactNode; onPress?: () => void; label: string; size?: number; style?: StyleProp<ViewStyle>;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      hitSlop={6}
      style={({ pressed }) => [{
        width: size, height: size, borderRadius: size / 2, alignItems: 'center', justifyContent: 'center',
        backgroundColor: colors.panel, borderWidth: 1, borderColor: colors.border, opacity: pressed ? 0.8 : 1,
      }, style]}
    >
      {children}
    </Pressable>
  );
}

export function Chip({ label, active, onPress }: { label: string; active?: boolean; onPress?: () => void }) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected: !!active }}
      onPress={onPress}
      style={{
        minHeight: 40, paddingHorizontal: 16, borderRadius: radius.pill, justifyContent: 'center',
        backgroundColor: active ? colors.gold : colors.panel, borderWidth: active ? 0 : 1, borderColor: colors.border,
      }}
    >
      <Txt weight={active ? 'extrabold' : 'semibold'} size={14} color={active ? colors.onGold : colors.text2}>{label}</Txt>
    </Pressable>
  );
}

export function Loading() {
  const { t } = useSession();
  return (
    <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12, padding: 24 }} accessibilityLabel={t('common.loading')}>
      <ActivityIndicator color={colors.gold} size="large" />
    </View>
  );
}

export function ErrorBox({ message, onRetry }: { message?: string; onRetry?: () => void }) {
  const { t } = useSession();
  return (
    <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', gap: 14, padding: 24 }}>
      <Txt color={colors.text2} style={{ textAlign: 'center' }}>{message ?? t('common.error')}</Txt>
      {onRetry ? <Button label={t('common.retry')} variant="dark" onPress={onRetry} /> : null}
    </View>
  );
}

export const screenStyle: ViewStyle = { flex: 1, backgroundColor: colors.bg };
export const titleStyle: TextStyle = { fontFamily: fonts.extrabold, fontSize: 24, color: colors.text };
