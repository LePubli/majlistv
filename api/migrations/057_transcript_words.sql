-- Étape E5a (éditeur de montage : montage par le texte) : mots horodatés de la transcription Whisper.
-- Une ligne par mot, rangée dans sa phrase (seg_idx = transcript_segments.idx). Écrits par le service de transcription
-- (réglage « Horodater chaque mot », activé par défaut). Les conférences transcrites avant cette étape n'en ont pas :
-- l'éditeur estime alors la place des mots dans chaque phrase (une nouvelle transcription donne les mots précis).
CREATE TABLE IF NOT EXISTS transcript_words (
  talk_id   uuid NOT NULL REFERENCES talks(id) ON DELETE CASCADE,
  lang      text NOT NULL,
  seg_idx   int  NOT NULL,
  idx       int  NOT NULL,
  start_ms  int  NOT NULL,
  end_ms    int  NOT NULL,
  word      text NOT NULL,
  PRIMARY KEY (talk_id, lang, seg_idx, idx)
);
