-- Comptes de test (client + déménageur), identifiants fixes, pour la
-- couverture QA du flux de connexion. Réutilise exactement le pattern
-- déjà utilisé et validé sur ce projet pour les comptes admin
-- (20260127225259_recreate_all_admin_accounts_fixed.sql).

-- Nettoyage si déjà existants (rejouable)
DO $$
DECLARE
  v_user_id uuid;
BEGIN
  SELECT id INTO v_user_id FROM auth.users WHERE email = 'qa-test-client@trouvetondemenageur.fr';
  IF v_user_id IS NOT NULL THEN DELETE FROM auth.users WHERE id = v_user_id; END IF;

  SELECT id INTO v_user_id FROM auth.users WHERE email = 'qa-test-mover@trouvetondemenageur.fr';
  IF v_user_id IS NOT NULL THEN DELETE FROM auth.users WHERE id = v_user_id; END IF;
END $$;

-- ===================== Compte CLIENT de test =====================
DO $$
DECLARE
  v_user_id uuid := gen_random_uuid();
  v_identity_id uuid := gen_random_uuid();
BEGIN
  INSERT INTO auth.users (
    instance_id, id, aud, role, email, encrypted_password,
    email_confirmed_at, recovery_sent_at, last_sign_in_at,
    raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
    confirmation_token, email_change, email_change_token_new, recovery_token
  ) VALUES (
    '00000000-0000-0000-0000-000000000000', v_user_id, 'authenticated', 'authenticated',
    'qa-test-client@trouvetondemenageur.fr',
    extensions.crypt('QaTestClient2026!', extensions.gen_salt('bf')),
    NOW(), NOW(), NOW(),
    '{"provider":"email","providers":["email"]}',
    '{"full_name":"QA Test Client"}',
    NOW(), NOW(), '', '', '', ''
  );

  INSERT INTO auth.identities (
    id, provider_id, user_id, identity_data, provider, last_sign_in_at, created_at, updated_at
  ) VALUES (
    v_identity_id, v_user_id::text, v_user_id,
    format('{"sub":"%s","email":"%s"}', v_user_id::text, 'qa-test-client@trouvetondemenageur.fr')::jsonb,
    'email', NOW(), NOW(), NOW()
  );

  INSERT INTO clients (user_id, email, first_name, last_name, phone, profile_completed, created_at)
  VALUES (v_user_id, 'qa-test-client@trouvetondemenageur.fr', 'QA', 'TestClient', '0600000010', true, NOW());

  RAISE NOTICE 'Client QA cree: qa-test-client@trouvetondemenageur.fr';
END $$;

-- ===================== Compte DEMENAGEUR de test =====================
DO $$
DECLARE
  v_user_id uuid := gen_random_uuid();
  v_identity_id uuid := gen_random_uuid();
BEGIN
  INSERT INTO auth.users (
    instance_id, id, aud, role, email, encrypted_password,
    email_confirmed_at, recovery_sent_at, last_sign_in_at,
    raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
    confirmation_token, email_change, email_change_token_new, recovery_token
  ) VALUES (
    '00000000-0000-0000-0000-000000000000', v_user_id, 'authenticated', 'authenticated',
    'qa-test-mover@trouvetondemenageur.fr',
    extensions.crypt('QaTestMover2026!', extensions.gen_salt('bf')),
    NOW(), NOW(), NOW(),
    '{"provider":"email","providers":["email"]}',
    '{"full_name":"QA Test Mover"}',
    NOW(), NOW(), '', '', '', ''
  );

  INSERT INTO auth.identities (
    id, provider_id, user_id, identity_data, provider, last_sign_in_at, created_at, updated_at
  ) VALUES (
    v_identity_id, v_user_id::text, v_user_id,
    format('{"sub":"%s","email":"%s"}', v_user_id::text, 'qa-test-mover@trouvetondemenageur.fr')::jsonb,
    'email', NOW(), NOW(), NOW()
  );

  -- verification_status = 'verified' + is_active = true : sans ça, aucune
  -- des surfaces qu'on vient de corriger (liste de demandes, dashboard,
  -- relances) ne montrerait quoi que ce soit à ce compte, ce qui rendrait
  -- le test de connexion peu utile pour couvrir le reste du parcours.
  INSERT INTO movers (
    user_id, email, company_name, siret, phone,
    manager_firstname, manager_lastname, manager_phone,
    address, city, postal_code, description,
    services, coverage_type, activity_departments,
    verification_status, is_active, email_notifications_enabled,
    created_at
  ) VALUES (
    v_user_id, 'qa-test-mover@trouvetondemenageur.fr', 'QA Test Déménagement', '00000000000010', '0600000011',
    'QA', 'TestMover', '0600000011',
    '1 rue de Test', 'Paris', '75001', 'Compte de test QA',
    ARRAY['demenagement'], 'all_france', ARRAY[]::text[],
    'verified', true, true,
    NOW()
  );

  RAISE NOTICE 'Demenageur QA cree: qa-test-mover@trouvetondemenageur.fr';
END $$;
