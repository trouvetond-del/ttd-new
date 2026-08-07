-- Trouvé en audit : une ancienne policy INSERT très permissive existe
-- dans les fichiers de migration (create_moving_companies_schema.sql,
-- prototype abandonné) : "Authenticated users can create reviews",
-- WITH CHECK (auth.uid() = user_id) -- aucune vérification qu'une
-- mission ait réellement eu lieu. Le schéma qu'elle référence (user_id,
-- company_id) est incompatible avec la vraie table reviews actuelle
-- (client_id, mover_id, quote_id) : cette policy n'a très probablement
-- jamais pu être créée avec succès contre la vraie base. Verrou de
-- précaution par honnêteté, au cas où.
DROP POLICY IF EXISTS "Authenticated users can create reviews" ON reviews;
