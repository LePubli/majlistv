// Éléments d'interface réutilisables : texte, bouton, pastille, message d'erreur, indicateur de chargement.
import React from 'react';
import { ActivityIndicator, Pressable, StyleProp, Text, TextInput, TextInputProps, TextProps, TextStyle, View, ViewStyle } from 'react-native';
import { router } from 'expo-router';
import { Feather } from '@expo/vector-icons';
import { colors, fontFamily, fonts, radius, Weight } from '@/lib/theme';
import { useSession } from '@/lib/session';

export function Txt({ weight = 'regular', size = 15, color = colors.text, style, ...rest }:
  TextProps & { weight?: Weight; size?: number; color?: string }) {
  const { isRTL } = useSession();
  return <Text {...rest} style={[{ fontFamily: fontFamily(weight, size, isRTL), fontSize: size, color, lineHeight: Math.round(size * (isRTL ? 1.6 : 1.4)) }, style]} />;
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

/** Carte arrondie de la maquette (fond « panel », bordure fine). */
export function Panel({ children, style }: { children: React.ReactNode; style?: StyleProp<ViewStyle> }) {
  return <View style={[{ padding: 16, borderRadius: radius.panel, backgroundColor: colors.panel, borderWidth: 1, borderColor: colors.border, gap: 10 }, style]}>{children}</View>;
}

/** Petit titre de section en capitales (comme sur l'écran Compte). */
export function Eyebrow({ children }: { children: string }) {
  return <Txt weight="bold" size={12} color={colors.muted} style={{ letterSpacing: 0.8, textTransform: 'uppercase' }}>{children}</Txt>;
}

/** Champ de saisie : texte aligné selon la langue (arabe : à droite). */
export function Field({ label, style, ...rest }: TextInputProps & { label: string }) {
  const { isRTL } = useSession();
  return (
    <TextInput
      accessibilityLabel={label}
      placeholder={label}
      placeholderTextColor={colors.muted}
      {...rest}
      style={[{
        minHeight: 50, borderRadius: radius.input, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.panel2,
        paddingHorizontal: 16, paddingVertical: 12, color: colors.text, fontFamily: fonts.medium, fontSize: 15,
        textAlign: isRTL ? 'right' : 'left',
      }, style]}
    />
  );
}

/** En-tête des écrans ouverts par-dessus les onglets : retour + titre. */
export function ScreenHeader({ title }: { title: string }) {
  const { t, isRTL } = useSession();
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 18, paddingVertical: 10 }}>
      <IconButton label={t('common.close')} onPress={() => (router.canGoBack() ? router.back() : router.replace('/'))}>
        <Feather name={isRTL ? 'arrow-right' : 'arrow-left'} size={20} color={colors.text} />
      </IconButton>
      <Txt weight="extrabold" size={18} numberOfLines={1} style={{ flex: 1 }}>{title}</Txt>
    </View>
  );
}

/** Grand titre d'écran (police des titres du site, compatible arabe). */
export function Title({ children, style }: { children: React.ReactNode; style?: StyleProp<TextStyle> }) {
  return <Txt weight="extrabold" size={24} accessibilityRole="header" style={style}>{children}</Txt>;
}
