-- Étape 17 : mode audio. Pour chaque vidéo envoyée, le worker produit une version « audio seul » (HLS AAC) : écoute écran éteint, peu de données.
-- pending = à produire (nouvelles conversions et vidéos déjà en ligne) ; ready = disponible ; none = pas de piste audio ou source externe ; failed = échec définitif.
ALTER TABLE talks ADD COLUMN audio_status text NOT NULL DEFAULT 'pending' CHECK (audio_status IN ('pending', 'ready', 'none', 'failed'));
ALTER TABLE talks ADD COLUMN audio_attempts int NOT NULL DEFAULT 0;
UPDATE talks SET audio_status = 'none' WHERE source <> 'upload';
CREATE INDEX idx_talks_audio_pending ON talks(created_at) WHERE source = 'upload' AND video_status = 'ready' AND audio_status = 'pending';
