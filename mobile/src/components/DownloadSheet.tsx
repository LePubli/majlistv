// Hors connexion (22b-6) : fenêtre « Regarder sans connexion » ouverte depuis la fiche d'une conférence.
// Choix audio seul / vidéo 360p / 720p avec la taille estimée ; progression ; puis « Regarder hors connexion » ou « Supprimer ».
import React, { useEffect } from 'react';
import { Modal, Pressable, View } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useSession } from '@/lib/session';
import { useAsync } from '@/lib/useAsync';
import { ApiError } from '@/lib/api';
import { useDownloads } from '@/lib/downloadStore';
import { DlErrorCode, daysLeft, errorCodeFor } from '@/lib/downloads';
import { formatSize } from '@/lib/appUpdate';
import { colors, radius } from '@/lib/theme';
import { Button, Txt } from '@/components/ui';
import type { Talk } from '@/lib/types';

type Options = { validDays: number; audio: { estimatedBytes: number } | null; video: { height: number; estimatedBytes: number }[] };
const ERR_KEY = {
  network: 'dl.errNetwork', integrity: 'dl.errIntegrity', subscription: 'dl.errSubscription', external: 'dl.errExternal',
  not_ready: 'dl.errNotReady', no_audio: 'dl.errNoAudio', space: 'dl.errSpace', generic: 'dl.errGeneric',
} as const satisfies Record<DlErrorCode, string>;

export function DownloadSheet({ talk, visible, onClose }: { talk: Talk; visible: boolean; onClose: () => void }) {
  const { api, user, t, locale, dirStyle } = useSession();
  const dl = useDownloads();
  const rec = dl.get(talk.id);
  const mine = dl.active?.talkId === talk.id;
  const opts = useAsync<Options | null>(async () => (visible && user && !rec ? await api.get<Options>(`/me/offline/${talk.id}/options`) : null), [visible, user?.id, talk.id, !!rec]);
  useEffect(() => { if (visible) dl.clearError(); }, [visible]); // eslint-disable-line react-hooks/exhaustive-deps

  const loadErr: DlErrorCode | null = opts.error instanceof ApiError ? (opts.error.status === 0 ? 'network' : errorCodeFor(opts.error.status, opts.error.code)) : opts.error ? 'generic' : null;
  const startErr = dl.error && dl.error.talkId === talk.id ? dl.error : null;
  const errKey = startErr ? ERR_KEY[startErr.code] : loadErr ? ERR_KEY[loadErr] : null;
  const percent = Math.round((dl.active?.ratio ?? 0) * 100);
  const sizeLabel = (n: number) => (n > 0 ? t('dl.approx', { size: formatSize(n, locale) }) : '');

  const row = (key: string, icon: React.ComponentProps<typeof Feather>['name'], label: string, bytes: number, kind: 'audio' | 'video', height: number) => (
    <Pressable key={key} accessibilityRole="button" accessibilityLabel={`${label} ${sizeLabel(bytes)}`} disabled={!!dl.active}
      onPress={() => { void dl.start({ id: talk.id, title: talk.title, speaker: talk.speaker, durationSeconds: talk.durationSeconds, posterUrl: talk.posterUrl }, kind, height); }}
      style={({ pressed }) => [{ flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 56, padding: 12, borderRadius: radius.panel, backgroundColor: colors.bg, borderWidth: 1, borderColor: colors.border, opacity: dl.active ? 0.5 : pressed ? 0.85 : 1 }, dirStyle]}>
      <Feather name={icon} size={22} color={colors.gold} />
      <Txt weight="bold" style={{ flex: 1 }}>{label}</Txt>
      <Txt size={13} color={colors.muted}>{sizeLabel(bytes)}</Txt>
    </Pressable>
  );

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={() => { if (!dl.active) onClose(); }}>
      <View style={{ flex: 1, backgroundColor: 'rgba(5,4,3,0.86)', justifyContent: 'center', padding: 22 }}>
        <View accessibilityViewIsModal style={[{ borderRadius: radius.panel, backgroundColor: colors.panel, borderWidth: 1, borderColor: colors.goldLine, padding: 22, gap: 12 }, dirStyle]}>
          <View style={{ alignItems: 'center', gap: 6 }}>
            <Feather name={rec ? 'check-circle' : 'download'} size={38} color={colors.gold} />
            <Txt weight="extrabold" size={20} color={colors.goldLight} accessibilityRole="header" style={{ textAlign: 'center' }}>{t('dl.sheetTitle')}</Txt>
            <Txt size={13} color={colors.muted} style={{ textAlign: 'center' }} numberOfLines={2}>{talk.title}</Txt>
          </View>

          {!user ? (
            <>
              <Txt color={colors.text2} style={{ textAlign: 'center' }}>{t('dl.loginNeeded')}</Txt>
              <Button label={t('account.signin')} onPress={() => { onClose(); router.push('/login'); }} />
            </>
          ) : mine ? (
            <View style={{ gap: 8 }} accessibilityRole="progressbar" accessibilityValue={{ min: 0, max: 100, now: percent }}>
              <View style={{ height: 8, borderRadius: 4, backgroundColor: colors.border, overflow: 'hidden' }}>
                <View style={{ width: dl.active?.step === 'preparing' ? '8%' : `${percent}%`, height: 8, backgroundColor: colors.gold }} />
              </View>
              <Txt size={13} color={colors.text2} style={{ textAlign: 'center' }}>
                {dl.active?.step === 'preparing' ? t('dl.preparing') : dl.active?.step === 'verifying' ? t('dl.verifying') : t('dl.downloading', { percent })}
              </Txt>
              <Button variant="ghost" label={t('dl.cancel')} onPress={dl.cancel} />
            </View>
          ) : rec ? (
            <>
              <Txt weight="bold" style={{ textAlign: 'center' }}>
                {t('dl.done')} · {rec.kind === 'audio' ? t('dl.audio') : t('dl.video', { height: rec.height })} · {formatSize(rec.size, locale)}
              </Txt>
              <Txt size={13} color={colors.text2} style={{ textAlign: 'center' }}>{t('dl.daysLeft', { n: daysLeft(rec, Date.now()) })}</Txt>
              <Button label={t('dl.watch')} icon={<Feather name="play" size={18} color={colors.onGold} />} onPress={() => { onClose(); router.push({ pathname: '/offline/[id]', params: { id: talk.id } }); }} />
              <Button variant="dark" label={t('dl.remove')} onPress={() => { void dl.remove(talk.id); }} />
            </>
          ) : (
            <>
              {opts.loading && !opts.data && !loadErr ? <Txt color={colors.muted} style={{ textAlign: 'center' }}>{t('common.loading')}</Txt> : null}
              {opts.data ? (
                <View style={{ gap: 8 }}>
                  {opts.data.audio ? row('a', 'headphones', t('dl.audio'), opts.data.audio.estimatedBytes, 'audio', 0) : null}
                  {opts.data.video.map((v) => row(`v${v.height}`, 'film', t('dl.video', { height: v.height }), v.estimatedBytes, 'video', v.height))}
                  <Txt size={12} color={colors.muted} style={{ textAlign: 'center' }}>{t('dl.validity', { days: opts.data.validDays })}</Txt>
                </View>
              ) : null}
            </>
          )}

          {errKey && !mine ? <Txt color="#FF8A7A" accessibilityRole="alert" style={{ textAlign: 'center' }}>{startErr?.message && startErr.code === 'generic' ? startErr.message : t(errKey)}</Txt> : null}
          {!mine ? <Button variant="ghost" label={t('common.close')} onPress={onClose} /> : null}
        </View>
      </View>
    </Modal>
  );
}
