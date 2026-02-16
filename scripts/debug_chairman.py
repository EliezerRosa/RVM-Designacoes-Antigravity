from supabase import create_client
import os
from dotenv import load_dotenv
import sys

# Load env from parent directory
load_dotenv(os.path.join(os.path.dirname(__file__), '..', '.env'))

url = os.getenv('VITE_SUPABASE_URL')
key = os.getenv('VITE_SUPABASE_ANON_KEY')
client = create_client(url, key)

target_id = "6c2d0914-64ee-4e5d-a456-d88593ba45ca"
print(f"--- Debugging ID {target_id} ---")

# 1. Search for ID globally
res = client.table('workbook_parts').select('*').eq('id', target_id).execute()
if res.data:
    p = res.data[0]
    print(f"FOUND ID GLOBALLY!")
    print(f"Week: {p.get('week_id')}")
    print(f"Week Display: {p.get('week_display')}")
    print(f"Seq: {p.get('seq')}")
    print(f"Tipo: {p.get('tipo_parte')}")
    print(f"Título: {p.get('titulo_parte')}")
else:
    print("ID NOT FOUND GLOBALLY.")

print("\n--- Searching for 'Presidente' in 2026-03 ---")
# 2. Search for any 'Presidente' type part in relevant weeks
res = client.table('workbook_parts').select('id,week_id,seq,tipo_parte').ilike('week_id', '2026-03%').ilike('tipo_parte', '%residen%').execute()

for p in res.data:
    print(f"Week: {p.get('week_id')} | Seq: {p.get('seq')} | Tipo: {p.get('tipo_parte')} | ID: {p.get('id')}")

