from supabase import create_client, Client

# Configuração
SUPABASE_URL = 'https://pevstuyzlewvjidjkmea.supabase.co'
SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBldnN0dXl6bGV3dmppZGprbWVhIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjU3NzczNTYsImV4cCI6MjA4MTM1MzM1Nn0.myYaq8rshNyB2aGTas2f1IzsQVv_rihOGL2v8EPl-x0'

supabase: Client = create_client(SUPABASE_URL, SUPABASE_KEY)

POTENTIAL_TABLES = [
    'special_events',
    'users',
    'profiles',
    'config',
    'settings',
    'audit_logs',
    'event_templates', # Just in case
    'notifications',
    'backups'
]

print("-" * 50)
print(f"{'TABLE NAME':<25} | {'EXISTS?':<10} | {'COUNT':<10}")
print("-" * 50)

found_tables = []

for table_name in POTENTIAL_TABLES:
    try:
        res = supabase.table(table_name).select('*', count='exact', head=True).execute()
        count = res.count if res.count is not None else 0
        print(f"{table_name:<25} | {'YES':<10} | {str(count):<10}")
        found_tables.append(table_name)
    except Exception as e:
        msg = str(e)
        if "404" in msg or "relation" in msg and "does not exist" in msg:
             print(f"{table_name:<25} | {'NO':<10} | -")
        else:
             print(f"{table_name:<25} | {'ERROR':<10} | {msg[:30]}...")

print("-" * 50)
