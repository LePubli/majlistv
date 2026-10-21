// Connexion / création de compte (fenêtre qui monte du bas).
import React, { useState } from 'react';
import { KeyboardAvoidingView, Linking, Platform, Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { Feather } from '@expo/vector-icons';
import { useSession } from '@/lib/session';
import { ApiError } from '@/lib/api';
import { SITE_URL } from '@/lib/config';
import { colors, fonts, radius } from '@/lib/theme';
import { Button, IconButton, Txt, screenStyle, titleStyle } from '@/components/ui';

export default function LoginScreen() {
  const { login, register, t, dirStyle, isRTL } = useSession();
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const input = {
    minHeight: 52, paddingHorizontal: 16, borderRadius: radius.input, backgroundColor: colors.panel, borderWidth: 1,
    borderColor: colors.border, color: colors.text, fontFamily: fonts.medium, fontSize: 16, textAlign: (isRTL ? 'right' : 'left') as 'left' | 'right',
  };

  async function submit() {
    setError('');
    setBusy(true);
    try {
      if (mode === 'login') await login(email, password);
      else await register(email, password, name);
      router.back();
    } catch (err) {
      const e = err as ApiError;
      setError(
        e.status === 0 ? t('auth.network')
        : e.status === 401 ? t('auth.invalid')
        : e.status === 403 ? t('auth.suspended')
        : e.status === 409 ? t('auth.exists')
        : e.status === 400 ? t('auth.bad')
        : e.message,
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <SafeAreaView style={[screenStyle, dirStyle]}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
        <ScrollView contentContainerStyle={{ padding: 18, gap: 16 }} keyboardShouldPersistTaps="handled">
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
            <Text style={titleStyle}>{mode === 'login' ? t('auth.login') : t('auth.register')}</Text>
            <IconButton label={t('common.close')} onPress={() => router.back()}><Feather name="x" size={20} color={colors.text} /></IconButton>
          </View>

          {mode === 'register' ? (
            <TextInput value={name} onChangeText={setName} placeholder={t('auth.name')} placeholderTextColor={colors.muted}
              accessibilityLabel={t('auth.name')} autoCapitalize="words" style={input} />
          ) : null}
          <TextInput value={email} onChangeText={setEmail} placeholder={t('auth.email')} placeholderTextColor={colors.muted}
            accessibilityLabel={t('auth.email')} keyboardType="email-address" autoCapitalize="none" autoComplete="email" autoCorrect={false} style={input} />
          <TextInput value={password} onChangeText={setPassword} placeholder={mode === 'register' ? `${t('auth.password')} (${t('auth.passwordHint')})` : t('auth.password')}
            placeholderTextColor={colors.muted} accessibilityLabel={t('auth.password')} secureTextEntry autoCapitalize="none"
            autoComplete={mode === 'login' ? 'current-password' : 'new-password'} onSubmitEditing={submit} style={input} />

          {error ? <Txt color={colors.danger} accessibilityRole="alert">{error}</Txt> : null}

          <Button label={mode === 'login' ? t('auth.login') : t('auth.register')} onPress={submit} loading={busy} disabled={!email || !password} />

          <Pressable accessibilityRole="button" onPress={() => { setMode(mode === 'login' ? 'register' : 'login'); setError(''); }} style={{ minHeight: 44, justifyContent: 'center' }}>
            <Txt weight="semibold" color={colors.goldLight} style={{ textAlign: 'center' }}>{mode === 'login' ? t('auth.toRegister') : t('auth.toLogin')}</Txt>
          </Pressable>
          {mode === 'login' ? (
            <Pressable accessibilityRole="link" onPress={() => Linking.openURL(`${SITE_URL}/forgot`)} style={{ minHeight: 44, justifyContent: 'center' }}>
              <Txt color={colors.muted} style={{ textAlign: 'center' }}>{t('auth.forgot')}</Txt>
            </Pressable>
          ) : null}
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
