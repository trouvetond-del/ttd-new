-- Les 8 villes validées (répartition réelle des déménageurs vérifiés,
-- voir échange du 09/08). Upsert idempotent sur slug : rejouable à
-- chaque déploiement sans dupliquer.

INSERT INTO city_pages (slug, nom_ville, departement, intro_locale, zones_desservies, statut)
VALUES
  ('paris', 'Paris', '75',
   'Déménager à Paris demande une organisation particulière : rues étroites, stationnement réglementé, ascenseurs parfois absents dans l''ancien. Nos déménageurs vérifiés connaissent ces contraintes et adaptent leur devis en conséquence.',
   ARRAY['Boulogne-Billancourt', 'Saint-Denis', 'Montreuil', 'Vincennes'], 'published'),

  ('lyon', 'Lyon', '69',
   'Entre presqu''île, pentes de la Croix-Rousse et périphérie, chaque quartier de Lyon a ses propres contraintes d''accès. Décrivez votre déménagement pour recevoir des devis adaptés à votre configuration.',
   ARRAY['Villeurbanne', 'Vénissieux', 'Caluire-et-Cuire'], 'published'),

  ('saint-etienne', 'Saint-Étienne', '42',
   'Ville en reconversion entre son passé industriel et ses nouveaux quartiers résidentiels, Saint-Étienne concentre des typologies de logement très variées. Nos déménageurs partenaires s''adaptent, du studio en centre-ville à la maison en périphérie.',
   ARRAY['Saint-Chamond', 'Roanne'], 'published'),

  ('lille', 'Lille', '59',
   'Entre le Vieux-Lille aux rues pavées et les grands ensembles de la périphérie, un déménagement à Lille demande une bonne connaissance du terrain. Trouvez un déménageur vérifié, assuré et adapté à votre trajet.',
   ARRAY['Roubaix', 'Tourcoing', 'Villeneuve-d''Ascq'], 'published'),

  ('marseille', 'Marseille', '13',
   'Deuxième ville de France, Marseille combine centre historique dense, quartiers résidentiels excentrés et un relief marqué. Comparez des devis de déménageurs habitués à ces spécificités locales.',
   ARRAY['Aix-en-Provence', 'Aubagne', 'La Ciotat'], 'published'),

  ('nantes', 'Nantes', '44',
   'Nantes et son agglomération connaissent une forte dynamique résidentielle. Que vous déménagiez du centre-ville vers l''île de Nantes ou en périphérie, nos déménageurs vérifiés s''occupent de votre trajet.',
   ARRAY['Rezé', 'Saint-Herblain', 'Vertou'], 'published'),

  ('bordeaux', 'Bordeaux', '33',
   'Entre le centre historique classé à l''UNESCO et les nouveaux quartiers en expansion, Bordeaux propose une grande diversité de logements. Recevez des devis de déménageurs adaptés à votre situation.',
   ARRAY['Mérignac', 'Pessac', 'Talence'], 'published'),

  ('toulouse', 'Toulouse', '31',
   'Ville rose en pleine croissance démographique, Toulouse voit son marché du déménagement se développer rapidement. Comparez des devis de professionnels vérifiés pour votre projet.',
   ARRAY['Blagnac', 'Colomiers', 'Tournefeuille'], 'published')

ON CONFLICT (slug) DO UPDATE SET
  nom_ville = EXCLUDED.nom_ville,
  departement = EXCLUDED.departement,
  intro_locale = EXCLUDED.intro_locale,
  zones_desservies = EXCLUDED.zones_desservies;
