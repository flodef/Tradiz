-- =====================================================================
-- Réparation : clôtures posées sur des périodes non terminées
-- (PostgreSQL — schéma dc_pos)
--
-- Contexte : une version précédente de populate-nf525-tables.ts créait des
-- clôtures pour TOUTES les périodes contenant des transactions — y compris
-- le mois et l'année en cours, voire le jour même. Un sceau prématuré
-- rejetait ensuite chaque écriture datée dans la période
-- (409 DAY_CLOSED — « Le mois XXXX-XX est clôturé »).
--
-- Règles appliquées :
--   - un mois ne peut être clôturé qu'une fois terminé
--     → suppression de closure_month >= mois courant
--   - une année ne peut être clôturée qu'une fois terminée
--     → suppression de closure_year >= année courante
--   - un jour futur ne peut jamais être clôturé ; le jour courant ne peut
--     l'être que par la clôture réelle (auto/manuelle), jamais par le
--     script de migration (closed_by = 'migration-script')
--
-- Les tables sont append-only via triggers — ils sont désactivés puis
-- réactivés dans la même transaction (rôle propriétaire requis).
--
-- NOTE : si verifyIntegrity signale une rupture de chaîne après ce
-- nettoyage (une clôture ultérieure chaînée sur un hash supprimé), relancer
-- `bun run scripts/populate-nf525-tables.ts --force-rechain` — il ignore
-- désormais les périodes en cours.
-- =====================================================================

BEGIN;

ALTER TABLE dc_pos.daily_closures DISABLE TRIGGER USER;
ALTER TABLE dc_pos.monthly_closures DISABLE TRIGGER USER;
ALTER TABLE dc_pos.annual_closures DISABLE TRIGGER USER;

DELETE FROM dc_pos.daily_closures
WHERE closure_date > CURRENT_DATE
   OR (closure_date = CURRENT_DATE AND closed_by = 'migration-script');

DELETE FROM dc_pos.monthly_closures
WHERE closure_month >= DATE_TRUNC('month', CURRENT_DATE)::date;

DELETE FROM dc_pos.annual_closures
WHERE closure_year >= EXTRACT(YEAR FROM CURRENT_DATE)::int;

ALTER TABLE dc_pos.daily_closures ENABLE TRIGGER USER;
ALTER TABLE dc_pos.monthly_closures ENABLE TRIGGER USER;
ALTER TABLE dc_pos.annual_closures ENABLE TRIGGER USER;

COMMIT;
