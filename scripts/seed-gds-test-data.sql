-- ============================================================
-- GDS test receipts (TEST DATA — do not run on production data)
--
-- Appends a matrix of transactions covering every receipt variant
-- the POS printer and stats screens can produce:
--   Espèces (exact / with change), Carte Bancaire, split payments
--   (MULTIPLE 2 & 3 legs), % and € discounts, decimal quantities,
--   multi-VAT tickets, employer share (titres-restaurant), fidelity
--   points, named customers, sur place / à emporter, DEBIT,
--   REMBOURSEMENT, PROVISION, Fidélité, and all non-final states
--   (EN COURS, EN ATTENTE, EN MODIF, ANNULÉE, EFFACÉE, SUPPRIMÉE).
--
-- Order ids are prefixed 'TST' so the batch stays identifiable.
-- Transactions are APPENDED and chained on the current tail hash —
-- deleting them afterwards is only safe while they remain the tail
-- of the chain (any later transaction's previous_hash would dangle).
--
-- Usage: psql -d gds -f scripts/seed-gds-test-data.sql
-- ============================================================

BEGIN;

-- JS String(Number(v)): '12.50' → '12.5', '10' → '10' (only strip zeros
-- after a decimal point — '10' must not become '1').
CREATE OR REPLACE FUNCTION pg_temp.test_jsnum(v numeric) RETURNS text
LANGUAGE sql IMMUTABLE AS $$
    SELECT CASE WHEN v::text LIKE '%.%'
                THEN trim(trailing '.' FROM trim(trailing '0' FROM v::text))
                ELSE v::text END
$$;

DO $$
DECLARE
    v_prev text;
    v_spec jsonb;
    v_seq int := 0;
    v_created timestamp;
    v_tx_id int;
    v_order_id text;
    v_amount numeric(10,2);
    v_items text;
    v_items_json jsonb;
    v_paydigest text;
    v_hash text;
    v_change text;
    v_payments text;
    v_it record;
BEGIN
    -- Chain on the current tail (NOT null: gds has real history).
    SELECT hash INTO v_prev FROM dc_pos.transactions ORDER BY id DESC LIMIT 1;

    -- Spec fields:
    --   m      payment_method            u      user_name
    --   to     take_out (default true)   cust   customer_name
    --   eshare employer_share            fid    fidelity_points used
    --   cash   {r: received, g: given} → change column (JSON cash-note)
    --   legs   [[method, amount, cashReceived?, changeGiven?], …] → payments
    --   items  [[label, category, amount, qty, discount, unit, vat], …]
    FOR v_spec IN SELECT * FROM jsonb_array_elements($spec$[
        {"u":"Sylvie","m":"Espèces","items":[["PLAT DU JOUR","PLAT",11.50,1,0,"",10]]},
        {"u":"Sylvie","m":"Espèces","items":[["MENU BREIZH (CANETTE)","MENU",9.50,2,0,"",10]],"cash":{"r":20,"g":1},"legs":[["Espèces",19,20,1]]},
        {"u":"Sylvie","m":"Carte Bancaire","items":[["QUICHE","SALÉ SEUL",7.00,1,0,"",10],["POKE COMPLETES","MENU",7.00,1,0,"",10],["BEURRE EN POT","PLAT",0.30,1,0,"",10]]},
        {"u":"Sylvie","m":"MULTIPLE","items":[["PLAT XL","PLAT",13.00,1,0,"",10]],"legs":[["Carte Bancaire",8],["Espèces",5]]},
        {"u":"Sylvie","m":"MULTIPLE","items":[["PLAT JOUR XL + 33 CL+ PATISS","PLAT",17.80,1,0,"",10]],"legs":[["Carte Bancaire",10],["Espèces",5,10,2.20],["Chèque",2.80]]},
        {"u":"Sylvie","m":"Espèces","items":[["PLAT DU JOUR","PLAT",11.50,1,10,"%",10],["BEURRE EN POT","PLAT",0.30,2,0,"",10]]},
        {"u":"Sylvie","m":"Espèces","items":[["POISSON","PLAT",13.00,1,2,"€",10]]},
        {"u":"Sylvie","m":"Espèces","items":[["SALADE COMPOSÉE (kg)","SALÉ SEUL",7.00,0.35,0,"",10]]},
        {"u":"Sylvie","m":"Carte Bancaire","items":[["PAIN ANCIEN","ALCATEL",2.20,1,0,"",5.5],["PLAT DU JOUR","PLAT",11.50,1,0,"",10],["VIN 25CL","BOISSON",3.50,1,0,"",20]]},
        {"u":"Sylvie","m":"Carte Bancaire","items":[["PLAT DU JOUR + CANETTE","PLAT",13.80,1,0,"",10]],"eshare":4.20},
        {"u":"Sylvie","m":"Espèces","items":[["POKE COMPLETES","MENU",7.00,1,0,"",10]],"fid":2.00},
        {"u":"Sylvie","m":"Carte Bancaire","cust":"Benoît Bleunven","items":[["POISSON + BOISSON 33CL","PLAT",15.30,1,0,"",10]]},
        {"u":"Sylvie","m":"Espèces","to":false,"items":[["SUR PLACE CROQUE + SALADE","MENU",6.50,1,0,"",10]]},
        {"u":"Sylvie","m":"DEBIT","cust":"Sophie Bogard","items":[["PLAT DU JOUR","PLAT",11.50,2,0,"",10]]},
        {"u":"Sylvie","m":"REMBOURSEMENT","items":[["PLAT DU JOUR","PLAT",-11.50,1,0,"",10]]},
        {"u":"Sylvie","m":"PROVISION","cust":"Jocelyn Bokoutou-Mbai-Assem","items":[["PROVISION COMPTE","DGAC CADRE",50.00,1,0,"",10]]},
        {"u":"Sylvie","m":"Fidélité","cust":"Ramona Bourhis","items":[["DESSERT DU JOUR","DESSERT",4.50,1,0,"",10]]},
        {"u":"Sylvie","m":"EN COURS","items":[["QUICHE + SALADE","MENU",9.40,1,0,"",10]]},
        {"u":"Sylvie","m":"EN ATTENTE","items":[["BURGER + POTATOES","PLAT",10.50,1,0,"",10]]},
        {"u":"Sylvie","m":"EN MODIF","items":[["AUMONIERE","PLAT",11.50,1,0,"",10]]},
        {"u":"Sylvie","m":"ANNULÉE","items":[["PLAT PETIT BUDGET","PLAT",9.90,1,0,"",10]]},
        {"u":"Sylvie","m":"EFFACÉE","items":[["MENU BISTROT (CANETTE)","MENU",7.80,1,0,"",10]]},
        {"u":"Sylvie","m":"SUPPRIMÉE","items":[["ANTI GASPI","MENU",5.00,1,0,"",10]]},
        {"u":"Sylvie","m":"Espèces","items":[["PLAT DU JOUR","PLAT",11.50,1,0,"",10],["QUICHE","SALÉ SEUL",7.00,1,0,"",10],["POISSON","PLAT",13.00,1,0,"",10],["DESSERT DU JOUR","DESSERT",4.50,2,0,"",10],["CANETTE 33CL","BOISSON",1.50,2,0,"",10],["BEURRE EN POT","PLAT",0.30,1,0,"",10],["SUPPLEMENT CIDRE","PLAT",1.00,1,0,"",10],["TARTINE SALEE","MENU",6.50,1,0,"",10]],"cash":{"r":60,"g":3.80},"legs":[["Espèces",56.20,60,3.80]]},
        {"u":"Sylvie","m":"Espèces","items":[["ANTI GASPI","MENU",5.00,1,0,"",10]]},
        {"u":"Sylvie","m":"Carte Bancaire","items":[["BURGER+POTA+ 33 CL+PAT","PLAT",16.00,1,5,"%",10]],"eshare":3.00,"cust":"Gwendal Bonizec"}
    ]$spec$)
    LOOP
        v_seq := v_seq + 1;
        -- Spread tickets over the last few hours, oldest first.
        v_created := date_trunc('second', now() - ((60 - v_seq) * interval '4 minutes'));
        v_order_id := 'TST' || to_char(v_created, 'YYYYMMDDHH24MISS') || lpad(v_seq::text, 3, '0');

        -- Items: [label, category, amount, qty, discount, unit, vat]
        -- total = qty*amount − (% discount | € discount), rounded to cents.
        WITH norm AS (
            SELECT it->>0 AS label,
                   it->>1 AS cat,
                   (it->>2)::numeric AS amount,
                   (it->>3)::numeric AS qty,
                   (it->>4)::numeric AS disc,
                   it->>5 AS dunit,
                   (it->>6)::numeric AS vat_rate,
                   round((it->>3)::numeric * (it->>2)::numeric
                       - CASE WHEN it->>5 = '%' THEN (it->>3)::numeric * (it->>2)::numeric * (it->>4)::numeric / 100
                              WHEN it->>5 = '€' THEN (it->>4)::numeric
                              ELSE 0 END, 2) AS total,
                   regexp_replace(regexp_replace(it->>0, '\\', '\\\\', 'g'), '([|,;:])', '\\\1', 'g') AS elabel
            FROM jsonb_array_elements(v_spec->'items') it
        )
        SELECT jsonb_agg(jsonb_build_object('label', label, 'cat', cat, 'amount', amount, 'qty', qty,
                                            'disc', disc, 'dunit', dunit, 'total', total, 'vat', vat_rate)),
               round(sum(total), 2),
               string_agg(
                   elabel || ',' || pg_temp.test_jsnum(qty) || ',' || pg_temp.test_jsnum(amount) || ',' ||
                   pg_temp.test_jsnum(total) || ',' || pg_temp.test_jsnum(vat_rate) || ',' || pg_temp.test_jsnum(disc),
                   ';' ORDER BY elabel COLLATE "C", pg_temp.test_jsnum(qty) COLLATE "C")
          INTO v_items_json, v_amount, v_items
          FROM norm;

        -- Cash note stored in `change` as the app does: {"cashAmount":r,"change":g}
        v_change := CASE WHEN v_spec ? 'cash'
            THEN '{"cashAmount":' || pg_temp.test_jsnum((v_spec->'cash'->>'r')::numeric)
              || ',"change":' || pg_temp.test_jsnum((v_spec->'cash'->>'g')::numeric) || '}'
            ELSE '' END;

        -- Payment legs stored in `payments` as a JSON array; the digest only
        -- covers method+amount (sorted by method then amount, like the app).
        v_payments := NULL;
        v_paydigest := NULL;
        IF v_spec ? 'legs' THEN
            SELECT jsonb_agg(leg ORDER BY leg->>'method')::text,
                   string_agg(ereg || ':' || pg_temp.test_jsnum((leg->>'amount')::numeric), ','
                              ORDER BY ereg COLLATE "C", pg_temp.test_jsnum((leg->>'amount')::numeric) COLLATE "C")
              INTO v_payments, v_paydigest
              FROM (
                  SELECT jsonb_strip_nulls(jsonb_build_object(
                             'method', leg->>0,
                             'amount', (leg->>1)::numeric,
                             'cashReceived', (leg->>2)::numeric,
                             'changeGiven', (leg->>3)::numeric)) AS leg,
                         regexp_replace(regexp_replace(leg->>0, '\\', '\\\\', 'g'), '([|,;:])', '\\\1', 'g') AS ereg
                  FROM jsonb_array_elements(v_spec->'legs') leg
              ) legs;
        END IF;

        INSERT INTO dc_pos.transactions
            (order_id, customer_name, user_name, payment_method, amount, currency, change,
             take_out, employer_share, fidelity_points, device_id, payments,
             hash, previous_hash, created_at, updated_at)
        VALUES (v_order_id,
                v_spec->>'cust',
                coalesce(v_spec->>'u', 'Sylvie'),
                v_spec->>'m',
                v_amount, 'Euro', v_change,
                coalesce((v_spec->>'to')::boolean, true),
                (v_spec->>'eshare')::numeric,
                (v_spec->>'fid')::numeric,
                NULL, v_payments,
                NULL, v_prev,
                v_created, v_created)
        RETURNING id INTO v_tx_id;

        FOR v_it IN
            SELECT * FROM jsonb_to_recordset(v_items_json)
            AS x(label text, cat text, amount numeric, qty numeric, disc numeric, dunit text, total numeric, vat numeric)
        LOOP
            INSERT INTO dc_pos.transaction_items
                (transaction_id, label, category, amount, quantity, discount_amount, discount_unit, total, vat_rate)
            VALUES (v_tx_id, v_it.label, v_it.cat, v_it.amount, v_it.qty,
                    coalesce(v_it.disc, 0), coalesce(v_it.dunit, ''), v_it.total, v_it.vat);
        END LOOP;

        -- Same digest layout as computeTransactionHash:
        -- previous|id|order_id|user|method|amount|currency|created|change|device|items[|legs]
        v_hash := encode(sha256((
            coalesce(v_prev, '') || '|' || v_tx_id || '|' || v_order_id || '|' ||
            coalesce(v_spec->>'u', 'Sylvie') || '|' || (v_spec->>'m') || '|' ||
            pg_temp.test_jsnum(v_amount) || '|Euro|' ||
            to_char(v_created, 'YYYY-MM-DD HH24:MI:SS') || '|' || v_change || '||' ||
            coalesce(v_items, '') ||
            CASE WHEN v_paydigest IS NOT NULL THEN '|' || v_paydigest ELSE '' END
        )::bytea), 'hex');
        UPDATE dc_pos.transactions SET hash = v_hash WHERE id = v_tx_id;
        v_prev := v_hash;
    END LOOP;
END $$;

COMMIT;
