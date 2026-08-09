-- Consentement SMS distinct du consentement email (marketing_consent).
-- En France, la prospection par SMS exige un consentement explicite
-- séparé de l'email (RGPD + Code des postes et communications
-- électroniques) -- case non cochée par défaut.
ALTER TABLE quote_requests
  ADD COLUMN IF NOT EXISTS sms_consent boolean NOT NULL DEFAULT false;
