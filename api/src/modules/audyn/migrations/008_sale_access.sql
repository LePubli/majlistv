-- Étape C-1 : contenu Audyn en vente à l'unité → accès « Apprentissage » forcé (fonction créée par la migration 118 du socle).
-- Sur une base où la migration 118 a déjà posé ce déclencheur, rien ne change.
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trg_sale_audyn_access') THEN
    CREATE TRIGGER trg_sale_audyn_access BEFORE INSERT OR UPDATE OF access ON audyn_items FOR EACH ROW EXECUTE FUNCTION sale_force_audyn_access();
  END IF;
END $$;
