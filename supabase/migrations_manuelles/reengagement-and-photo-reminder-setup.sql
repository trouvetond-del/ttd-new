-- Fonction dédiée pour identifier les clients à relancer (jamais utilisée
-- par le frontend, seulement par les edge functions de relance en
-- service_role) -- get_all_users() existante exige un admin authentifié
-- via auth.uid(), inutilisable depuis une fonction cron en service_role.
CREATE OR REPLACE FUNCTION get_inactive_clients(days_inactive int)
RETURNS TABLE (
  user_id uuid,
  email text,
  first_name text,
  last_sign_in_at timestamptz,
  created_at timestamptz
)
SECURITY DEFINER
SET search_path = public
LANGUAGE plpgsql
AS $$
BEGIN
  IF COALESCE(auth.role(), '') <> 'service_role' AND NOT EXISTS (
    SELECT 1 FROM admins WHERE admins.user_id = auth.uid()
  ) THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;

  RETURN QUERY
  SELECT
    c.user_id,
    c.email,
    c.first_name,
    u.last_sign_in_at,
    c.created_at
  FROM clients c
  JOIN auth.users u ON u.id = c.user_id
  WHERE COALESCE(u.last_sign_in_at, c.created_at) < now() - (days_inactive || ' days')::interval;
END;
$$;

-- Log de dédoublonnage pour l'email "protégez-vous, photographiez votre
-- mobilier" (envoyé une fois par demande complète, pas de spam)
CREATE TABLE IF NOT EXISTS photo_protection_reminder_log (
  id uuid primary key default gen_random_uuid(),
  quote_request_id uuid not null references quote_requests(id) on delete cascade unique,
  sent_at timestamptz not null default now()
);
ALTER TABLE photo_protection_reminder_log ENABLE ROW LEVEL SECURITY;

-- Log de dédoublonnage pour l'email de relance "vous nous manquez"
-- (1 fois par fenêtre d'inactivité, jamais plus d'1 tous les 21 jours par
-- client pour ne pas spammer quelqu'un qui a vraiment décidé de partir)
CREATE TABLE IF NOT EXISTS client_reengagement_email_log (
  id uuid primary key default gen_random_uuid(),
  client_user_id uuid not null references auth.users(id) on delete cascade,
  sent_at timestamptz not null default now()
);
CREATE INDEX IF NOT EXISTS idx_reengagement_log_client ON client_reengagement_email_log(client_user_id, sent_at desc);
ALTER TABLE client_reengagement_email_log ENABLE ROW LEVEL SECURITY;
