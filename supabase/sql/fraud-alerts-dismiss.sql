-- L'admin peut supprimer (masquer) une alerte traitée sans que l'agent la recrée.
ALTER TABLE public.fraud_alerts ADD COLUMN IF NOT EXISTS dismissed_at timestamptz;
