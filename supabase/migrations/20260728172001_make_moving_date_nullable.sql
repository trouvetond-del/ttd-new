/*
  # Rendre moving_date optionnelle sur quote_requests

  1. Contexte
    - Le formulaire /devis-rapide affiche la date de déménagement comme
      "(optionnel)", et le code applicatif (computeLeadScore) gère déjà
      correctement une date manquante (lead_score = 'inconnu').
    - La colonne `moving_date` était pourtant restée NOT NULL depuis la
      création initiale de la table, ce qui fait échouer l'insertion
      (violation de contrainte) dès qu'un lead publicitaire soumet le
      formulaire sans indiquer de date.

  2. Changement
    - Supprime la contrainte NOT NULL sur `quote_requests.moving_date`.
    - Purement additif : aucune donnée existante n'est modifiée, les
      lignes qui avaient déjà une date la conservent.
*/

ALTER TABLE quote_requests ALTER COLUMN moving_date DROP NOT NULL;
