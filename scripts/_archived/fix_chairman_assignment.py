from supabase import create_client
import os
from dotenv import load_dotenv
import sys

# Load env from parent directory
load_dotenv(os.path.join(os.path.dirname(__file__), '..', '.env'))

url = os.getenv('VITE_SUPABASE_URL')
key = os.getenv('VITE_SUPABASE_ANON_KEY')
client = create_client(url, key)

week_id = '2026-03-16'
# ID of "Eu sou Deus..." (Talk)
ids_to_clear = ["6c2d0914-64ee-4e5d-a456-d88593ba45ca"]
# ID of "Presidente"
id_to_assign = "45e18d1c-4408-4113-a483-5150c21531da"
target_name = "Marcos Rogério"

print(f"--- Fixing Assignments for Week {week_id} ---")

# 1. Clear "Eu sou Deus..."
print(f"Clearing '{target_name}' from Talk ID {ids_to_clear}...")

for id_val in ids_to_clear:
    # Update to NULL/Empty (using empty string for raw, None for resolved if possible, or Empty string)
    # Note: `resolved_publisher_name` is TEXT, so None is valid in Python -> NULL in DB
    client.table('workbook_parts').update({
        'resolved_publisher_name': None,
        'raw_publisher_name': '',
        'status': 'PENDENTE' # Reset status if needed
    }).eq('id', id_val).execute()
    print(f"Cleared {id_val}")

# 2. Assign to "Presidente"
print(f"Assigning '{target_name}' to President ID {id_to_assign}...")
client.table('workbook_parts').update({
    'resolved_publisher_name': target_name,
    'status': 'DESIGNADA'
}).eq('id', id_to_assign).execute()
print(f"Assigned {id_to_assign}")

# 3. Verify
print("\n--- Verification ---")
res = client.table('workbook_parts').select('id,tipo_parte,resolved_publisher_name').in_('id', ids_to_clear + [id_to_assign]).execute()

for p in res.data:
    print(f"ID: {p['id']} | Tipo: {p.get('tipo_parte')} | Nome: {p.get('resolved_publisher_name')}")

print("\nFix Complete.")
