-- ============================================================================
-- Push Nativo (Web Push) — extensão da funcionalidade Notificações de Alertas
-- Tabela própria de inscrições push. Nada existente é alterado.
-- Acesso exclusivo via service_role (Edge Function push-subscribe).
-- ============================================================================

create table if not exists public.push_subscriptions (
    id uuid primary key default gen_random_uuid(),
    endpoint text not null unique,        -- URL única do push service (FCM/Mozilla/Apple)
    p256dh text not null,                 -- chave pública do cliente
    auth text not null,                   -- segredo de autenticação do cliente
    publisher_id uuid,                    -- opcional: vínculo com publicador (sem FK para desacoplamento)
    user_agent text,
    created_at timestamptz not null default now()
);

comment on table public.push_subscriptions is
  'Inscrições Web Push (notificações nativas do SO) da funcionalidade de Alertas e Agendas. Isolada; escrita apenas via Edge Function push-subscribe (service_role).';

alter table public.push_subscriptions enable row level security;
