#!/bin/sh
# Étape E0 — médias d'essai synthétiques (aucune vraie conférence nécessaire) : FFmpeg seulement.
#   source.mp4    : 3 min, 1920x1080, 25 i/s, image de test + son (voix d'origine simulée)
#   voice_fr.m4a  : « voix française » simulée (bips de parole) pour tester le ducking
#   music.m4a     : fond musical simulé (accord doux)
#   logo.png      : logo carré transparent
#   subs_fr.vtt   : sous-titres français du fichier source (temps de la SOURCE)
# Usage : sh make_media.sh [dossier]   (par défaut : ./media)
set -e
OUT="${1:-media}"
mkdir -p "$OUT"
ffmpeg -hide_banner -loglevel error -y \
  -f lavfi -i "testsrc2=size=1920x1080:rate=25:duration=180" \
  -f lavfi -i "sine=frequency=220:sample_rate=48000:duration=180,volume=0.6" \
  -map 0:v -map 1:a -c:v libx264 -preset veryfast -crf 23 -pix_fmt yuv420p -c:a aac -b:a 128k -shortest "$OUT/source.mp4"
# Voix française : 1,6 s de « parole » toutes les 2,5 s (bips modulés), 110 s.
ffmpeg -hide_banner -loglevel error -y -f lavfi \
  -i "aevalsrc='0.5*sin(2*PI*520*t)*sin(2*PI*3*t)*lt(mod(t\,2.5)\,1.6)':s=48000:d=110" -c:a aac -b:a 96k "$OUT/voice_fr.m4a"
ffmpeg -hide_banner -loglevel error -y -f lavfi \
  -i "aevalsrc='0.2*sin(2*PI*261.6*t)+0.15*sin(2*PI*329.6*t)+0.12*sin(2*PI*392*t)':s=48000:d=40" -c:a aac -b:a 96k "$OUT/music.m4a"
ffmpeg -hide_banner -loglevel error -y -f lavfi \
  -i "color=c=0xE0A43A@1.0:s=220x220,format=rgba,geq=r='224':g='164':b='58':a='if(lt(hypot(X-110\,Y-110)\,100)\,230\,0)'" -frames:v 1 "$OUT/logo.png"
cat > "$OUT/subs_fr.vtt" <<'VTT'
WEBVTT

00:00:12.000 --> 00:00:16.000
Au nom d'Allah, le Tout Miséricordieux.

00:00:20.000 --> 00:00:25.000
La patience est une lumière.

00:00:40.000 --> 00:00:46.000
Ce passage sera coupé au montage.

00:01:15.000 --> 00:01:20.000
Deuxième partie de la conférence.

00:01:30.000 --> 00:01:36.000
الصبر ضياء — la patience est une clarté.

00:02:40.000 --> 00:02:45.000
Dernière phrase avant la conclusion.
VTT
echo "Médias d'essai prêts dans $OUT/"
