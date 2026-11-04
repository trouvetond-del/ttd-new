-- Origine marketing de la demande (ex. 'calculateur' = venu du calculateur de prix).
alter table quote_requests add column if not exists acquisition_source text;
create index if not exists idx_quote_requests_acquisition_source
  on quote_requests (acquisition_source) where acquisition_source is not null;
