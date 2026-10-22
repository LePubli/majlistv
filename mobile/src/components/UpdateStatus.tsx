// Écran Compte : version installée et vérification manuelle des mises à jour (application et contenu). Affiche la cause précise d'un échec.
import React, { useState } from 'react';
import { View } from 'react-native';
import * as Application from 'expo-application';
import * as Updates from 'expo-updates';
import Constants from 'expo-constants';
import { useSession } from '@/lib/session';
import { runUpdateCheck } from '@/lib/hooks';
import { colors, radius } from '@/lib/theme';
import { Button, Txt } from '@/components/ui';

export function UpdateStatus() {
  const { t } = useSession();
  const [busy, setBusy] = useState(false);
  const [lines, setLines] = useState<string[]>([]);
  const build = Application.nativeBuildVersion ?? '?';
  const ota = Updates.isEnabled
    ? `${t('au.diagContent')} : ${Updates.isEmbeddedLaunch ? t('au.diagEmbedded') : (Updates.updateId ?? '').slice(0, 8)} · ${Updates.runtimeVersion ?? ''}`
    : t('au.diagOtaOff');

  async function run() {
    setBusy(true); setLines([t('au.checking')]);
    const out: string[] = [];
    const app = await runUpdateCheck();
    out.push(app.kind === 'current' ? t('au.upToDate') : app.kind === 'available' ? t('au.banner', { version: app.version }) : app.kind === 'unsupported' ? t('au.errUnsupported') : `${t('au.checkFailed')} ${app.detail}`);
    if (Updates.isEnabled) {
      try {
        const r = await Updates.checkForUpdateAsync();
        if (r.isAvailable) { await Updates.fetchUpdateAsync(); out.push(t('au.otaReady')); } else out.push(`${t('au.diagContent')} : ${t('au.upToDate')}`);
      } catch (e) { out.push(`${t('au.diagContent')} — ${t('au.checkFailed')} ${String((e as Error)?.message ?? e).slice(0, 160)}`); }
    }
    setLines(out); setBusy(false);
  }

  return (
    <View style={{ padding: 16, borderRadius: radius.panel, backgroundColor: colors.panel, borderWidth: 1, borderColor: colors.border, gap: 10 }}>
      <Txt weight="bold" size={12} color={colors.muted} style={{ letterSpacing: 0.8, textTransform: 'uppercase' }}>{t('au.diagTitle')}</Txt>
      <Txt size={14} color={colors.text2}>{`${t('au.diagVersion')} ${Constants.expoConfig?.version ?? ''} (build ${build})`}</Txt>
      <Txt size={12} color={colors.muted}>{ota}</Txt>
      <Button label={t('au.check')} variant="dark" loading={busy} onPress={() => { void run(); }} />
      {lines.map((l, i) => <Txt key={i} size={13} color={colors.text2} accessibilityRole={i === 0 ? 'alert' : undefined}>{l}</Txt>)}
    </View>
  );
}
