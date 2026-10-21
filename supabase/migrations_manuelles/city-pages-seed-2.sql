-- 42 villes supplémentaires (SEO : 50 pages « Déménageur + ville »). Upsert idempotent.

INSERT INTO city_pages (slug, nom_ville, departement, intro_locale, zones_desservies, statut)
VALUES
  ('nice', 'Nice', '06',
   'Entre le Vieux-Nice aux ruelles étroites, les collines résidentielles et la Promenade des Anglais, un déménagement à Nice demande souvent un monte-meuble et une autorisation de stationnement.',
   ARRAY['Saint-Laurent-du-Var', 'Cagnes-sur-Mer', 'Antibes'], 'published'),

  ('montpellier', 'Montpellier', '34',
   'Montpellier attire chaque année étudiants et jeunes actifs. Entre l''Écusson piéton, Port Marianne et les communes voisines, nos déménageurs vérifiés adaptent le devis à l''accès réel de votre logement.',
   ARRAY['Lattes', 'Castelnau-le-Lez', 'Pérols'], 'published'),

  ('strasbourg', 'Strasbourg', '67',
   'De la Grande Île classée aux quartiers de la Robertsau ou de Neudorf, déménager à Strasbourg implique de composer avec les zones piétonnes et le tramway. Décrivez votre projet pour un devis précis.',
   ARRAY['Schiltigheim', 'Illkirch-Graffenstaden', 'Lingolsheim'], 'published'),

  ('rennes', 'Rennes', '35',
   'Rennes et sa métropole connaissent une forte croissance. Du centre historique aux nouveaux quartiers comme EuroRennes, nos déménageurs partenaires connaissent les accès et les contraintes de stationnement.',
   ARRAY['Cesson-Sévigné', 'Saint-Grégoire', 'Bruz'], 'published'),

  ('reims', 'Reims', '51',
   'Entre le centre-ville autour de la cathédrale et les quartiers pavillonnaires, un déménagement à Reims varie beaucoup selon le logement. Indiquez étage, volume et accès pour recevoir des devis justes.',
   ARRAY['Tinqueux', 'Bétheny', 'Cormontreuil'], 'published'),

  ('le-havre', 'Le Havre', '76',
   'Ville reconstruite et port majeur, Le Havre mêle grands immeubles du centre et maisons sur les hauteurs. Nos déménageurs vérifiés s''adaptent à la pente comme aux grands ensembles.',
   ARRAY['Montivilliers', 'Harfleur', 'Sainte-Adresse'], 'published'),

  ('toulon', 'Toulon', '83',
   'Entre la vieille ville, le port et les quartiers sur les collines, un déménagement à Toulon demande souvent de gérer des rues en pente et un stationnement difficile. Comparez des devis adaptés.',
   ARRAY['La Seyne-sur-Mer', 'Hyères', 'La Valette-du-Var'], 'published'),

  ('grenoble', 'Grenoble', '38',
   'Entourée de montagnes, Grenoble concentre logements anciens sans ascenseur et résidences récentes. Précisez l''étage et l''accès : nos déménageurs vérifiés ajustent leur devis en conséquence.',
   ARRAY['Saint-Martin-d''Hères', 'Échirolles', 'Meylan'], 'published'),

  ('dijon', 'Dijon', '21',
   'Du secteur sauvegardé aux quartiers résidentiels, Dijon offre des logements très variés. Trouvez un déménageur vérifié pour un trajet local ou un départ vers une autre région.',
   ARRAY['Chenôve', 'Talant', 'Quetigny'], 'published'),

  ('angers', 'Angers', '49',
   'Angers séduit de nombreuses familles. Que vous quittiez un appartement du centre ou une maison en périphérie, décrivez votre déménagement pour recevoir des devis de professionnels vérifiés.',
   ARRAY['Avrillé', 'Trélazé', 'Les Ponts-de-Cé'], 'published'),

  ('nimes', 'Nîmes', '30',
   'Entre l''Écusson, les quartiers autour des Arènes et les zones pavillonnaires, un déménagement à Nîmes se prépare selon l''accès et la chaleur estivale. Nos déménageurs s''organisent en conséquence.',
   ARRAY['Caissargues', 'Marguerittes', 'Milhaud'], 'published'),

  ('villeurbanne', 'Villeurbanne', '69',
   'Voisine directe de Lyon, Villeurbanne compte de nombreux immeubles des Gratte-Ciel et des résidences récentes. Nos déménageurs vérifiés connaissent bien l''agglomération lyonnaise.',
   ARRAY['Lyon', 'Vaulx-en-Velin', 'Bron'], 'published'),

  ('clermont-ferrand', 'Clermont-Ferrand', '63',
   'Construite sur une butte, Clermont-Ferrand compte des rues en pente et des immeubles anciens en pierre de Volvic. Indiquez précisément l''accès pour un devis sans mauvaise surprise.',
   ARRAY['Chamalières', 'Aubière', 'Cournon-d''Auvergne'], 'published'),

  ('aix-en-provence', 'Aix-en-Provence', '13',
   'Le centre historique d''Aix-en-Provence est en grande partie piéton : un déménagement y demande une bonne préparation. Nos déménageurs vérifiés gèrent aussi les villas des alentours.',
   ARRAY['Marseille', 'Gardanne', 'Venelles'], 'published'),

  ('le-mans', 'Le Mans', '72',
   'Entre la Cité Plantagenêt et les quartiers résidentiels, Le Mans offre des logements variés. Recevez des devis de déménageurs vérifiés pour un déménagement local ou longue distance.',
   ARRAY['Allonnes', 'Coulaines', 'Changé'], 'published'),

  ('brest', 'Brest', '29',
   'Ville portuaire à l''extrémité de la Bretagne, Brest est souvent le point de départ de déménagements longue distance. Nos déménageurs vérifiés proposent aussi des trajets retour pour réduire le prix.',
   ARRAY['Guipavas', 'Le Relecq-Kerhuon', 'Plouzané'], 'published'),

  ('tours', 'Tours', '37',
   'Entre le Vieux-Tours, les bords de Loire et les communes de la métropole, nos déménageurs vérifiés adaptent leur devis à votre logement et à votre trajet.',
   ARRAY['Joué-lès-Tours', 'Saint-Cyr-sur-Loire', 'Saint-Pierre-des-Corps'], 'published'),

  ('amiens', 'Amiens', '80',
   'Des maisons du quartier Saint-Leu aux résidences plus récentes, un déménagement à Amiens se prépare selon l''accès et le volume. Décrivez votre projet en quelques minutes.',
   ARRAY['Longueau', 'Camon', 'Rivery'], 'published'),

  ('limoges', 'Limoges', '87',
   'Limoges mêle centre ancien et quartiers pavillonnaires. Nos déménageurs vérifiés interviennent pour les petits volumes comme pour les maisons entières.',
   ARRAY['Panazol', 'Isle', 'Couzeix'], 'published'),

  ('annecy', 'Annecy', '74',
   'Entre la vieille ville, le lac et les communes de montagne, déménager à Annecy demande parfois des véhicules adaptés aux accès étroits. Comparez des devis de professionnels vérifiés.',
   ARRAY['Seynod', 'Annecy-le-Vieux', 'Cran-Gevrier'], 'published'),

  ('perpignan', 'Perpignan', '66',
   'Proche de l''Espagne et de la mer, Perpignan accueille de nombreux nouveaux habitants. Nos déménageurs vérifiés assurent trajets locaux et longues distances depuis le sud de la France.',
   ARRAY['Canet-en-Roussillon', 'Cabestany', 'Saint-Estève'], 'published'),

  ('boulogne-billancourt', 'Boulogne-Billancourt', '92',
   'Aux portes de Paris, Boulogne-Billancourt compte beaucoup d''immeubles avec ascenseurs étroits ou stationnement limité. Nos déménageurs vérifiés connaissent bien l''ouest parisien.',
   ARRAY['Issy-les-Moulineaux', 'Sèvres', 'Saint-Cloud'], 'published'),

  ('metz', 'Metz', '57',
   'Entre le centre ancien en pierre de Jaumont et les nouveaux quartiers, un déménagement à Metz se prépare selon l''accès. Trouvez un déménageur vérifié en Moselle.',
   ARRAY['Montigny-lès-Metz', 'Woippy', 'Marly'], 'published'),

  ('besancon', 'Besançon', '25',
   'Nichée dans une boucle du Doubs, Besançon a un centre historique dense et des quartiers en hauteur. Nos déménageurs vérifiés adaptent les moyens à votre adresse.',
   ARRAY['Saint-Vit', 'École-Valentin', 'Chalezeule'], 'published'),

  ('orleans', 'Orléans', '45',
   'À une heure de Paris, Orléans est un point de passage fréquent pour les déménagements. Nos déménageurs vérifiés proposent trajets locaux et trajets vers l''Île-de-France.',
   ARRAY['Olivet', 'Saint-Jean-de-Braye', 'Fleury-les-Aubrais'], 'published'),

  ('rouen', 'Rouen', '76',
   'Les maisons à colombages et rues étroites du centre de Rouen rendent certains déménagements plus techniques. Indiquez étage et accès pour un devis adapté.',
   ARRAY['Sotteville-lès-Rouen', 'Mont-Saint-Aignan', 'Le Grand-Quevilly'], 'published'),

  ('mulhouse', 'Mulhouse', '68',
   'Proche de la Suisse et de l''Allemagne, Mulhouse voit passer de nombreux déménagements frontaliers. Nos déménageurs vérifiés interviennent dans tout le Haut-Rhin.',
   ARRAY['Riedisheim', 'Illzach', 'Kingersheim'], 'published'),

  ('caen', 'Caen', '14',
   'Ville étudiante et capitale normande, Caen compte beaucoup de petits logements. Nos déménageurs vérifiés proposent des formules adaptées aux petits volumes comme aux maisons.',
   ARRAY['Hérouville-Saint-Clair', 'Mondeville', 'Ifs'], 'published'),

  ('nancy', 'Nancy', '54',
   'De la place Stanislas aux quartiers résidentiels, Nancy offre des logements anciens souvent sans ascenseur. Précisez l''étage pour recevoir un devis juste.',
   ARRAY['Vandœuvre-lès-Nancy', 'Laxou', 'Villers-lès-Nancy'], 'published'),

  ('argenteuil', 'Argenteuil', '95',
   'Dans le Val-d''Oise, Argenteuil combine pavillons et grands ensembles. Nos déménageurs vérifiés couvrent toute l''Île-de-France.',
   ARRAY['Bezons', 'Sartrouville', 'Cormeilles-en-Parisis'], 'published'),

  ('montreuil', 'Montreuil', '93',
   'Aux portes de l''est parisien, Montreuil mêle anciens ateliers, immeubles et maisons. Nos déménageurs vérifiés connaissent les contraintes d''accès de la petite couronne.',
   ARRAY['Bagnolet', 'Vincennes', 'Rosny-sous-Bois'], 'published'),

  ('saint-denis', 'Saint-Denis', '93',
   'Saint-Denis connaît de nombreux chantiers et nouveaux logements. Nos déménageurs vérifiés s''adaptent aux résidences récentes comme aux immeubles anciens.',
   ARRAY['Saint-Ouen', 'Aubervilliers', 'Épinay-sur-Seine'], 'published'),

  ('avignon', 'Avignon', '84',
   'Le centre d''Avignon, entouré de remparts, est difficile d''accès pour les camions. Nos déménageurs vérifiés savent préparer ces déménagements en intra-muros.',
   ARRAY['Le Pontet', 'Villeneuve-lès-Avignon', 'Morières-lès-Avignon'], 'published'),

  ('poitiers', 'Poitiers', '86',
   'Ville étudiante perchée sur un plateau, Poitiers compte beaucoup de rues en pente. Nos déménageurs vérifiés adaptent véhicules et équipe à votre adresse.',
   ARRAY['Buxerolles', 'Saint-Benoît', 'Chasseneuil-du-Poitou'], 'published'),

  ('la-rochelle', 'La Rochelle', '17',
   'Entre le Vieux-Port, l''île de Ré toute proche et les quartiers résidentiels, déménager à La Rochelle demande une bonne organisation, surtout l''été.',
   ARRAY['Aytré', 'Lagord', 'Périgny'], 'published'),

  ('pau', 'Pau', '64',
   'Au pied des Pyrénées, Pau mêle centre ancien et quartiers pavillonnaires. Nos déménageurs vérifiés interviennent dans tout le Béarn.',
   ARRAY['Lescar', 'Billère', 'Lons'], 'published'),

  ('bayonne', 'Bayonne', '64',
   'Entre le Petit Bayonne, les quais de l''Adour et la côte basque, un déménagement à Bayonne se prépare selon l''accès. Comparez des devis de professionnels vérifiés.',
   ARRAY['Anglet', 'Biarritz', 'Boucau'], 'published'),

  ('versailles', 'Versailles', '78',
   'Les immeubles anciens et les rues réglementées de Versailles demandent souvent une autorisation de stationnement. Nos déménageurs vérifiés s''en occupent avec vous.',
   ARRAY['Le Chesnay-Rocquencourt', 'Viroflay', 'Saint-Cyr-l''École'], 'published'),

  ('nanterre', 'Nanterre', '92',
   'Proche de La Défense, Nanterre compte de nombreuses tours et résidences. Nos déménageurs vérifiés connaissent les règles d''accès des grands immeubles.',
   ARRAY['Rueil-Malmaison', 'Puteaux', 'Colombes'], 'published'),

  ('cannes', 'Cannes', '06',
   'Entre la Croisette, le Suquet et les collines, déménager à Cannes demande souvent un monte-meuble. Recevez des devis adaptés à votre logement.',
   ARRAY['Le Cannet', 'Mandelieu-la-Napoule', 'Mougins'], 'published'),

  ('valence', 'Valence', '26',
   'Sur l''axe Lyon–Marseille, Valence est un point de passage idéal pour les déménagements longue distance. Nos déménageurs vérifiés proposent aussi des trajets retour moins chers.',
   ARRAY['Bourg-lès-Valence', 'Portes-lès-Valence', 'Guilherand-Granges'], 'published'),

  ('troyes', 'Troyes', '10',
   'Le centre de Troyes et ses maisons à pans de bois imposent des accès étroits. Nos déménageurs vérifiés préparent le bon véhicule pour votre rue.',
   ARRAY['Sainte-Savine', 'La Chapelle-Saint-Luc', 'Saint-André-les-Vergers'], 'published')
ON CONFLICT (slug) DO UPDATE SET
  nom_ville = EXCLUDED.nom_ville,
  departement = EXCLUDED.departement,
  intro_locale = EXCLUDED.intro_locale,
  zones_desservies = EXCLUDED.zones_desservies,
  statut = 'published';
