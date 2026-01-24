-- Cache de Intenções para Agente IA
-- Otimização de Cota: Armazena respostas para prompts repetidos.

create table if not exists ai_intent_cache (
  id uuid default gen_random_uuid() primary key,
  prompt_hash text not null, -- SHA-256 hash do prompt normalizado
  prompt_preview text,       -- Primeiros 200 chars do prompt para debug
  thinking_level text not null, -- 'LOW', 'MEDIUM', 'HIGH'
  model_used text not null,
  response jsonb not null,   -- A resposta completa enviada ao frontend
  thought_process text,      -- O raciocínio (se houver)
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- Índice para busca rápida por hash
create index if not exists ai_intent_cache_hash_idx on ai_intent_cache(prompt_hash);

-- Política de RLS (Row Level Security)
-- Permitir leitura pública (ou restrita a autenticados)
alter table ai_intent_cache enable row level security;

create policy "Allow read access to anyone"
on ai_intent_cache for select
using (true);

create policy "Allow insert access to anyone"
on ai_intent_cache for insert
with check (true);
