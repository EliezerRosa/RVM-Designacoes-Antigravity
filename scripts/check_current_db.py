from supabase import create_client, Client

SUPABASE_URL = 'https://pevstuyzlewvjidjkmea.supabase.co'
SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBldnN0dXl6bGV3dmppZGprbWVhIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjU3NzczNTYsImV4cCI6MjA4MTM1MzM1Nn0.myYaq8rshNyB2aGTas2f1IzsQVv_rihOGL2v8EPl-x0'

supabase: Client = create_client(SUPABASE_URL, SUPABASE_KEY)

tables = ['workbook_batches', 'extraction_history', 'special_events']

print("--- CURRENT DB COUNTS ---")
for t in tables:
    try:
        res = supabase.table(t).select('*', count='exact', head=True).execute()
        print(f"{t}: {res.count}")
    except Exception as e:
        print(f"{t}: ERROR {e}")
