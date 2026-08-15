-- ============================================================================
-- Funcionalidade: Notificações de Alertas e Agendas (100% desacoplada)
-- Tabela própria de idempotência — NÃO reusa zapi_dispatch_log.
-- Nenhuma tabela/função existente é alterada por esta migration.
-- ============================================================================

create table if not exists public.alert_notification_log (
    id uuid primary key default gen_random_uuid(),
    alert_key text not null,              -- chave idempotente do alerta (ex.: 'DISPATCH_ERROR_2026-08-14', 'WEEK_UNPUBLISHED_D15_2026-08-24')
    alert_type text not null,             -- categoria: 'DISPATCH_ERROR' | 'PENDING_IMPORT' | 'WEEK_UNPUBLISHED_D15' | ...
    recipient_phone text not null,
    status text not null default 'SUCCESS', -- 'SUCCESS' | 'ERROR'
    payload jsonb,                        -- snapshot do contexto do alerta
    created_at timestamptz not null default now(),
    -- Idempotência atômica: 1 envio por alerta por destinatário
    constraint alert_notification_log_unique unique (alert_key, recipient_phone)
);

comment on table public.alert_notification_log is
  'Log idempotente da funcionalidade de Notificações de Alertas e Agendas (cron-alert-notifications). Isolado das demais funcionalidades.';

-- RLS: somente service_role escreve/lê (Edge Function). Sem acesso anônimo.
alter table public.alert_notification_log enable row level security;
