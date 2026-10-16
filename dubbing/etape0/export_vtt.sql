SELECT 'WEBVTT' || E'\n\n' || COALESCE(string_agg(
  lpad((start_ms/3600000)::text,2,'0') || ':' || lpad(((start_ms/60000)%60)::text,2,'0') || ':' || lpad(((start_ms/1000)%60)::text,2,'0') || '.' || lpad((start_ms%1000)::text,3,'0')
  || ' --> ' ||
  lpad((end_ms/3600000)::text,2,'0') || ':' || lpad(((end_ms/60000)%60)::text,2,'0') || ':' || lpad(((end_ms/1000)%60)::text,2,'0') || '.' || lpad((end_ms%1000)::text,3,'0')
  || E'\n' || text, E'\n\n' ORDER BY idx), '')
FROM transcript_segments WHERE talk_id = 'IDENTIFIANT' AND lang = 'zz';
