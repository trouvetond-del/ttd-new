-- Partenaires box de stockage : liste, emails de partenariat, parrainage client sécurisé (25 € remboursés).
CREATE TABLE IF NOT EXISTS public.storage_partners (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 code text NOT NULL UNIQUE CHECK (code ~ '^BOX-[A-Z]{1,8}-[A-Z0-9]{4}$'),
 name text NOT NULL, city text NOT NULL, zone text, address text, phone text,
 email text, contact_form text, website text, partner_type text, source_url text,
 status text NOT NULL DEFAULT 'nouveau' CHECK (status IN ('nouveau','contacte','relance','a_repondu','a_appeler','interesse','partenaire','refuse')),
 active boolean NOT NULL DEFAULT true,
 emails_sent int NOT NULL DEFAULT 0,
 last_email_at timestamptz, last_email_kind text, gmail_thread_id text,
 notes text,
 created_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE (name, city)
);
GRANT SELECT ON public.storage_partners TO authenticated;
GRANT UPDATE (status, notes, active, email, phone) ON public.storage_partners TO authenticated;
GRANT ALL ON public.storage_partners TO service_role;
ALTER TABLE public.storage_partners ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS sp_admin_read ON public.storage_partners;
CREATE POLICY sp_admin_read ON public.storage_partners FOR SELECT TO authenticated USING (EXISTS (SELECT 1 FROM public.admins a WHERE a.user_id=auth.uid()));
DROP POLICY IF EXISTS sp_admin_update ON public.storage_partners;
CREATE POLICY sp_admin_update ON public.storage_partners FOR UPDATE TO authenticated USING (EXISTS (SELECT 1 FROM public.admins a WHERE a.user_id=auth.uid())) WITH CHECK (EXISTS (SELECT 1 FROM public.admins a WHERE a.user_id=auth.uid()));

CREATE TABLE IF NOT EXISTS public.storage_partner_emails (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 partner_id uuid NOT NULL REFERENCES public.storage_partners(id) ON DELETE CASCADE,
 kind text NOT NULL CHECK (kind IN ('premier','relance')),
 sent_by text NOT NULL, ok boolean NOT NULL, error text,
 created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.storage_partner_emails TO authenticated;
GRANT ALL ON public.storage_partner_emails TO service_role;
ALTER TABLE public.storage_partner_emails ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS spe_admin_read ON public.storage_partner_emails;
CREATE POLICY spe_admin_read ON public.storage_partner_emails FOR SELECT TO authenticated USING (EXISTS (SELECT 1 FROM public.admins a WHERE a.user_id=auth.uid()));

-- Un client = un seul parrainage, posé uniquement par la fonction sécurisée ci-dessous.
CREATE TABLE IF NOT EXISTS public.partner_referrals (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 client_user_id uuid NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
 partner_id uuid NOT NULL REFERENCES public.storage_partners(id),
 created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.partner_referrals TO authenticated;
GRANT ALL ON public.partner_referrals TO service_role;
ALTER TABLE public.partner_referrals ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS pr_admin_read ON public.partner_referrals;
CREATE POLICY pr_admin_read ON public.partner_referrals FOR SELECT TO authenticated USING (EXISTS (SELECT 1 FROM public.admins a WHERE a.user_id=auth.uid()));

-- Remboursement 25 € : une seule fois par client, par déménagement, par email client.
CREATE TABLE IF NOT EXISTS public.partner_rewards (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 referral_id uuid NOT NULL UNIQUE REFERENCES public.partner_referrals(id),
 client_user_id uuid NOT NULL UNIQUE,
 client_email text NOT NULL UNIQUE,
 quote_request_id uuid NOT NULL UNIQUE,
 partner_id uuid NOT NULL REFERENCES public.storage_partners(id),
 amount_eur numeric NOT NULL DEFAULT 25 CHECK (amount_eur = 25),
 status text NOT NULL DEFAULT 'a_verifier' CHECK (status IN ('a_verifier','paye','refuse')),
 decided_by uuid, decided_at timestamptz,
 created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.partner_rewards TO authenticated;
GRANT UPDATE (status) ON public.partner_rewards TO authenticated;
GRANT ALL ON public.partner_rewards TO service_role;
ALTER TABLE public.partner_rewards ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS prw_admin_read ON public.partner_rewards;
CREATE POLICY prw_admin_read ON public.partner_rewards FOR SELECT TO authenticated USING (EXISTS (SELECT 1 FROM public.admins a WHERE a.user_id=auth.uid()));
DROP POLICY IF EXISTS prw_admin_decide ON public.partner_rewards;
CREATE POLICY prw_admin_decide ON public.partner_rewards FOR UPDATE TO authenticated
 USING (status='a_verifier' AND EXISTS (SELECT 1 FROM public.admins a WHERE a.user_id=auth.uid()))
 WITH CHECK (status IN ('paye','refuse'));
CREATE OR REPLACE FUNCTION public.partner_reward_stamp() RETURNS trigger LANGUAGE plpgsql SET search_path=public AS $$
BEGIN
 IF auth.uid() IS NOT NULL THEN
  IF OLD.status <> 'a_verifier' THEN RAISE EXCEPTION 'Décision déjà enregistrée'; END IF;
  NEW.decided_by := auth.uid(); NEW.decided_at := now();
 END IF; RETURN NEW;
END; $$;
DROP TRIGGER IF EXISTS partner_reward_stamp ON public.partner_rewards;
CREATE TRIGGER partner_reward_stamp BEFORE UPDATE ON public.partner_rewards FOR EACH ROW EXECUTE FUNCTION public.partner_reward_stamp();

-- Appelée par le site après connexion quand le client est arrivé avec un QR code.
-- Refusée si : code inconnu/désactivé, compte créé il y a plus de 48 h, client ayant déjà une demande antérieure, ou déjà parrainé.
CREATE OR REPLACE FUNCTION public.attach_partner_referral(p_code text) RETURNS text
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE uid uuid := auth.uid(); pid uuid; created timestamptz;
BEGIN
 IF uid IS NULL THEN RETURN 'non_connecte'; END IF;
 SELECT id INTO pid FROM storage_partners WHERE code = upper(trim(p_code)) AND active;
 IF pid IS NULL THEN RETURN 'code_invalide'; END IF;
 IF EXISTS (SELECT 1 FROM admins WHERE user_id=uid) OR EXISTS (SELECT 1 FROM movers WHERE user_id=uid) THEN RETURN 'non_client'; END IF;
 SELECT u.created_at INTO created FROM auth.users u WHERE u.id=uid;
 IF created < now() - interval '48 hours' THEN RETURN 'compte_ancien'; END IF;
 IF EXISTS (SELECT 1 FROM quote_requests q WHERE q.client_user_id=uid AND q.created_at < now() - interval '48 hours') THEN RETURN 'compte_ancien'; END IF;
 INSERT INTO partner_referrals(client_user_id, partner_id) VALUES (uid, pid) ON CONFLICT (client_user_id) DO NOTHING;
 RETURN 'ok';
END; $$;
REVOKE ALL ON FUNCTION public.attach_partner_referral(text) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.attach_partner_referral(text) TO authenticated;

-- Crée les remboursements à vérifier : uniquement quand un déménagement payé via le site est validé terminé.
CREATE OR REPLACE FUNCTION public.refresh_partner_rewards() RETURNS int
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE n int;
BEGIN
 INSERT INTO partner_rewards(referral_id, client_user_id, client_email, quote_request_id, partner_id)
 SELECT DISTINCT ON (r.id) r.id, r.client_user_id, lower(u.email), q.id, r.partner_id
 FROM partner_referrals r
 JOIN auth.users u ON u.id = r.client_user_id
 JOIN quote_requests q ON q.client_user_id = r.client_user_id AND q.created_at >= r.created_at - interval '48 hours'
 JOIN payments p ON p.quote_request_id = q.id AND p.mission_completion_status = 'approved'
 JOIN storage_partners sp ON sp.id = r.partner_id
 WHERE u.email IS NOT NULL AND lower(u.email) IS DISTINCT FROM lower(sp.email)
 ORDER BY r.id, q.created_at
 ON CONFLICT DO NOTHING;
 GET DIAGNOSTICS n = ROW_COUNT; RETURN n;
END; $$;
REVOKE ALL ON FUNCTION public.refresh_partner_rewards() FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.refresh_partner_rewards() TO service_role;
INSERT INTO public.storage_partners(code,name,city,zone,address,phone,email,contact_form,website,partner_type,source_url,status) VALUES
('BOX-BOULOGNE-252R','Une Pièce en Plus – boulogne','Boulogne-Billancourt','Île-de-France','23 quai Alphonse le Gallo, 92100','01 41 31 22 22','site.boulogne@unepieceenplus.com',NULL,'unepieceenplus.com','Chain','https://www.unepieceenplus.com/garde-meuble/ile-de-france/hauts-de-seine-92/boulogne/','nouveau'),
('BOX-CERGY-EJ6Y','Une Pièce en Plus – cergy-pontoise','Cergy','Île-de-France','12 rue Lavoisier, 95300','01 77 86 31 00','site.pontoise@unepieceenplus.com',NULL,'unepieceenplus.com','Chain','https://www.unepieceenplus.com/garde-meuble/ile-de-france/','nouveau'),
('BOX-CLICHY-DAN6','Une Pièce en Plus – clichy','Clichy','Île-de-France','200 quai de Clichy, 92110','01 49 68 01 20','site.clichy@unepieceenplus.com',NULL,'unepieceenplus.com','Chain','https://www.unepieceenplus.com/garde-meuble/ile-de-france/hauts-de-seine-92/clichy/','nouveau'),
('BOX-COLOMBES-X7BE','Une Pièce en Plus – colombes','Colombes','Île-de-France','32 Avenue Kléber, 92700','01 59 46 01 83','site.colombes@unepieceenplus.com',NULL,'unepieceenplus.com','Chain','https://www.unepieceenplus.com/garde-meuble/ile-de-france/hauts-de-seine-92/colombes/','nouveau'),
('BOX-PARIS-6YKK','Une Pièce en Plus – convention','Paris 15','Île-de-France','159, rue Blomet, 75015','01 56 08 32 32','site.convention@unepieceenplus.com',NULL,'unepieceenplus.com','Chain','https://www.unepieceenplus.com/garde-meuble/ile-de-france/paris-75/convention/','nouveau'),
('BOX-LE-SM3D','Une Pièce en Plus – kremlin-bicetre','Le Kremlin-Bicêtre','Île-de-France','54-56 rue de la Convention, 94270','01 53 14 22 30','site.kremlinbicetre@unepieceenplus.com',NULL,'unepieceenplus.com','Chain','https://www.unepieceenplus.com/garde-meuble/ile-de-france/val-de-marne-94/kremlin-bicetre/','nouveau'),
('BOX-NANTERRE-NWWD','Une Pièce en Plus – la-defense','Nanterre (La Défense)','Île-de-France','1 rue Gerty Archimède, 92000','01 59 46 01 84','site.ladefense@unepieceenplus.com',NULL,'unepieceenplus.com','Chain','https://www.unepieceenplus.com/garde-meuble/ile-de-france/hauts-de-seine-92/la-defense/','nouveau'),
('BOX-SAINTDEN-7WVZ','Une Pièce en Plus – la-plaine-saint-denis','Saint-Denis','Île-de-France','203 avenue du Président Wilson, 93210','01 49 46 22 81','site.saintdenis2@unepieceenplus.com',NULL,'unepieceenplus.com','Chain','https://www.unepieceenplus.com/garde-meuble/ile-de-france/seine-saint-denis-93/la-plaine-saint-denis/','nouveau'),
('BOX-PARIS-QF52','Une Pièce en Plus – lafayette','Paris 10','Île-de-France','12, rue Rocroy, 75010','01 53 32 83 34','site.lafayette@unepieceenplus.com',NULL,'unepieceenplus.com','Chain','https://www.unepieceenplus.com/garde-meuble/ile-de-france/paris-75/lafayette/','nouveau'),
('BOX-PARIS-P7UY','Une Pièce en Plus – magenta','Paris 10','Île-de-France','3, rue de Dunkerque, 75010','01 84 95 25 00','site.magenta@unepieceenplus.com',NULL,'unepieceenplus.com','Chain','https://www.unepieceenplus.com/garde-meuble/ile-de-france/paris-75/magenta/','nouveau'),
('BOX-PARIS-3ZX2','Une Pièce en Plus – marais','Paris 3','Île-de-France','74 rue Vieille du Temple, 75003','01 53 01 90 00','site.marais@unepieceenplus.com',NULL,'unepieceenplus.com','Chain','https://www.unepieceenplus.com/garde-meuble/ile-de-france/paris-75/marais/','nouveau'),
('BOX-TORCY-A7JM','Une Pièce en Plus – marne-la-vallee-torcy','Torcy','Île-de-France','8/12 rue des Epinettes, 77600','01 75 73 26 00','site.torcy@unepieceenplus.com',NULL,'unepieceenplus.com','Chain','https://www.unepieceenplus.com/garde-meuble/ile-de-france/','nouveau'),
('BOX-PARIS-D8SU','Une Pièce en Plus – montparnasse','Paris 14','Île-de-France','24 rue du Commandant René Mouchotte, 75014','01 56 80 07 80','site.montparnasse@unepieceenplus.com',NULL,'unepieceenplus.com','Chain','https://www.unepieceenplus.com/garde-meuble/ile-de-france/paris-75/montparnasse/','nouveau'),
('BOX-NOISYLEG-TVUY','Une Pièce en Plus – noisy-le-grand','Noisy-le-Grand','Île-de-France','32 Rue du Ballon, 93160','01 59 46 00 20','site.noisylegrand@unepieceenplus.com',NULL,'unepieceenplus.com','Chain','https://www.unepieceenplus.com/garde-meuble/ile-de-france/seine-saint-denis-93/noisy-le-grand/','nouveau'),
('BOX-PARIS-HFB9','Une Pièce en Plus – place-d-italie','Paris 13','Île-de-France','20-22, rue Barrault, 75013','01 43 13 32 00','site.italie@unepieceenplus.com',NULL,'unepieceenplus.com','Chain','https://www.unepieceenplus.com/garde-meuble/ile-de-france/paris-75/place-d-italie/','nouveau'),
('BOX-PARIS-64SJ','Une Pièce en Plus – porte-d-aubervilliers','Paris 18','Île-de-France','215 rue d''Aubervilliers, 75018','01 44 65 65 57','site.macdonald@unepieceenplus.com',NULL,'unepieceenplus.com','Chain','https://www.unepieceenplus.com/garde-meuble/ile-de-france/paris-75/porte-d-aubervilliers/','nouveau'),
('BOX-ARCUEIL-ABEU','Une Pièce en Plus – porte-d-orleans-arcueil','Arcueil','Île-de-France','24 rue Berthollet, 94110','01 49 85 11 11','site.arcueil@unepieceenplus.com',NULL,'unepieceenplus.com','Chain','https://www.unepieceenplus.com/garde-meuble/ile-de-france/val-de-marne-94/porte-d-orleans-arcueil/','nouveau'),
('BOX-GENTILLY-BV4N','Une Pièce en Plus – porte-d-orleans-gentilly','Gentilly','Île-de-France','119 avenue Paul Vaillant Couturier, 94250','01 49 85 14 14','site.gentilly@unepieceenplus.com',NULL,'unepieceenplus.com','Chain','https://www.unepieceenplus.com/garde-meuble/ile-de-france/val-de-marne-94/porte-d-orleans-gentilly/','nouveau'),
('BOX-CHARENTO-MF9G','Une Pièce en Plus – porte-de-bercy-charenton','Charenton-le-Pont','Île-de-France','20 rue Escoffier, 94220','01 48 93 10 00','site.charenton@unepieceenplus.com',NULL,'unepieceenplus.com','Chain','https://www.unepieceenplus.com/garde-meuble/ile-de-france/val-de-marne-94/porte-de-bercy-charenton/','nouveau'),
('BOX-SAINTOUE-PYYT','Une Pièce en Plus – porte-de-clignancourt-saint-ouen','Saint-Ouen','Île-de-France','45/57 avenue Michelet, 93400','01 40 10 10 25','site.saintouen@unepieceenplus.com',NULL,'unepieceenplus.com','Chain','https://www.unepieceenplus.com/garde-meuble/ile-de-france/seine-saint-denis-93/porte-de-clignancourt-saint-ouen/','nouveau'),
('BOX-SAINTDEN-W8NB','Une Pièce en Plus – porte-de-la-chapelle-saint-denis','Saint-Denis','Île-de-France','151, avenue du Président Wilson, 93210','01 49 46 46 46','site.saintdenis1@unepieceenplus.com',NULL,'unepieceenplus.com','Chain','https://www.unepieceenplus.com/garde-meuble/ile-de-france/seine-saint-denis-93/porte-de-la-chapelle-saint-denis/','nouveau'),
('BOX-IVRYSURS-K4NE','Une Pièce en Plus – quai-d-ivry','Ivry-sur-Seine','Île-de-France','31 quai Marcel Boyer, 94200','01 49 60 10 10','site.ivry@unepieceenplus.com',NULL,'unepieceenplus.com','Chain','https://www.unepieceenplus.com/garde-meuble/ile-de-france/val-de-marne-94/quai-d-ivry/','nouveau'),
('BOX-PARIS-RKQS','Une Pièce en Plus – rue-cardinet','Paris 17','Île-de-France','114, rue du Cardinet, 75017','01 56 33 22 22','site.cardinet@unepieceenplus.com',NULL,'unepieceenplus.com','Chain','https://www.unepieceenplus.com/garde-meuble/ile-de-france/paris-75/rue-cardinet/','nouveau'),
('BOX-PARIS-YFMR','Une Pièce en Plus – rue-des-pyrenees','Paris 20','Île-de-France','57 rue des Pyrénées, 75020','01 58 39 30 00','site.pyrenees@unepieceenplus.com',NULL,'unepieceenplus.com','Chain','https://www.unepieceenplus.com/garde-meuble/ile-de-france/paris-75/rue-des-pyrenees/','nouveau'),
('BOX-PARIS-823C','Shurgard – paris-09-haussmann-gare-saint-lazare','Paris 9','Île-de-France','118 rue de Provence, 75009','01 89 61 09 77',NULL,'https://www.shurgard.com/fr-fr/contacter','shurgard.com','Chain','https://www.shurgard.com/fr-fr/garde-meuble/paris/paris-09-haussmann-gare-saint-lazare','a_appeler'),
('BOX-PARIS-EBH3','Shurgard – paris-10-gare-de-l-est','Paris 10','Île-de-France','21-23 rue Eugène Varlin, 75010','01 40 35 34 35',NULL,'https://www.shurgard.com/fr-fr/contacter','shurgard.com','Chain','https://www.shurgard.com/fr-fr/garde-meuble/paris/paris-10-gare-de-l-est','a_appeler'),
('BOX-PARIS-APBH','Shurgard – paris-12-bercy-village','Paris 12','Île-de-France','12 rue de Libourne, 75012','01 89 61 09 78',NULL,'https://www.shurgard.com/fr-fr/contacter','shurgard.com','Chain','https://www.shurgard.com/fr-fr/garde-meuble/paris/paris-12-bercy-village','a_appeler'),
('BOX-PARIS-Z42K','Shurgard – paris-12-nation','Paris 12','Île-de-France','21 rue de Toul, 75012','01 43 46 26 40',NULL,'https://www.shurgard.com/fr-fr/contacter','shurgard.com','Chain','https://www.shurgard.com/fr-fr/garde-meuble/paris/paris-12-nation','a_appeler'),
('BOX-PARIS-EN4R','Shurgard – paris-15-balard','Paris 15','Île-de-France','123 avenue Félix Faure, 75015','01 85 65 07 53',NULL,'https://www.shurgard.com/fr-fr/contacter','shurgard.com','Chain','https://www.shurgard.com/fr-fr/garde-meuble/paris/paris-15-balard','a_appeler'),
('BOX-PARIS-TTRR','Shurgard – paris-18-porte-de-clignancourt','Paris 18','Île-de-France','96 rue des Poissonniers, 75018','01 42 62 25 80',NULL,'https://www.shurgard.com/fr-fr/contacter','shurgard.com','Chain','https://www.shurgard.com/fr-fr/garde-meuble/paris/paris-18-porte-de-clignancourt','a_appeler'),
('BOX-PARIS-27PZ','Shurgard – paris-19-porte-de-pantin','Paris 19','Île-de-France','169 avenue Jean Jaurès, 75019','01 44 52 25 80',NULL,'https://www.shurgard.com/fr-fr/contacter','shurgard.com','Chain','https://www.shurgard.com/fr-fr/garde-meuble/paris/paris-19-porte-de-pantin','a_appeler'),
('BOX-LILLE-MV87','Shurgard – lille-rues-pietonnes','Lille','Lille','6 rue de la Riviérette, 59800','03 20 98 88 27',NULL,'https://www.shurgard.com/fr-fr/contacter','shurgard.com','Chain','https://www.shurgard.com/fr-fr/garde-meuble/lille/lille-rues-pietonnes','a_appeler'),
('BOX-WAMBRECH-YX5V','Shurgard – lille-wambrechies','Wambrechies','Lille','151 rue de l''Union, 59118','03 20 39 14 25',NULL,'https://www.shurgard.com/fr-fr/contacter','shurgard.com','Chain','https://www.shurgard.com/fr-fr/garde-meuble/lille/lille-wambrechies','a_appeler'),
('BOX-WASQUEHA-GYT7','Shurgard – lille-wasquehal','Wasquehal','Lille','4 avenue Grand Cottignies, 59290','03 20 98 88 27',NULL,'https://www.shurgard.com/fr-fr/contacter','shurgard.com','Chain','https://www.shurgard.com/fr-fr/garde-meuble/lille/lille-wasquehal','a_appeler'),
('BOX-WATTIGNI-3VNB','Shurgard – lille-wattignies','Wattignies','Lille','37 rue Clémenceau, 59139','03 20 32 46 46',NULL,'https://www.shurgard.com/fr-fr/contacter','shurgard.com','Chain','https://www.shurgard.com/fr-fr/garde-meuble/lille/lille-wattignies','a_appeler'),
('BOX-LYON-JVJT','Shurgard – lyon-cite-internationale','Lyon 6','Lyon','64 quai Charles de Gaulle, 69006','04 87 93 02 91',NULL,'https://www.shurgard.com/fr-fr/contacter','shurgard.com','Chain','https://www.shurgard.com/fr-fr/garde-meuble/lyon/lyon-cite-internationale','a_appeler'),
('BOX-LYON-ESPX','Shurgard – lyon-etats-unis','Lyon 8','Lyon','6 rue Jean Sarrazin, 69008','04 78 75 01 06',NULL,'https://www.shurgard.com/fr-fr/contacter','shurgard.com','Chain','https://www.shurgard.com/fr-fr/garde-meuble/lyon/lyon-etats-unis','a_appeler'),
('BOX-LYON-FATF','Shurgard – lyon-gerland','Lyon 7','Lyon','120 rue Challemel-Lacour, 69007','04 72 76 25 80',NULL,'https://www.shurgard.com/fr-fr/contacter','shurgard.com','Chain','https://www.shurgard.com/fr-fr/garde-meuble/lyon/lyon-gerland','a_appeler'),
('BOX-LYON-2U7V','Shurgard – lyon-jean-mace','Lyon 7','Lyon','13 rue de Toulon, 69007','04 37 37 13 13',NULL,'https://www.shurgard.com/fr-fr/contacter','shurgard.com','Chain','https://www.shurgard.com/fr-fr/garde-meuble/lyon/lyon-jean-mace','a_appeler'),
('BOX-LYON-2EDJ','Shurgard – lyon-vaise','Lyon 9','Lyon','24 avenue Joannes Masset, 69009','04 78 83 05 81',NULL,'https://www.shurgard.com/fr-fr/contacter','shurgard.com','Chain','https://www.shurgard.com/fr-fr/garde-meuble/lyon/lyon-vaise','a_appeler'),
('BOX-MARSEILL-PV3H','Shurgard – marseille-bonneveine','Marseille 9','Marseille','22 boulevard de l''Océan, 13009','04 91 72 44 29',NULL,'https://www.shurgard.com/fr-fr/contacter','shurgard.com','Chain','https://www.shurgard.com/fr-fr/garde-meuble/marseille/marseille-bonneveine','a_appeler'),
('BOX-MARSEILL-B8XN','Shurgard – marseille-le-canet','Marseille 14','Marseille','162 boulevard Danielle Casanova, 13014','04 91 21 80 00',NULL,'https://www.shurgard.com/fr-fr/contacter','shurgard.com','Chain','https://www.shurgard.com/fr-fr/garde-meuble/marseille/marseille-le-canet','a_appeler'),
('BOX-MARSEILL-J5XJ','Shurgard – marseille-les-arnavaux','Marseille 14','Marseille','42 boulevard Capitaine Gèze, 13014','04 91 67 25 80',NULL,'https://www.shurgard.com/fr-fr/contacter','shurgard.com','Chain','https://www.shurgard.com/fr-fr/garde-meuble/marseille/marseille-les-arnavaux','a_appeler'),
('BOX-NICE-2XB6','Shurgard – nice-aeroport','Nice','Nice','not found in the sources checked (city page not parsed)','04 92 01 00 10',NULL,'https://www.shurgard.com/fr-fr/contacter','shurgard.com','Chain','https://www.shurgard.com/fr-fr/garde-meuble/nice/nice-aeroport','a_appeler'),
('BOX-NICE-DWT2','Shurgard – nice-saint-isidore','Nice','Nice','not found in the sources checked (city page not parsed)','04 92 29 10 29',NULL,'https://www.shurgard.com/fr-fr/contacter','shurgard.com','Chain','https://www.shurgard.com/fr-fr/garde-meuble/nice/nice-saint-isidore','a_appeler'),
('BOX-LORMONT-ZJ9C','Shurgard – bordeaux-lormont','Lormont','Bordeaux','ZI des 4 Pavillons, allée René Cassagne, 33310','05 56 06 28 80',NULL,'https://www.shurgard.com/fr-fr/contacter','shurgard.com','Chain','https://www.shurgard.com/fr-fr/garde-meuble/bordeaux/bordeaux-lormont','a_appeler'),
('BOX-MERIGNAC-M9VG','Shurgard – bordeaux-merignac','Mérignac','Bordeaux','43 rue Jacques Prévert, 33700','05 56 47 35 91',NULL,'https://www.shurgard.com/fr-fr/contacter','shurgard.com','Chain','https://www.shurgard.com/fr-fr/garde-meuble/bordeaux/bordeaux-merignac','a_appeler'),
('BOX-PESSAC-SFVF','Shurgard – bordeaux-pessac','Pessac','Bordeaux','2 bis avenue Gustave Eiffel, 33600','05 57 26 83 90',NULL,'https://www.shurgard.com/fr-fr/contacter','shurgard.com','Chain','https://www.shurgard.com/fr-fr/garde-meuble/bordeaux/bordeaux-pessac','a_appeler'),
('BOX-LEZENNES-ZV3Q','Homebox Lille-Lezennes','Lezennes','Lille','4 rue Paul Langevin, 59260','03 28 80 05 00',NULL,NULL,'homebox.fr','Chain','https://www.homebox.fr/liste-des-gardes-meubles/garde-meuble-lille-lezennes-59260.html','a_appeler'),
('BOX-LOMME-6QQ8','Homebox Lomme','Lomme','Lille','Rue du Traité de Rome, 59160','03 74 91 01 00',NULL,NULL,'homebox.fr','Chain','https://www.homebox.fr/liste-des-gardes-meubles/garde-meuble-lomme.html','a_appeler'),
('BOX-CHAMPAGN-VMXJ','Homebox Lyon Ouest','Champagne-au-Mont-d''Or','Lyon','17 rue des Rosieristes, 69410','04 72 52 44 44',NULL,NULL,'homebox.fr','Chain','https://www.homebox.fr/liste-des-gardes-meubles/garde-meuble-lyon-ouest.html','a_appeler'),
('BOX-MARSEILL-WJ8Q','Homebox Marseille Littoral','Marseille 2','Marseille','173 chemin de la Madrague-Ville, 13002','04 91 21 41 00',NULL,NULL,'homebox.fr','Chain','https://www.homebox.fr/liste-des-gardes-meubles/garde-meuble-marseille-littoral-13002.html','a_appeler'),
('BOX-NICE-ZAG5','Homebox Nice','Nice','Nice','6 rue Leotardi, 06000','04 97 08 09 09',NULL,NULL,'homebox.fr','Chain','https://www.homebox.fr/liste-des-gardes-meubles/garde-meuble-nice.html','a_appeler'),
('BOX-TOULOUSE-BXZ6','Homebox Toulouse Babinet','Toulouse','Toulouse','14 rue Jacques Babinet, 31100','05 61 40 40 40',NULL,NULL,'homebox.fr','Chain','https://www.homebox.fr/liste-des-gardes-meubles/garde-meuble-toulouse-babinet.html','a_appeler'),
('BOX-BORDEAUX-GKE2','Homebox Bordeaux Centre','Bordeaux','Bordeaux','130 rue Achard, 33000','Several numbers on page; site number not confirmed',NULL,NULL,'homebox.fr','Chain','https://www.homebox.fr/liste-des-gardes-meubles/garde-meuble-bordeaux-centre-33000.html','a_appeler'),
('BOX-FOURNESE-752E','Blondel Box Nord (family mover + boxes)','Fournes-en-Weppes','Lille','2050 rue Faidherbe, 59134','03 20 07 34 47','contact@blondel-box-nord.fr',NULL,'blondel-box-nord.fr','Independent','http://www.blondel-box-nord.fr/','nouveau'),
('BOX-LILLE-NHFU','Atout-Box Lille (opening Nov.)','Lille','Lille','148 rue de Marquillies, 59000','03 75 75 06 70 / quotes 03 75 75 06 60',NULL,NULL,'atout-box.fr','Small regional network','https://www.atout-box.fr/ou-nous-trouver/garde-meuble-lille/','a_appeler'),
('BOX-SAINTAND-PKFD','Capstonebox Lille','Saint-André-lez-Lille','Lille','42 avenue du Maréchal de Lattre de Tassigny, 59350','HQ 09 78 45 15 00','capstonebox-lille@capstonebox.com',NULL,'capstonebox.com','Small network (3 sites)','https://www.capstonebox.com/nos-centres/capstonebox-lille/','nouveau'),
('BOX-MARCQENB-ZDMT','Carrébox Lille Pilaterie','Marcq-en-Barœul','Lille','13 rue du Houblon, 59700','03 20 30 08 00',NULL,NULL,'carrebox.fr','Regional network (9 sites)','https://www.carrebox.fr/','a_appeler'),
('BOX-BOISGREN-PHNB','Carrébox Lille-Armentières','Bois-Grenier','Lille','8 rue Ambroise Paré, 59280','03 20 10 51 10',NULL,NULL,'carrebox.fr','Regional network','https://www.carrebox.fr/','a_appeler'),
('BOX-RONCQ-UY23','Carrébox Lille-Tourcoing','Roncq','Lille','15b rue du Dronckaert, 59223','03 92 10 06 00',NULL,NULL,'carrebox.fr','Regional network','https://www.carrebox.fr/','a_appeler'),
('BOX-TOURCOIN-5EQN','Nordbox (3 centres Tourcoing/Roncq/Roubaix-Est)','Tourcoing','Lille','57 rue Victor Baltard, 59200 (address from search snippet of nordbox.fr homepage – homepage not opened)','03 74 09 82 23 (snippet)','contact@nordbox.fr',NULL,'nordbox.fr','Independent (local, 3 sites)','https://www.nordbox.fr/garde-meuble/','nouveau'),
('BOX-WAMBRECH-72D6','Locakase Lille','Wambrechies','Lille','ZA Le Chat, 59118','03 20 14 09 13',NULL,NULL,'locakase.fr','Regional network','https://www.locakase.fr/garde-meubles-en-france/garde-meuble-hauts-de-france','a_appeler'),
('BOX-LILLE-BAZ3','Secubox (founder Nicolas)','Lille metro (Lille, Marquette, Mouvaux, Fretin)','Lille','not found in the sources checked','03 74 01 41 20',NULL,NULL,'secubox.fr','Independent','https://www.secubox.fr/','a_appeler')
ON CONFLICT (name, city) DO NOTHING;
