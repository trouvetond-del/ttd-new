-- Complète quick-lead-profile-completed.sql (qui avait déjà ajouté
-- reminder_sent_at sur clients, mais jamais exploité). Ajoute
-- reminder_count pour espacer les relances progressivement, même
-- pattern que partial_leads.

ALTER TABLE clients ADD COLUMN IF NOT EXISTS reminder_count integer NOT NULL DEFAULT 0;
