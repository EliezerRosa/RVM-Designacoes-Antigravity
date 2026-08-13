create table if not exists ai_system_logs (
  id uuid default gen_random_uuid() primary key,
  level text not null check (level in ('ERROR', 'WARN', 'INFO')),
  message text not null,
  details jsonb,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- Index for faster querying by level and time
create index if not exists idx_ai_system_logs_level_created on ai_system_logs(level, created_at desc);

-- RLS Policies
alter table ai_system_logs enable row level security;

-- Only authenticated users (admins) can view logs
create policy "Enable read access for authenticated users" on ai_system_logs
  for select
  using (auth.role() = 'authenticated');

-- Enable insert for anon key (since our Edge Function uses anon key)
-- ideally we would restrict this more, but for now this is necessary for the API to write to it
create policy "Enable insert for anon key" on ai_system_logs
  for insert
  with check (true);
