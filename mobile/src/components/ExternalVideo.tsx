// Lecteur YouTube / Vimeo intégré à la fiche : page minimale dans une WebView, pilotée par messages.
import React, { forwardRef, useImperativeHandle, useMemo, useRef } from 'react';
import { View } from 'react-native';
import { WebView as RNWebView } from 'react-native-webview';
import { SITE_URL } from '@/lib/config';
import { EmbedCommand, EmbedKind, EmbedMessage, buildEmbedHtml, commandScript, parseEmbedMessage } from '@/lib/embed';

// Les types de react-native-webview ne s'accordent pas avec ceux de React 19 : on type la frontière à la main.
const WebView = RNWebView as unknown as React.ComponentType<Record<string, unknown>>;
type WebEvent = { nativeEvent: { data: string } };

export type PlayerHandle = { seek: (s: number) => void; play: () => void; pause: () => void; rate: (r: number) => void };

type Props = {
  kind: EmbedKind; id: string; startSeconds: number; limitSeconds: number;
  onMessage: (m: EmbedMessage) => void;
};

export const ExternalVideo = forwardRef<PlayerHandle, Props>(function ExternalVideo({ kind, id, startSeconds, limitSeconds, onMessage }, ref) {
  const web = useRef<{ injectJavaScript: (s: string) => void } | null>(null);
  // La page n'est construite qu'une fois : changer de position ne doit pas recharger le lecteur.
  const html = useMemo(
    () => buildEmbedHtml(kind, id, { start: startSeconds, limit: limitSeconds, auto: true, origin: SITE_URL }),
    [kind, id], // eslint-disable-line react-hooks/exhaustive-deps
  );
  const send = (c: EmbedCommand) => web.current?.injectJavaScript(commandScript(c));
  useImperativeHandle(ref, () => ({
    seek: (s) => send({ c: 'seek', v: s }), play: () => send({ c: 'play' }), pause: () => send({ c: 'pause' }), rate: (r) => send({ c: 'rate', v: r }),
  }));
  const handle = (e: WebEvent) => { const m = parseEmbedMessage(e.nativeEvent.data); if (m) onMessage(m); };
  return (
    <View style={{ flex: 1, backgroundColor: '#000' }}>
      <WebView
        ref={web}
        source={{ html, baseUrl: SITE_URL }}
        originWhitelist={['*']}
        javaScriptEnabled
        domStorageEnabled
        allowsInlineMediaPlayback
        allowsFullscreenVideo
        mediaPlaybackRequiresUserAction={false}
        onMessage={handle}
        onError={() => onMessage({ t: 'error', code: 'web' })}
        setSupportMultipleWindows={false}
        style={{ flex: 1, backgroundColor: '#000' }}
      />
    </View>
  );
});
