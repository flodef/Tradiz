-- ============================================================
-- Migration: Add Google Place ID + seed reviews
-- For: annette (Le pain d'Annette)
-- Date: 2026-09-10
--
-- This script is IDEMPOTENT: it uses ON CONFLICT DO NOTHING/UPDATE
-- and can be safely rerun without creating duplicates.
-- ============================================================

BEGIN;

-- ============================================================
-- 0. Create reviews table if not exists
-- ============================================================
CREATE TABLE IF NOT EXISTS dc.reviews (
    id SERIAL PRIMARY KEY,
    shop_id VARCHAR(50) NOT NULL,
    user_id VARCHAR(64) NOT NULL,
    user_name VARCHAR(100) NOT NULL,
    rating INTEGER NOT NULL CHECK (rating >= 1 AND rating <= 5),
    comment TEXT,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE (shop_id, user_id)
);

-- ============================================================
-- 1. Google Place ID for Le pain d'Annette
-- ============================================================
INSERT INTO dc_pos.parameters (param_key, param_value, updated_at)
VALUES ('googlePlaceId', 'ChIJTbPSN4jNFkgRi9Q41CVCBZ0', CURRENT_TIMESTAMP)
ON CONFLICT (param_key) DO UPDATE
SET param_value = EXCLUDED.param_value, updated_at = CURRENT_TIMESTAMP;

-- ============================================================
-- 2. Seed reviews from edan.io
-- ============================================================
-- Note: user_id values are synthetic (seed_1 ... seed_5) to avoid
-- collisions with future localStorage-generated IDs (which use
-- the "user_" prefix).

INSERT INTO dc.reviews (shop_id, user_id, user_name, rating, comment, created_at) VALUES
('annette', 'seed_1', 'Marc Dubois', 5,
'Une boulangerie géniale ! Les pains sont toujours frais et pleins de saveurs. J''adore la variété qu''ils proposent, surtout le pain aux noix. C''est un vrai délice ! Le service est rapide et agréable, mais j''aimerais qu''il y ait des options sans gluten. Sinon, rien à redire, je reviendrai sans faute !',
'2025-07-01 00:00:00')
ON CONFLICT (shop_id, user_id) DO NOTHING;

INSERT INTO dc.reviews (shop_id, user_id, user_name, rating, comment, created_at) VALUES
('annette', 'seed_2', 'Catherine Lefebvre', 5,
'Je viens régulièrement ici le samedi matin pour profiter d''un petit déjeuner sur le pouce. Leurs croissants sont les meilleurs de la région, toujours chauds et croustillants. J''apprécie aussi la variété des pains qu''ils proposent, notamment le pain de campagne qui a du caractère. Cependant, j''ai remarqué qu''il y a parfois un peu d''attente le matin, surtout le week-end. Cela dit, l''attente vaut vraiment le coup, et je ne peux pas m''empêcher d''y retourner chaque semaine. Le personnel est chaleureux et fait tout pour vous satisfaire, ce qui ajoute à l''ambiance conviviale.',
'2025-06-27 00:00:00')
ON CONFLICT (shop_id, user_id) DO NOTHING;

INSERT INTO dc.reviews (shop_id, user_id, user_name, rating, comment, created_at) VALUES
('annette', 'seed_3', 'Julien Moreau', 5,
'Une expérience incroyable ! J''ai commandé un gâteau d''anniversaire pour mon fils et il était non seulement magnifique, mais également délicieux ! La crème était légère et le goût des fruits frais était vraiment authentique. Je suis ravi d''avoir choisi cet endroit pour cette occasion spéciale.',
'2024-07-09 00:00:00')
ON CONFLICT (shop_id, user_id) DO NOTHING;

INSERT INTO dc.reviews (shop_id, user_id, user_name, rating, comment, created_at) VALUES
('annette', 'seed_4', 'Pierre Renault', 5,
'Je suis un grand fan de boulangeries artisanales, et celle-ci ne déçoit pas ! Leur pain au levain est tout simplement exceptionnel, avec une croûte qui croustille à chaque bouchée et une mie moelleuse à souhait. J''ai également eu l''occasion de goûter leurs éclairs au chocolat, qui étaient d''une légèreté incroyable. Le personnel est toujours sympathique et prête à donner des conseils sur les meilleures options du jour. Le seul point à améliorer serait d''avoir un peu plus de choix de pâtisseries salées, mais cela ne m''a pas empêché de passer un moment délicieux. Je recommande vivement cet endroit à tous ceux qui aiment les bonnes choses !',
'2023-11-23 00:00:00')
ON CONFLICT (shop_id, user_id) DO NOTHING;

INSERT INTO dc.reviews (shop_id, user_id, user_name, rating, comment, created_at) VALUES
('annette', 'seed_5', 'Sophie Marchand', 5,
'J''ai découvert cet endroit par hasard, et je ne le regrette pas ! La baguette est tout simplement incroyable ! Elle est parfaite pour accompagner mes plats faits maison. J''ai aussi essayé leurs petits pains au chocolat, qui fondent dans la bouche. L''accueil est très chaleureux, et j''ai eu l''impression d''être un habitué dès ma première visite. Seul bémol, il serait bien d''avoir des horaires d''ouverture affichés, car c''est parfois difficile de savoir quand venir.',
'2023-10-26 00:00:00')
ON CONFLICT (shop_id, user_id) DO NOTHING;

COMMIT;
