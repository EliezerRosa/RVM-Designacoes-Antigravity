import os
import requests

SUPABASE_URL = 'https://pevstuyzlewvjidjkmea.supabase.co'
SUPABASE_ANON_KEY = os.getenv('SUPABASE_ANON_KEY', '')

url = f'{SUPABASE_URL}/rest/v1/publishers?select=*&limit=5'
response = requests.get(url, headers={'apikey': SUPABASE_ANON_KEY, 'Authorization': f'Bearer {SUPABASE_ANON_KEY}'})
pubs = response.json()

print(f'{len(pubs)} publicadores')
for p in pubs:
    data = p.get('data', {})
    name = data.get('name', 'N/A')
    gender = data.get('gender', 'N/A')
    condition = data.get('condition', 'N/A')
    print(f"  ID: {p.get('id')} | {name} | {gender} | {condition}")
