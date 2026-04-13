-- ============================================================
-- Permission System for RVM Designações
-- Tables: permission_policies, user_permission_overrides
-- Note: publisher.funcao is stored inside JSONB (publishers.data)
-- ============================================================

-- 1. Permission Policies (regras por Condição + Função)
CREATE TABLE IF NOT EXISTS permission_policies (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    
    -- Matching: a quem se aplica
    target_condition text,       -- 'Ancião' | 'Servo Ministerial' | 'Publicador' | NULL (qualquer)
    target_funcao text,          -- Valor específico | NULL (qualquer)
    
    -- Visibilidade de abas
    allowed_tabs text[] NOT NULL DEFAULT ARRAY['agent'],
    
    -- Ações do Agente
    allowed_agent_actions text[] NOT NULL DEFAULT '{}',
    blocked_agent_actions text[] NOT NULL DEFAULT '{}',
    
    -- Nível de acesso a dados
    data_access_level text NOT NULL DEFAULT 'self'
        CHECK (data_access_level IN ('all', 'filtered', 'self')),
    can_see_sensitive_data boolean DEFAULT false,
    
    -- Filtros sobre quais publicadores pode ver
    publisher_filter_conditions text[],
    publisher_filter_statuses text[],
    publisher_filter_exclude_names text[],
    
    -- Prioridade e estado
    priority int DEFAULT 0,
    is_active boolean DEFAULT true,
    created_at timestamptz DEFAULT now(),
    updated_at timestamptz DEFAULT now()
);

ALTER TABLE permission_policies ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admin can manage policies" ON permission_policies FOR ALL USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
);
CREATE POLICY "Authenticated can read active policies" ON permission_policies FOR SELECT USING (
    auth.uid() IS NOT NULL AND is_active = true
);

-- 2. User Permission Overrides (exceções individuais)
CREATE TABLE IF NOT EXISTS user_permission_overrides (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    profile_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    
    -- Cada campo nullable = herda da policy
    allowed_tabs text[],
    allowed_agent_actions text[],
    blocked_agent_actions text[],
    data_access_level text CHECK (data_access_level IS NULL OR data_access_level IN ('all', 'filtered', 'self')),
    can_see_sensitive_data boolean,
    publisher_filter_conditions text[],
    publisher_filter_statuses text[],
    publisher_filter_exclude_names text[],
    
    is_active boolean DEFAULT true,
    created_at timestamptz DEFAULT now(),
    updated_at timestamptz DEFAULT now(),
    UNIQUE(profile_id)
);

ALTER TABLE user_permission_overrides ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admin can manage overrides" ON user_permission_overrides FOR ALL USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
);
CREATE POLICY "Users can read own override" ON user_permission_overrides FOR SELECT USING (
    profile_id = auth.uid()
);

-- Index for fast policy lookup
CREATE INDEX IF NOT EXISTS idx_policies_condition_funcao ON permission_policies(target_condition, target_funcao) WHERE is_active = true;
CREATE INDEX IF NOT EXISTS idx_overrides_profile ON user_permission_overrides(profile_id) WHERE is_active = true;

-- 3. Seed: Default Policies
-- Ancião (geral) — full agent access
INSERT INTO permission_policies (target_condition, target_funcao, allowed_tabs, allowed_agent_actions, blocked_agent_actions, data_access_level, can_see_sensitive_data, priority)
VALUES (
    'Ancião', NULL,
    ARRAY['agent'],
    ARRAY['GENERATE_WEEK','ASSIGN_PART','UNDO_LAST','NAVIGATE_WEEK','VIEW_S140','SHARE_S140_WHATSAPP','CHECK_SCORE','CLEAR_WEEK','UPDATE_PUBLISHER','UPDATE_AVAILABILITY','MANAGE_SPECIAL_EVENT','SEND_S140','SEND_S89','FETCH_DATA','SIMULATE_ASSIGNMENT','NOTIFY_REFUSAL','SHOW_MODAL','MANAGE_LOCAL_NEEDS','GET_ANALYTICS','IMPORT_WORKBOOK','MANAGE_WORKBOOK_PART','MANAGE_WORKBOOK_WEEK'],
    '{}',
    'all', true, 5
);

-- Ancião + Sup. Reunião VM — same as elder but higher priority
INSERT INTO permission_policies (target_condition, target_funcao, allowed_tabs, allowed_agent_actions, blocked_agent_actions, data_access_level, can_see_sensitive_data, priority)
VALUES (
    'Ancião', 'Superintendente da Reunião Vida e Ministério',
    ARRAY['agent'],
    ARRAY['GENERATE_WEEK','ASSIGN_PART','UNDO_LAST','NAVIGATE_WEEK','VIEW_S140','SHARE_S140_WHATSAPP','CHECK_SCORE','CLEAR_WEEK','UPDATE_PUBLISHER','UPDATE_AVAILABILITY','MANAGE_SPECIAL_EVENT','SEND_S140','SEND_S89','FETCH_DATA','SIMULATE_ASSIGNMENT','NOTIFY_REFUSAL','SHOW_MODAL','MANAGE_LOCAL_NEEDS','GET_ANALYTICS','IMPORT_WORKBOOK','MANAGE_WORKBOOK_PART','MANAGE_WORKBOOK_WEEK'],
    '{}',
    'all', true, 10
);

-- Ancião + Coordenador
INSERT INTO permission_policies (target_condition, target_funcao, allowed_tabs, allowed_agent_actions, blocked_agent_actions, data_access_level, can_see_sensitive_data, priority)
VALUES (
    'Ancião', 'Coordenador do Corpo de Anciãos',
    ARRAY['agent'],
    ARRAY['GENERATE_WEEK','ASSIGN_PART','UNDO_LAST','NAVIGATE_WEEK','VIEW_S140','SHARE_S140_WHATSAPP','CHECK_SCORE','CLEAR_WEEK','UPDATE_PUBLISHER','UPDATE_AVAILABILITY','MANAGE_SPECIAL_EVENT','SEND_S140','SEND_S89','FETCH_DATA','SIMULATE_ASSIGNMENT','NOTIFY_REFUSAL','SHOW_MODAL','MANAGE_LOCAL_NEEDS','GET_ANALYTICS','IMPORT_WORKBOOK','MANAGE_WORKBOOK_PART','MANAGE_WORKBOOK_WEEK'],
    '{}',
    'all', true, 10
);

-- SM + Ajudante Sup. RVM — expanded: CRUD designações + change status (sem dados sensíveis)
INSERT INTO permission_policies (target_condition, target_funcao, allowed_tabs, allowed_agent_actions, blocked_agent_actions, data_access_level, can_see_sensitive_data, priority)
VALUES (
    'Servo Ministerial', 'Ajudante do Superintendente da Reunião Vida e Ministério',
    ARRAY['agent'],
    ARRAY['GENERATE_WEEK','ASSIGN_PART','UNDO_LAST','NAVIGATE_WEEK','VIEW_S140','SHARE_S140_WHATSAPP','CHECK_SCORE','FETCH_DATA','SIMULATE_ASSIGNMENT','SHOW_MODAL','MANAGE_LOCAL_NEEDS','GET_ANALYTICS','IMPORT_WORKBOOK','MANAGE_WORKBOOK_PART','MANAGE_WORKBOOK_WEEK','SEND_S140','SEND_S89'],
    '{}',
    'filtered', false, 8
);

-- Ancião + Ajudante Sup. RVM — same as Sup. titular
INSERT INTO permission_policies (target_condition, target_funcao, allowed_tabs, allowed_agent_actions, blocked_agent_actions, data_access_level, can_see_sensitive_data, priority)
VALUES (
    'Ancião', 'Ajudante do Superintendente da Reunião Vida e Ministério',
    ARRAY['agent'],
    ARRAY['GENERATE_WEEK','ASSIGN_PART','UNDO_LAST','NAVIGATE_WEEK','VIEW_S140','SHARE_S140_WHATSAPP','CHECK_SCORE','CLEAR_WEEK','UPDATE_PUBLISHER','UPDATE_AVAILABILITY','MANAGE_SPECIAL_EVENT','SEND_S140','SEND_S89','FETCH_DATA','SIMULATE_ASSIGNMENT','NOTIFY_REFUSAL','SHOW_MODAL','MANAGE_LOCAL_NEEDS','GET_ANALYTICS','IMPORT_WORKBOOK','MANAGE_WORKBOOK_PART','MANAGE_WORKBOOK_WEEK'],
    '{}',
    'all', true, 10
);

-- Servo Ministerial (geral) — read + operate
INSERT INTO permission_policies (target_condition, target_funcao, allowed_tabs, allowed_agent_actions, blocked_agent_actions, data_access_level, can_see_sensitive_data, priority)
VALUES (
    'Servo Ministerial', NULL,
    ARRAY['agent'],
    ARRAY['CHECK_SCORE','FETCH_DATA','GET_ANALYTICS','SIMULATE_ASSIGNMENT','NAVIGATE_WEEK','VIEW_S140','MANAGE_WORKBOOK_PART','MANAGE_WORKBOOK_WEEK','ASSIGN_PART','GENERATE_WEEK','UNDO_LAST','IMPORT_WORKBOOK','MANAGE_LOCAL_NEEDS','SHOW_MODAL'],
    '{}',
    'filtered', false, 3
);

-- Publicador (condição) — read only
INSERT INTO permission_policies (target_condition, target_funcao, allowed_tabs, allowed_agent_actions, blocked_agent_actions, data_access_level, can_see_sensitive_data, priority)
VALUES (
    'Publicador', NULL,
    ARRAY['agent'],
    ARRAY['CHECK_SCORE','FETCH_DATA','GET_ANALYTICS','SIMULATE_ASSIGNMENT','NAVIGATE_WEEK','VIEW_S140','SHOW_MODAL'],
    '{}',
    'self', false, 1
);
