-- Add token tracking columns to ai_intent_cache
alter table ai_intent_cache 
add column if not exists input_tokens integer default 0,
add column if not exists output_tokens integer default 0,
add column if not exists total_tokens integer default 0;

-- Optimization: Index on created_at for monthly queries
create index if not exists ai_intent_cache_created_at_idx on ai_intent_cache(created_at);
