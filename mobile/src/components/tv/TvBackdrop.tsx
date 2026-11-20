// Grande image de fond (refonte TV-R) : image à la une de l'accueil, fiche vidéo. Dégradés vers le fond à gauche (à droite en arabe)
// et en bas pour que le texte reste lisible. YouTube : image haute définition, repli sur la version standard si elle n'existe pas.
import React, { useEffect, useState } from 'react';
import { View, type StyleProp, type ViewStyle } from 'react-native';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { useSession } from '@/lib/session';
import { tvBackdropUrls } from '@/lib/tv';
import { tvc, tvGradient } from '@/lib/tvTheme';

type Src = { id: string; posterUrl?: string | null; source?: string; video_ref?: string | null };

const rgba = (hex: string, a: number) => {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
};

export function TvBackdrop({ talk, style, side = 0.62, uri, bg = tvc.bg }: { talk?: Src | null; style?: StyleProp<ViewStyle>; side?: number; uri?: string | null; bg?: string }) {
  const v = (a: number) => rgba(bg, a);
  const { isRTL } = useSession();
  const urls = uri ? [uri] : talk ? tvBackdropUrls(talk) : [];
  const key = urls.join('|');
  const [i, setI] = useState(0);
  useEffect(() => { setI(0); }, [key]);
  const src = urls[i];
  return (
    <View pointerEvents="none" style={[{ position: 'absolute', overflow: 'hidden', backgroundColor: bg }, style]}>
      <LinearGradient colors={talk ? tvGradient(talk.id) : [tvc.panel, bg]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={{ position: 'absolute', top: 0, bottom: 0, left: 0, right: 0, opacity: 0.5 }} />
      {src ? (
        <Image source={{ uri: src }} style={{ position: 'absolute', top: 0, bottom: 0, left: 0, right: 0 }} contentFit="cover" transition={250}
          // YouTube renvoie une petite image grise (120 px) quand la version haute définition n'existe pas : on passe à la suivante.
          onLoad={(e) => { if (e.source.width > 0 && e.source.width <= 120 && i < urls.length - 1) setI(i + 1); }}
          onError={() => { if (i < urls.length - 1) setI(i + 1); }} />
      ) : null}
      <LinearGradient colors={[bg, v(0.88), v(0.25), v(0)]} locations={[0, side * 0.42, side * 0.94, Math.min(1, side * 1.2)]}
        start={{ x: isRTL ? 1 : 0, y: 0 }} end={{ x: isRTL ? 0 : 1, y: 0 }} style={{ position: 'absolute', top: 0, bottom: 0, left: 0, right: 0 }} />
      <LinearGradient colors={[v(0), v(0), bg]} locations={[0, 0.55, 1]} style={{ position: 'absolute', top: 0, bottom: 0, left: 0, right: 0 }} />
    </View>
  );
}
