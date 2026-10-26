// Publicité plein écran au lancement (étape 24c) — maquette « Pub » validée : visuel (photo ou vidéo) sur tout l'écran, mention « Publicité »,
// bouton « Passer dans N s », annonceur, titre, phrase, bouton d'action. Une seule fois par lancement de l'application.
// Jamais : espace enfant, fonction coupée côté serveur, pendant l'heure de prière, abonné payant (réglage serveur), réponse trop lente.
// Plusieurs publicités : le serveur choisit la suivante dans la rotation (on lui donne la dernière montrée) ; réglage « à la suite ».
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { BackHandler, Linking, Pressable, StyleSheet, View } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { useEventListener } from 'expo';
import { VideoView, useVideoPlayer } from 'expo-video';
import * as SecureStore from 'expo-secure-store';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useSession } from '@/lib/session';
import { useKid } from '@/lib/kidSession';
import { usePrayer } from '@/lib/prayerStore';
import { statusAt } from '@/lib/prayer/prayerLogic';
import { Ad, AdsReply, adAllowed, adRatio, parseAds, skipRemaining, tooLate } from '@/lib/ads';
import { colors } from '@/lib/theme';
import { Txt } from '@/components/ui';

const K_LAST = 'mejliss.adLast';
const LAUNCH = Date.now();
let handled = false; // une seule décision par lancement (l'application reste ouverte : pas de nouvelle publicité en revenant)

type Media = { onProgress: (elapsed: number, total: number) => void; onEnd: () => void };

function ImageMedia({ ad, seconds, onProgress, onEnd }: Media & { ad: Ad; seconds: number }) {
  useEffect(() => {
    const start = Date.now();
    const id = setInterval(() => {
      const e = (Date.now() - start) / 1000;
      onProgress(e, seconds);
      if (e >= seconds) { clearInterval(id); onEnd(); }
    }, 200);
    return () => clearInterval(id);
  }, [seconds]); // eslint-disable-line react-hooks/exhaustive-deps
  return <Image source={{ uri: ad.mediaUrl }} style={StyleSheet.absoluteFill} contentFit="cover" accessibilityIgnoresInvertColors onError={onEnd} />;
}

function VideoMedia({ ad, muted, onProgress, onEnd }: Media & { ad: Ad; muted: boolean }) {
  const player = useVideoPlayer({ uri: ad.mediaUrl }, (p) => { p.loop = false; p.staysActiveInBackground = false; p.showNowPlayingNotification = false; p.timeUpdateEventInterval = 0.25; p.play(); });
  const last = useRef(Date.now());
  useEffect(() => { player.muted = muted; }, [player, muted]);
  useEventListener(player, 'timeUpdate', ({ currentTime }) => { last.current = Date.now(); onProgress(currentTime, player.duration || 0); });
  useEventListener(player, 'playToEnd', onEnd);
  useEventListener(player, 'statusChange', ({ status }) => { if (status === 'error') onEnd(); });
  // Vidéo qui ne démarre pas ou se fige : on ne bloque pas l'application.
  useEffect(() => {
    const id = setInterval(() => { if (Date.now() - last.current > 8000) { clearInterval(id); onEnd(); } }, 1000);
    return () => clearInterval(id);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  return <VideoView player={player} style={StyleSheet.absoluteFill} contentFit="cover" nativeControls={false} allowsPictureInPicture={false} />;
}

function AdScreen({ ad, skipSeconds, imageSeconds, onFinish }: { ad: Ad; skipSeconds: number; imageSeconds: number; onFinish: (how: 'end' | 'skip' | 'click') => void }) {
  const { t, dirStyle } = useSession();
  const insets = useSafeAreaInsets();
  const [elapsed, setElapsed] = useState(0);
  const [total, setTotal] = useState(ad.mediaKind === 'image' ? imageSeconds : 0);
  const [muted, setMuted] = useState(false);
  const done = useRef(false);
  const finish = useCallback((how: 'end' | 'skip' | 'click') => { if (!done.current) { done.current = true; onFinish(how); } }, [onFinish]);
  const onProgress = useCallback((e: number, tot: number) => { setElapsed(e); setTotal(tot); }, []);
  const onEnd = useCallback(() => finish('end'), [finish]);
  const wait = skipRemaining(elapsed, skipSeconds);
  const canSkip = wait === 0;
  const skip = () => { if (canSkip) finish('skip'); };
  // Bouton retour d'Android : passe la publicité quand c'est permis, sinon ne fait rien (n'éteint pas l'application).
  useEffect(() => {
    const sub = BackHandler.addEventListener('hardwareBackPress', () => { if (canSkip) finish('skip'); return true; });
    return () => sub.remove();
  }, [canSkip, finish]);
  const open = () => { void Linking.openURL(ad.linkUrl).catch(() => { /* aucun navigateur : on continue */ }); finish('click'); };
  const chip = { backgroundColor: 'rgba(11,9,6,0.7)' } as const;
  return (
    <View style={[StyleSheet.absoluteFill, { backgroundColor: '#000' }, dirStyle]} accessibilityViewIsModal>
      {ad.mediaKind === 'video'
        ? <VideoMedia ad={ad} muted={muted} onProgress={onProgress} onEnd={onEnd} />
        : <ImageMedia ad={ad} seconds={imageSeconds} onProgress={onProgress} onEnd={onEnd} />}
      {/* Voiles en haut et en bas : le texte reste lisible sur n'importe quel visuel. */}
      <LinearGradient pointerEvents="none" colors={['rgba(0,0,0,0.6)', 'rgba(0,0,0,0)']} style={{ position: 'absolute', top: 0, start: 0, end: 0, height: 160 }} />
      <LinearGradient pointerEvents="none" colors={['rgba(0,0,0,0)', 'rgba(0,0,0,0.88)']} style={{ position: 'absolute', bottom: 0, start: 0, end: 0, height: '55%' }} />

      <View style={{ position: 'absolute', top: 0, start: 0, end: 0, height: 4, backgroundColor: 'rgba(255,255,255,0.18)' }}>
        <View style={{ width: `${adRatio(elapsed, total) * 100}%`, height: 4, backgroundColor: colors.gold }} />
      </View>
      <View style={{ position: 'absolute', top: insets.top + 14, start: 16, end: 16, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
        <View style={[{ paddingHorizontal: 12, paddingVertical: 6, borderRadius: 14 }, chip]}>
          <Txt weight="bold" size={12} style={{ letterSpacing: 0.7, textTransform: 'uppercase' }}>{t('ad.tag')}</Txt>
        </View>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          {ad.mediaKind === 'video' ? (
            <Pressable accessibilityRole="button" accessibilityLabel={muted ? t('shorts.unmute') : t('shorts.mute')} onPress={() => setMuted((m) => !m)} hitSlop={6}
              style={[{ width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center' }, chip]}>
              <Feather name={muted ? 'volume-x' : 'volume-2'} size={20} color={colors.text} />
            </Pressable>
          ) : null}
          <Pressable accessibilityRole="button" accessibilityLabel={t('ad.close')} accessibilityState={{ disabled: !canSkip }} disabled={!canSkip} onPress={skip}
            style={[{ minHeight: 44, paddingHorizontal: 18, borderRadius: 22, justifyContent: 'center', borderWidth: 1, borderColor: 'rgba(255,255,255,0.35)', opacity: canSkip ? 1 : 0.85 }, chip]}>
            <Txt weight="bold" size={14}>{canSkip ? t('ad.skip') : t('ad.skipIn', { n: wait })}</Txt>
          </Pressable>
        </View>
      </View>

      <View style={{ position: 'absolute', start: 24, end: 24, bottom: insets.bottom + 56 }}>
        {ad.advertiser ? <Txt weight="bold" size={13} color={colors.goldLight}>{ad.advertiser}</Txt> : null}
        <Txt weight="extrabold" size={24} style={{ marginTop: 6, lineHeight: 30 }}>{ad.title}</Txt>
        {ad.sentence ? <Txt size={15} color={colors.text2} style={{ marginTop: 8, lineHeight: 22 }}>{ad.sentence}</Txt> : null}
        <Pressable accessibilityRole="link" accessibilityLabel={ad.cta} onPress={open}
          style={({ pressed }) => ({ marginTop: 18, minHeight: 52, borderRadius: 26, backgroundColor: colors.gold, alignItems: 'center', justifyContent: 'center', opacity: pressed ? 0.85 : 1 })}>
          <Txt weight="extrabold" size={16} color={colors.onGold}>{ad.cta}</Txt>
        </Pressable>
      </View>
      <View pointerEvents="none" style={{ position: 'absolute', start: 0, end: 0, bottom: insets.bottom + 18, alignItems: 'center' }}>
        <Txt size={12} color={colors.muted}>{t('ad.footer')} · <Txt size={12} weight="bold" color={colors.goldLight}>Mejliss TV</Txt></Txt>
      </View>
    </View>
  );
}

export function AdGate() {
  const { api, feat, ready } = useSession();
  const { kid, ready: kidReady } = useKid();
  const prayer = usePrayer();
  const [reply, setReply] = useState<AdsReply | null>(null);
  const [index, setIndex] = useState(0);
  const started = useRef(false);

  useEffect(() => {
    if (handled || started.current || !ready || !kidReady) return;
    // L'heure de prière n'est connue qu'une fois la fonction prête (on attend un peu, sinon on s'abstient : pas de pub à l'heure de la prière).
    const prayerKnown = !prayer.on || prayer.ready;
    if (!prayerKnown) { if (tooLate(Date.now() - LAUNCH, 3000)) handled = true; return; }
    const inPrayer = prayer.on && prayer.prefs.enabled && prayer.items.length > 0 && statusAt(prayer.items, Date.now(), prayer.prefs).current != null;
    if (!adAllowed({ featureOn: feat('ads'), isKid: !!kid, inPrayer })) { handled = true; return; }
    started.current = true;
    (async () => {
      try {
        let after: string | null = null;
        try { after = await SecureStore.getItemAsync(K_LAST); } catch { /* coffre indisponible : on commence au début */ }
        const r = parseAds(await api.get<unknown>('/ads/next', after ? { after } : undefined));
        if (r.ads.length && !tooLate(Date.now() - LAUNCH)) setReply(r);
      } catch { /* hors ligne ou erreur : pas de publicité, l'application démarre normalement */ }
      handled = true;
    })();
  }, [ready, kidReady, kid, prayer.on, prayer.ready, prayer.prefs, prayer.items, feat, api]);

  const ad = reply?.ads[index] ?? null;
  // Affichage compté une fois par publicité ; on retient la dernière montrée pour la rotation.
  useEffect(() => {
    if (!ad) return;
    void api.post(`/ads/${ad.id}/impression`).catch(() => { /* compteur non essentiel */ });
    void SecureStore.setItemAsync(K_LAST, ad.id).catch(() => { /* idem */ });
  }, [ad?.id, api]); // eslint-disable-line react-hooks/exhaustive-deps

  const onFinish = useCallback((how: 'end' | 'skip' | 'click') => {
    if (!ad || !reply) return;
    if (how === 'click') void api.post(`/ads/${ad.id}/click`).catch(() => {});
    if (how === 'skip') void api.post(`/ads/${ad.id}/skip`).catch(() => {});
    if (how === 'click' || index + 1 >= reply.ads.length) setReply(null); else setIndex(index + 1);
  }, [ad, reply, index, api]);

  if (!reply || !ad) return null;
  return (
    <View style={[StyleSheet.absoluteFill, { zIndex: 1000, elevation: 1000 }]}>
      <AdScreen key={ad.id} ad={ad} skipSeconds={reply.skipSeconds} imageSeconds={reply.imageSeconds} onFinish={onFinish} />
    </View>
  );
}
