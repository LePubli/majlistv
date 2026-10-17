"""Étape E1 — outils communs aux tests de l'éditeur de montage (API et navigateur).

make_hls(s3, talk_id, seconds, codec) fabrique une vraie vidéo HLS 360p (playlist v0, comme la conversion du worker) avec FFmpeg :
image de test qui affiche l'heure de la vidéo et un bip chaque seconde, puis la dépose dans le S3 de test (bucket majlis-videos).
codec='h264' : H.264 + AAC en segments .ts, comme le worker. codec='vp9' : VP9 + Opus en fMP4, pour le Chromium de test
de Playwright qui ne lit pas le H.264 (codec propriétaire absent de cette version) ; Chrome, Edge, Firefox et Safari lisent le H.264.
add_transcript(cur, talk_id, seconds) ajoute des phrases françaises de 6 s (sous-titres et voix française de l'éditeur)."""
import os, subprocess, tempfile

BUCKET = "majlis-videos"

def make_hls(s3, talk_id, seconds=120, codec="h264"):
    d = tempfile.mkdtemp(prefix="e1hls-")
    os.makedirs(os.path.join(d, "v0"))
    src = ["-f", "lavfi", "-i", f"testsrc2=size=640x360:rate=25:duration={seconds}",
           "-f", "lavfi", "-i", f"sine=frequency=660:beep_factor=4:duration={seconds}",
           "-vf", "drawtext=text='%{pts\\:hms}':fontsize=42:fontcolor=white:box=1:boxcolor=black@0.6:x=(w-tw)/2:y=h-70"]
    if codec == "vp9":
        enc = ["-c:v", "libvpx-vp9", "-deadline", "realtime", "-cpu-used", "8", "-b:v", "500k", "-g", "50", "-c:a", "libopus", "-b:a", "64k",
               "-hls_segment_type", "fmp4", "-hls_fmp4_init_filename", "init.mp4", "-hls_segment_filename", os.path.join(d, "v0", "seg_%03d.m4s")]
    else:
        enc = ["-c:v", "libx264", "-preset", "ultrafast", "-g", "50", "-c:a", "aac", "-b:a", "64k", "-hls_segment_filename", os.path.join(d, "v0", "seg_%03d.ts")]
    subprocess.run(["ffmpeg", "-v", "error", "-y", *src, *enc, "-f", "hls", "-hls_time", "4", "-hls_playlist_type", "vod",
                    os.path.join(d, "v0", "index.m3u8")], check=True, cwd=os.path.join(d, "v0"))
    with open(os.path.join(d, "master.m3u8"), "w") as f:
        f.write("#EXTM3U\n#EXT-X-STREAM-INF:BANDWIDTH=900000,RESOLUTION=640x360\nv0/index.m3u8\n")
    for root, _, files in os.walk(d):
        for fn in files:
            p = os.path.join(root, fn)
            key = f"hls/{talk_id}/" + os.path.relpath(p, d)
            ct = "application/vnd.apple.mpegurl" if fn.endswith(".m3u8") else "video/mp2t" if fn.endswith(".ts") else "video/mp4"
            s3.upload_file(p, BUCKET, key, ExtraArgs={"ContentType": ct})
    return d

def add_transcript(cur, talk_id, seconds=120, step=6):
    n = 0
    for i, s in enumerate(range(0, seconds - 2, step)):
        cur.execute("insert into transcript_segments(talk_id, lang, idx, start_ms, end_ms, text) values (%s,'fr',%s,%s,%s,%s) on conflict do nothing",
                    (talk_id, i, s * 1000, (s + step - 1) * 1000, f"Phrase {i + 1} de la conférence, de {s} à {s + step - 1} secondes."))
        n += 1
    return n
