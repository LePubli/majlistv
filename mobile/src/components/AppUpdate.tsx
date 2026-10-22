// Mise à jour de l'application (22b-5) : au démarrage, l'application demande à notre serveur quelle est la dernière version.
// Si elle est plus récente : bandeau « Nouvelle version disponible » → écran avec les nouveautés → téléchargement de l'APK depuis notre serveur
// → vérification de l'empreinte SHA-256 → installation (Android demande lui-même la confirmation).
// Android uniquement. Aucun téléchargement sans geste de la personne ; rien ne s'installe tout seul.
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { AppState, Modal, Platform, Pressable, ScrollView, View } from 'react-native';
import { Feather } from '@expo/vector-icons';
import * as Application from 'expo-application';
import * as SecureStore from 'expo-secure-store';
import * as IntentLauncher from 'expo-intent-launcher';
import { File, Paths } from 'expo-file-system';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useSession } from '@/lib/session';
import { API_URL } from '@/lib/config';
import { colors, radius } from '@/lib/theme';
import { Button, Txt } from '@/components/ui';
import {
  LatestRelease, ErrorKind, StepKind, UpdateCheckResult, bannerHidden, checkErrorDetail, formatSize, installedCode, notesFor, parseLatest, progressRatio, shouldCheck,
} from '@/lib/appUpdate';
import { OtaBanner } from '@/components/OtaBanner';
import { registerUpdateChecker } from '@/lib/hooks';

const K_DISMISSED = 'mejliss.updDismissed';
const PACKAGE = 'fr.lepublicitaire.mejlisstv';
const FLAG_GRANT_READ_URI_PERMISSION = 1;
const APK_TYPE = 'application/vnd.android.package-archive';

export function AppUpdate() {
  const { api, t, locale, dirStyle, ready } = useSession();
  const insets = useSafeAreaInsets();
  const supported = Platform.OS === 'android';
  const current = installedCode(Application.nativeBuildVersion);
  const [latest, setLatest] = useState<LatestRelease | null>(null);
  const [required, setRequired] = useState(false);
  const [dismissed, setDismissed] = useState<number | null>(null);
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState<StepKind>('idle');
  const [ratio, setRatio] = useState(0);
  const [error, setError] = useState<ErrorKind | null>(null);
  const lastCheck = useRef<number | null>(null);
  const file = useRef<File | null>(null);

  // Version écartée la dernière fois (gardée sur le téléphone).
  useEffect(() => {
    SecureStore.getItemAsync(K_DISMISSED).then((v) => { const n = Number(v); if (Number.isInteger(n) && n > 0) setDismissed(n); }).catch(() => {});
  }, []);

  const check = useCallback(async (force = false): Promise<UpdateCheckResult> => {
    if (!supported) return { kind: 'unsupported' };
    if (!current) return { kind: 'error', detail: 'numéro de build introuvable (application de développement ?)' };
    const now = Date.now();
    if (!shouldCheck(lastCheck.current, now, force)) return { kind: 'current' };
    lastCheck.current = now;
    try {
      const raw = await api.get<unknown>('/app/latest', { platform: 'android', versionCode: current }, false);
      const res = parseLatest(raw, API_URL);
      if (!res) return { kind: 'error', detail: 'réponse du serveur invalide (adresse publique de l\'API mal réglée dans Admin → Paramètres → Mises à jour ?)' };
      if (!res.latest) { setLatest(null); setRequired(false); return { kind: 'error', detail: 'aucune version publiée sur le serveur' }; }
      if (!res.updateAvailable || res.latest.versionCode <= current) { setLatest(null); setRequired(false); return { kind: 'current' }; }
      setLatest(res.latest);
      setRequired(res.required);
      if (res.required || force) { setDismissed(null); setOpen(true); }
      return { kind: 'available', version: res.latest.version };
    } catch (e) { return { kind: 'error', detail: checkErrorDetail(e) }; } // au démarrage : sans bruit, on réessaiera ; le bouton du Compte affiche la cause
  }, [api, current, supported]);

  useEffect(() => registerUpdateChecker(() => check(true)), [check]);
  useEffect(() => { if (ready) void check(); }, [ready, check]);
  useEffect(() => {
    const sub = AppState.addEventListener('change', (s) => { if (s === 'active') void check(); });
    return () => sub.remove();
  }, [check]);

  const later = () => {
    if (required || !latest) return;
    setOpen(false);
    setDismissed(latest.versionCode);
    SecureStore.setItemAsync(K_DISMISSED, String(latest.versionCode)).catch(() => {});
  };

  const fail = (kind: ErrorKind) => { setError(kind); setStep('error'); };

  const install = useCallback(async () => {
    const f = file.current;
    if (!f) return;
    try {
      await IntentLauncher.startActivityAsync('android.intent.action.VIEW', { data: f.contentUri, flags: FLAG_GRANT_READ_URI_PERMISSION, type: APK_TYPE });
    } catch { fail('install'); }
  }, []);

  // Autorisation « installer des applications inconnues » pour Mejliss TV (une seule fois).
  const allow = useCallback(async () => {
    try {
      await IntentLauncher.startActivityAsync(IntentLauncher.ActivityAction.MANAGE_UNKNOWN_APP_SOURCES, { data: `package:${PACKAGE}` });
    } catch {
      try { await IntentLauncher.startActivityAsync(IntentLauncher.ActivityAction.SECURITY_SETTINGS); } catch { /* réglages indisponibles */ }
    }
  }, []);

  const download = useCallback(async () => {
    if (!latest) return;
    setError(null); setRatio(0); setStep('downloading');
    try {
      const dest = new File(Paths.cache, `mejliss-tv-${latest.versionCode}.apk`);
      if (dest.exists) dest.delete();
      const task = File.createDownloadTask(latest.downloadUrl, dest, {
        onProgress: (p) => setRatio(progressRatio(p.bytesWritten, p.totalBytes, latest.size)),
      });
      const got = await task.downloadAsync();
      if (!got) { fail('network'); return; }
      setStep('verifying');
      const sha = (await got.digest('SHA-256')).toLowerCase();
      if (sha !== latest.sha256 || got.size !== latest.size) { try { got.delete(); } catch { /* déjà supprimé */ } fail('integrity'); return; }
      file.current = got;
      setStep('ready');
      await install();
    } catch { fail('network'); }
  }, [latest, install]);

  if (!supported) return null;
  const hidden = bannerHidden(dismissed, latest, required);
  const percent = Math.round(ratio * 100);
  const notes = latest ? notesFor(latest.notes, locale) : '';
  const busy = step === 'downloading' || step === 'verifying';

  return (
    <>
      <OtaBanner />
      {!hidden && !open && latest ? (
        <View pointerEvents="box-none" style={{ position: 'absolute', left: 12, right: 12, bottom: Math.max(insets.bottom, 8) + 64, zIndex: 50 }}>
          <Pressable
            accessibilityRole="button" accessibilityLabel={t('au.title')} onPress={() => setOpen(true)}
            style={[{ flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14, borderRadius: radius.panel, backgroundColor: colors.panel, borderWidth: 1, borderColor: colors.goldLine }, dirStyle]}
          >
            <Feather name="download" size={22} color={colors.gold} />
            <View style={{ flex: 1 }}>
              <Txt weight="extrabold" size={14}>{t('au.title')}</Txt>
              <Txt size={13} color={colors.text2}>{t('au.banner', { version: latest.version })}</Txt>
            </View>
            <Feather name={dirStyle.direction === 'rtl' ? 'chevron-left' : 'chevron-right'} size={20} color={colors.gold} />
          </Pressable>
        </View>
      ) : null}

      <Modal visible={open && !!latest} transparent animationType="fade" onRequestClose={() => { if (!busy) later(); }}>
        <View style={{ flex: 1, backgroundColor: 'rgba(5,4,3,0.86)', justifyContent: 'center', padding: 22 }}>
          {latest ? (
            <View accessibilityViewIsModal style={[{ maxHeight: '88%', borderRadius: radius.panel, backgroundColor: colors.panel, borderWidth: 1, borderColor: colors.goldLine, padding: 22, gap: 10 }, dirStyle]}>
              <View style={{ alignItems: 'center', gap: 6 }}>
                <Feather name="download-cloud" size={40} color={colors.gold} />
                <Txt weight="extrabold" size={22} color={colors.goldLight} accessibilityRole="header" style={{ textAlign: 'center' }}>{t('au.title')}</Txt>
                <Txt color={colors.text2} style={{ textAlign: 'center' }}>{`Mejliss TV ${latest.version}`}</Txt>
                <Txt size={13} color={colors.muted}>{t('au.size', { size: formatSize(latest.size, locale) })}</Txt>
              </View>
              {required ? <Txt color={colors.goldLight} style={{ textAlign: 'center' }}>{t('au.required')}</Txt> : null}
              {notes ? (
                <ScrollView style={{ flexGrow: 0, maxHeight: 180 }}>
                  <Txt weight="bold" size={12} color={colors.muted} style={{ letterSpacing: 1, textTransform: 'uppercase', marginBottom: 4 }}>{t('au.whatsNew')}</Txt>
                  <Txt color={colors.text2}>{notes}</Txt>
                </ScrollView>
              ) : null}

              {step === 'downloading' ? (
                <View style={{ gap: 6 }} accessibilityRole="progressbar" accessibilityValue={{ min: 0, max: 100, now: percent }}>
                  <View style={{ height: 8, borderRadius: 4, backgroundColor: colors.border, overflow: 'hidden' }}>
                    <View style={{ width: `${percent}%`, height: 8, backgroundColor: colors.gold }} />
                  </View>
                  <Txt size={13} color={colors.text2} style={{ textAlign: 'center' }}>{t('au.downloading', { percent })}</Txt>
                </View>
              ) : null}
              {step === 'verifying' ? <Txt color={colors.text2} style={{ textAlign: 'center' }}>{t('au.verifying')}</Txt> : null}
              {step === 'ready' ? <Txt size={13} color={colors.text2} style={{ textAlign: 'center' }}>{t('au.installHelp')}</Txt> : null}
              {step === 'error' && error ? (
                <Txt color="#FF8A7A" accessibilityRole="alert" style={{ textAlign: 'center' }}>
                  {t(error === 'network' ? 'au.errNetwork' : error === 'integrity' ? 'au.errIntegrity' : error === 'install' ? 'au.errInstall' : 'au.errUnsupported')}
                </Txt>
              ) : null}
              {step === 'ready' || (step === 'error' && error === 'install') ? <Txt size={12} color={colors.muted} style={{ textAlign: 'center' }}>{t('au.allowHelp')}</Txt> : null}

              <View style={{ gap: 8, marginTop: 6 }}>
                {step === 'ready' ? <Button label={t('au.install')} onPress={() => void install()} icon={<Feather name="check" size={18} color={colors.onGold} />} /> : null}
                {step === 'idle' || step === 'error' ? (
                  <Button label={t(step === 'error' && error !== 'install' ? 'common.retry' : 'au.update')} onPress={() => void (step === 'error' && error === 'install' && file.current ? install() : download())} />
                ) : null}
                {step === 'ready' || (step === 'error' && error === 'install') ? <Button variant="dark" label={t('au.allow')} onPress={() => void allow()} /> : null}
                {!required && !busy ? <Button variant="ghost" label={t('au.later')} onPress={later} /> : null}
              </View>
            </View>
          ) : null}
        </View>
      </Modal>
    </>
  );
}
