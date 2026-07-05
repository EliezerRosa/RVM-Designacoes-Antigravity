-- ============================================================
-- RM (Relatório Mensal) — Fase 1: Schema + Tabelas
-- Schema `rm.*` totalmente desacoplado de `public.*` (zero FK cross-schema).
-- Rollback total: DROP SCHEMA rm CASCADE;
-- ============================================================

CREATE SCHEMA IF NOT EXISTS rm;

-- Acesso ao schema (RLS restringe linhas; ver migration 20260704000003)
GRANT USAGE ON SCHEMA rm TO authenticated, service_role;

-- ------------------------------------------------------------
-- 1. rm.congregations
-- ------------------------------------------------------------
CREATE TABLE rm.congregations (
    id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    name          text NOT NULL,
    number        text,
    access_pin    text,
    is_active     boolean NOT NULL DEFAULT true,
    created_at    timestamptz NOT NULL DEFAULT now(),
    updated_at    timestamptz NOT NULL DEFAULT now()
);

-- ------------------------------------------------------------
-- 2. rm.field_groups (FKs de líder adicionadas após rm.publishers existir)
-- ------------------------------------------------------------
CREATE TABLE rm.field_groups (
    id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    congregation_id     uuid NOT NULL REFERENCES rm.congregations(id) ON DELETE CASCADE,
    group_number        smallint NOT NULL,
    name                text,
    leader_id           uuid,           -- FK adicionada abaixo (DEFERRABLE)
    assistant_leader_id uuid,           -- FK adicionada abaixo (DEFERRABLE)
    glide_leader_id     text,           -- glide_id do líder (resolvido no bootstrap)
    glide_assistant_id  text,           -- glide_id do ajudante (resolvido no bootstrap)
    is_active           boolean NOT NULL DEFAULT true,
    created_at          timestamptz NOT NULL DEFAULT now(),
    updated_at          timestamptz NOT NULL DEFAULT now(),
    UNIQUE (congregation_id, group_number)
);

-- ------------------------------------------------------------
-- 3. rm.publishers
-- ------------------------------------------------------------
CREATE TABLE rm.publishers (
    id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    glide_id              text UNIQUE,
    congregation_id       uuid REFERENCES rm.congregations(id) ON DELETE SET NULL,
    current_group_id      uuid REFERENCES rm.field_groups(id) ON DELETE SET NULL,
    name                  text NOT NULL,
    funcao                text,   -- ex.: 'Servo de Grupo', 'Superintendente Ajudante do Grupo'
    gender                text CHECK (gender IS NULL OR gender IN ('M', 'F')),
    birth_date            date,
    publisher_date        date,
    baptism_date          date,
    hope_class            text,
    privilege             text,
    privilege_date        date,
    is_regular_pioneer    boolean NOT NULL DEFAULT false,
    pioneer_start_date    date,
    is_special_pioneer    boolean NOT NULL DEFAULT false,
    field_service_status  text CHECK (
        field_service_status IS NULL OR
        field_service_status IN ('ATIVO', 'IRREGULAR', 'QUASE-INATIVO', 'INATIVO')
    ),
    is_active             boolean NOT NULL DEFAULT true,
    created_at            timestamptz NOT NULL DEFAULT now(),
    updated_at            timestamptz NOT NULL DEFAULT now()
);

-- ------------------------------------------------------------
-- 4. FKs de líder em rm.field_groups (DEFERRABLE — bootstrap resolve por último)
-- ------------------------------------------------------------
ALTER TABLE rm.field_groups
    ADD CONSTRAINT field_groups_leader_id_fkey
    FOREIGN KEY (leader_id) REFERENCES rm.publishers(id) ON DELETE SET NULL
    DEFERRABLE INITIALLY DEFERRED;

ALTER TABLE rm.field_groups
    ADD CONSTRAINT field_groups_assistant_leader_id_fkey
    FOREIGN KEY (assistant_leader_id) REFERENCES rm.publishers(id) ON DELETE SET NULL
    DEFERRABLE INITIALLY DEFERRED;

-- ------------------------------------------------------------
-- 5. rm.monthly_reports
--    Dualidade intencional: FK (joins vivos) + *_at_time (imutabilidade histórica)
-- ------------------------------------------------------------
CREATE TABLE rm.monthly_reports (
    id                        uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    publisher_id              uuid NOT NULL REFERENCES rm.publishers(id) ON DELETE CASCADE,
    congregation_id           uuid REFERENCES rm.congregations(id) ON DELETE SET NULL,
    congregation_at_time      text,
    group_id                  uuid REFERENCES rm.field_groups(id) ON DELETE SET NULL,
    group_at_time             text,
    reference_year            smallint NOT NULL,
    reference_month           smallint NOT NULL CHECK (reference_month BETWEEN 1 AND 12),
    service_year              smallint,
    has_preached              boolean NOT NULL DEFAULT false,
    hours                     numeric,          -- NULL para não-pioneiro
    bible_studies             smallint NOT NULL DEFAULT 0,
    modalities                text[] NOT NULL DEFAULT '{}',
    notes                     text,
    submitted_at              timestamptz NOT NULL DEFAULT now(),
    is_late_report            boolean NOT NULL DEFAULT false,
    late_consolidation_period text,
    is_auxiliary_pioneer      boolean NOT NULL DEFAULT false,
    glide_row_id              text UNIQUE,
    glide_congregation_id     text,
    created_at                timestamptz NOT NULL DEFAULT now(),
    updated_at                timestamptz NOT NULL DEFAULT now(),
    UNIQUE (publisher_id, reference_year, reference_month)
);

CREATE INDEX idx_monthly_reports_period ON rm.monthly_reports (reference_year, reference_month);
CREATE INDEX idx_monthly_reports_congregation ON rm.monthly_reports (congregation_id);

-- ------------------------------------------------------------
-- 6. rm.submission_audit (log append-only; SEM FK p/ monthly_reports:
--    a história deve sobreviver à exclusão do relatório, e o trigger AFTER DELETE
--    insere um registro referenciando o relatório recém-excluído).
-- ------------------------------------------------------------
CREATE TABLE rm.submission_audit (
    id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    monthly_report_id  uuid NOT NULL,   -- loose (sem FK; ver comentário acima)
    changed_by         uuid,   -- profile id (loose, sem FK cross-schema)
    changed_at         timestamptz NOT NULL DEFAULT now(),
    action             text NOT NULL CHECK (action IN ('INSERT', 'UPDATE', 'DELETE')),
    previous_data      jsonb
);

CREATE INDEX idx_submission_audit_report ON rm.submission_audit (monthly_report_id);

-- ------------------------------------------------------------
-- 7. rm.publisher_sync_map (ligação loose com public.publishers do RVM)
-- ------------------------------------------------------------
CREATE TABLE rm.publisher_sync_map (
    id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    rm_publisher_id   uuid NOT NULL UNIQUE REFERENCES rm.publishers(id) ON DELETE CASCADE,
    rvm_publisher_id  uuid,   -- UUID loose, SEM FK (schemas separados)
    match_status      text NOT NULL DEFAULT 'unmatched'
        CHECK (match_status IN ('auto', 'admin-confirmed', 'conflict', 'unmatched')),
    matched_name      text,
    rvm_funcao        text,   -- snapshot p/ sugerir líder no portal de sync
    matched_at        timestamptz,
    confirmed_by      uuid,
    created_at        timestamptz NOT NULL DEFAULT now(),
    updated_at        timestamptz NOT NULL DEFAULT now()
);

-- ------------------------------------------------------------
-- 8. rm.month_control (estado de abertura/fechamento por mês/congregação)
-- ------------------------------------------------------------
CREATE TABLE rm.month_control (
    id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    congregation_id   uuid NOT NULL REFERENCES rm.congregations(id) ON DELETE CASCADE,
    reference_year    smallint NOT NULL,
    reference_month   smallint NOT NULL CHECK (reference_month BETWEEN 1 AND 12),
    is_open           boolean NOT NULL DEFAULT true,
    opened_at         timestamptz,
    opened_by         uuid,
    closed_at         timestamptz,
    closed_by         uuid,
    created_at        timestamptz NOT NULL DEFAULT now(),
    updated_at        timestamptz NOT NULL DEFAULT now(),
    UNIQUE (congregation_id, reference_year, reference_month)
);

-- ------------------------------------------------------------
-- 9. rm.congregation_members (papel do profile numa congregação)
-- ------------------------------------------------------------
CREATE TABLE rm.congregation_members (
    id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    profile_id       uuid NOT NULL,   -- loose, sem FK cross-schema
    congregation_id  uuid NOT NULL REFERENCES rm.congregations(id) ON DELETE CASCADE,
    role             text NOT NULL DEFAULT 'member'
        CHECK (role IN ('secretary', 'group_leader', 'assistant_group_leader', 'member')),
    created_at       timestamptz NOT NULL DEFAULT now(),
    updated_at       timestamptz NOT NULL DEFAULT now(),
    UNIQUE (profile_id, congregation_id)
);

-- ------------------------------------------------------------
-- 10. rm.settings (config chave/valor por congregação)
-- ------------------------------------------------------------
CREATE TABLE rm.settings (
    id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    congregation_id  uuid REFERENCES rm.congregations(id) ON DELETE CASCADE,
    key              text NOT NULL,
    value            text,
    created_at       timestamptz NOT NULL DEFAULT now(),
    updated_at       timestamptz NOT NULL DEFAULT now(),
    UNIQUE (congregation_id, key)
);

-- ------------------------------------------------------------
-- GRANTs de tabela (RLS aplica o gate por linha na migration RLS)
-- ------------------------------------------------------------
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA rm TO authenticated;
GRANT ALL ON ALL TABLES IN SCHEMA rm TO service_role;

-- Objetos futuros no schema rm herdam os mesmos privilégios
ALTER DEFAULT PRIVILEGES IN SCHEMA rm
    GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO authenticated;
ALTER DEFAULT PRIVILEGES IN SCHEMA rm
    GRANT ALL ON TABLES TO service_role;
