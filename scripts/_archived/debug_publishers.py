import requests

SUPABASE_URL = 'https://pevstuyzlewvjidjkmea.supabase.co'
SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBldnN0dXl6bGV3dmppZGprbWVhIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjU3NzczNTYsImV4cCI6MjA4MTM1MzM1Nn0.myYaq8rshNyB2aGTas2f1IzsQVv_rihOGL2v8EPl-x0'

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
