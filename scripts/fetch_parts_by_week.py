import os
from supabase import create_client, Client
import sys
import json

SUPABASE_URL = 'https://pevstuyzlewvjidjkmea.supabase.co'
SUPABASE_KEY = os.getenv('SUPABASE_ANON_KEY', '')

supabase: Client = create_client(SUPABASE_URL, SUPABASE_KEY)

if len(sys.argv) < 2:
    print("Usage: python fetch_parts_by_week.py <YYYY-MM-DD>")
    sys.exit(1)

week_id = sys.argv[1]

try:
    res = supabase.table('workbook_parts').select('*').eq('week_id', week_id).execute()
    parts = res.data
    print(json.dumps(parts, ensure_ascii=False, indent=2))
except Exception as e:
    print(f"ERROR: {e}")
