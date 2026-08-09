-- Normalisation de la casse de movers.city. Constaté le 09/08 : "Paris",
-- "paris", "PARIS" comptés comme 3 villes distinctes -- fausse le
-- comptage de déménageurs par ville (pages villes SEO), le matching
-- géographique des demandes, et tout futur agrégat par ville.
--
-- initcap() met en majuscule chaque mot (y compris après un tiret), ce
-- qui donne un affichage propre et cohérent ("Saint-Étienne",
-- "Vigneux-Sur-Seine") sans prétendre reproduire parfaitement les
-- règles de typographie française (particules "sur"/"de" en minuscule) --
-- l'objectif ici est la cohérence, pas la perfection typographique.

UPDATE movers
SET city = initcap(trim(city))
WHERE city IS NOT NULL AND city <> initcap(trim(city));

-- Empêche la régression : normalise automatiquement à chaque
-- inscription ou modification de profil déménageur, pour que ce
-- nettoyage n'ait pas besoin d'être refait manuellement plus tard.
CREATE OR REPLACE FUNCTION normalize_mover_city()
RETURNS trigger AS $$
BEGIN
  IF NEW.city IS NOT NULL THEN
    NEW.city := initcap(trim(NEW.city));
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_normalize_mover_city ON movers;
CREATE TRIGGER trigger_normalize_mover_city
  BEFORE INSERT OR UPDATE OF city ON movers
  FOR EACH ROW
  EXECUTE FUNCTION normalize_mover_city();
