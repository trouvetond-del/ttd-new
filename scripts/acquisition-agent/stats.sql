\pset format unaligned
\pset tuples_only on
with cities(city) as (values ('Lille'),('Paris'),('Lyon'),('Marseille'),('Toulouse'),('Bordeaux'),('Nantes'),('Strasbourg'),('Nice'),('Montpellier')),
open_moves as (select from_city from public.list_open_moves())
select json_agg(json_build_object(
  'city', c.city,
  'quotes90d', (select count(*) from quote_requests q where q.from_city ilike '%'||c.city||'%' and q.deleted_at is null and q.created_at >= now() - interval '90 days'),
  'openQuotes', (select count(*) from open_moves o where coalesce(o.from_city,'') ilike '%'||c.city||'%'),
  'verifiedMovers', (select count(*) from movers m where m.city ilike '%'||c.city||'%' and m.verification_status = 'verified')
)) from cities c;
