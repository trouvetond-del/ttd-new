-- Ajoute la colonne entry_channel sur quote_requests pour distinguer le
-- parcours d'entrée du lead : 'quick_lead' (/devis-rapide), 'full_form'
-- (/client/quote), 'ad_lead_form' (webhook publicitaire externe, pas
-- défini par ce code -- déduit côté front via additional_info en repli).
-- NULL = ancien enregistrement ou origine non trackée.
alter table quote_requests
  add column if not exists entry_channel text;

comment on column quote_requests.entry_channel is
  'Parcours d''entrée du lead : quick_lead, full_form, ad_lead_form, ou NULL (ancien enregistrement / origine inconnue).';

-- Ajoute reminder_type sur la table de log des relances pour que les
-- 3 types de relance (infos manquantes / brouillon non terminé / pas de
-- compte) aient chacun leur propre throttle 24h indépendant, au lieu de
-- se bloquer mutuellement.
alter table client_quote_reminder_log
  add column if not exists reminder_type text not null default 'missing_info';

create index if not exists idx_client_quote_reminder_log_request_type_sent
  on client_quote_reminder_log (quote_request_id, reminder_type, sent_at desc);
