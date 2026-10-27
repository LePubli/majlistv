// Connexion / création de compte (fenêtre qui monte du bas).
import React, { useState } from 'react';
import { KeyboardAvoidingView, Linking, Platform, Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router, useLocalSearchParams } from 'expo-router';
import { Feather } from '@expo/vector-icons';
import { useSession } from '@/lib/session';
import { ApiError } from '@/lib/api';
import { verifyErrorKey } from '@/lib/twoFactor';
import { SITE_URL } from '@/lib/config';
import { colors, fonts, radius } from '@/lib/theme';
import { Button, IconButton, Txt, screenStyle, Title } from '@/components/ui';

export default function LoginScreen() {
  const { login, verifyTwoFactor, register, t, dirStyle, isRTL } = useSession();
  const params = useLocalSearchParams<{ mode?: string }>();
  const [mode, setMode] = useState<'login' | 'register'>(params.mode === 'register' ? 'register' : 'login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [challenge, setChallenge] = useState<string | null>(null); // 2e étape : code de la double authentification
  const [code, setCode] = useState('');

  const input = {
    minHeight: 52, paddingHorizontal: 16, borderRadius: radius.input, backgroundColor: colors.panel, borderWidth: 1,
    borderColor: colors.border, color: colors.text, fontFamily: fonts.medium, fontSize: 16, textAlign: (isRTL ? 'right' : 'left') as 'left' | 'right',
  };

  async function submit() {
    setError('');
    setBusy(true);
    try {
      if (mode === 'login') {
        const pending = await login(email, password);
        if (pending) { setChallenge(pending.challenge); setCode(''); return; }
      } else await register(email, password, name);
      router.back();
    } catch (err) {
      const e = err as ApiError;
      setError(
        e.status === 0 ? t('auth.network')
        : e.status === 401 ? t('auth.invalid')
        : e.status === 403 ? (e.code === 'feature_off' && e.message ? e.message : t('auth.suspended'))
        : e.status === 409 ? t('auth.exists')
        : e.status === 400 ? t('auth.bad')
        : e.message,
      );
    } finally {
      setBusy(false);
    }
  }

  async function submitCode() {
    if (!challenge) return;
    setError('');
    setBusy(true);
    try {
      await verifyTwoFactor(challenge, code);
      router.back();
    } catch (err) {
      const e = err as ApiError;
      const r = verifyErrorKey(e.status, e.code);
      setError(t(r.key));
      if (r.expired) { setChallenge(null); setPassword(''); }
    } finally {
      setBusy(false);
    }
  }

  if (challenge) {
    return (
      <SafeAreaView style={[screenStyle, dirStyle]}>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
          <ScrollView contentContainerStyle={{ padding: 18, gap: 16 }} keyboardShouldPersistTaps="handled">
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
              <Title>{t('auth.2fa.title')}</Title>
              <IconButton label={t('common.close')} onPress={() => router.back()}><Feather name="x" size={20} color={colors.text} /></IconButton>
            </View>
            <Txt color={colors.muted}>{t('auth.2fa.help')}</Txt>
            <TextInput value={code} onChangeText={setCode} placeholder={t('auth.2fa.code')} placeholderTextColor={colors.muted}
              accessibilityLabel={t('auth.2fa.code')} autoFocus autoCapitalize="none" autoCorrect={false} autoComplete="one-time-code"
              textContentType="oneTimeCode" onSubmitEditing={submitCode} style={[input, { textAlign: 'left', letterSpacing: 2 }]} />
            {error ? <Txt color={colors.danger} accessibilityRole="alert">{error}</Txt> : null}
            <Button label={t('auth.2fa.verify')} onPress={submitCode} loading={busy} disabled={code.trim().length < 6} />
            <Pressable accessibilityRole="button" onPress={() => { setChallenge(null); setError(''); }} style={{ minHeight: 44, justifyContent: 'center' }}>
              <Txt weight="semibold" color={colors.goldLight} style={{ textAlign: 'center' }}>{t('auth.2fa.back')}</Txt>
            </Pressable>
          </ScrollView>
        </KeyboardAvoidingView>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={[screenStyle, dirStyle]}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
        <ScrollView contentContainerStyle={{ padding: 18, gap: 16 }} keyboardShouldPersistTaps="handled">
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
            <Title>{mode === 'login' ? t('auth.login') : t('auth.register')}</Title>
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
