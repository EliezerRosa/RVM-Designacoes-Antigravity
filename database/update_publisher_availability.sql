-- Script para atualizar datas de disponibilidade dos publicadores no Supabase
-- Executar no SQL Editor do Supabase Dashboard

-- ===== EMERSON FRANÇA =====
-- Atualiza o campo availability dentro do JSON 'data'
UPDATE publishers 
SET data = jsonb_set(
    data::jsonb,
    '{availability}',
    '{
        "mode": "never",
        "exceptionDates": [],
        "availableDates": [
            "2026-01-01", "2026-01-08", "2026-01-29",
            "2026-02-05", "2026-02-12",
            "2026-04-02", "2026-04-09", "2026-04-30",
            "2026-05-07", "2026-05-21",
            "2026-06-04", "2026-06-11",
            "2026-07-02", "2026-07-09", "2026-07-30",
            "2026-08-20", "2026-08-27",
            "2026-09-03", "2026-09-10",
            "2026-10-01", "2026-10-08", "2026-10-29",
            "2026-11-05", "2026-11-12",
            "2026-12-03", "2026-12-10", "2026-12-31"
        ]
    }'::jsonb
)
WHERE data->>'name' = 'Emerson França';

-- ===== MARCOS VINÍCIUS =====
UPDATE publishers 
SET data = jsonb_set(
    data::jsonb,
    '{availability}',
    '{
        "mode": "never",
        "exceptionDates": [],
        "availableDates": [
            "2026-02-26",
            "2026-03-26",
            "2026-04-23",
            "2026-05-21",
            "2026-06-18",
            "2026-07-30",
            "2026-08-27",
            "2026-09-24",
            "2026-10-22",
            "2026-11-19",
            "2026-12-17"
        ]
    }'::jsonb
)
WHERE data->>'name' = 'Marcos Vinícius';

-- Verificar se funcionou:
SELECT data->>'name' as nome, data->'availability' as disponibilidade
FROM publishers
WHERE data->>'name' IN ('Emerson França', 'Marcos Vinícius', 'Marcos Rogério');

-- ===== MARCOS ROGÉRIO =====
-- Ausente de 15/12/2025 até 13/01/2026 (4 quintas-feiras)
-- Modo: "always" (normalmente disponível) com exceptionDates (datas de ausência)
UPDATE publishers 
SET data = jsonb_set(
    data::jsonb,
    '{availability}',
    '{
        "mode": "always",
        "availableDates": [],
        "exceptionDates": [
            "2025-12-18",
            "2025-12-25",
            "2026-01-01",
            "2026-01-08"
        ]
    }'::jsonb
)
WHERE data->>'name' = 'Marcos Rogério';

-- Verificar resultado final:
SELECT data->>'name' as nome, data->'availability' as disponibilidade
FROM publishers
WHERE data->>'name' = 'Marcos Rogério';

-- ===== ANA PAULA OLIVEIRA =====
-- Mesma ausência de Marcos Rogério: 15/12/2025 até 13/01/2026 (4 quintas-feiras)
-- Modo: "always" (normalmente disponível) com exceptionDates (datas de ausência)
UPDATE publishers 
SET data = jsonb_set(
    data::jsonb,
    '{availability}',
    '{
        "mode": "always",
        "availableDates": [],
        "exceptionDates": [
            "2025-12-18",
            "2025-12-25",
            "2026-01-01",
            "2026-01-08"
        ]
    }'::jsonb
)
WHERE data->>'name' = 'Ana Paula Oliveira';

-- Verificar resultado final:
SELECT data->>'name' as nome, data->'availability' as disponibilidade
FROM publishers
WHERE data->>'name' IN ('Marcos Rogério', 'Ana Paula Oliveira');
