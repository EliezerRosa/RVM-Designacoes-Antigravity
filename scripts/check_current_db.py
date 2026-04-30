import os
from supabase import create_client, Client

SUPABASE_URL = 'https://pevstuyzlewvjidjkmea.supabase.co'
SUPABASE_KEY = os.getenv('SUPABASE_ANON_KEY', '')

supabase: Client = create_client(SUPABASE_URL, SUPABASE_KEY)

tables = ['workbook_batches', 'extraction_history', 'special_events']

print("--- CURRENT DB COUNTS ---")
for t in tables:
    try:
        res = supabase.table(t).select('*', count='exact', head=True).execute()
        print(f"{t}: {res.count}")
    except Exception as e:
        print(f"{t}: ERROR {e}")
