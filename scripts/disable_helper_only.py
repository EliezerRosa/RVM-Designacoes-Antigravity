import requests
import json

SUPABASE_URL = 'https://pevstuyzlewvjidjkmea.supabase.co'
SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBldnN0dXl6bGV3dmppZGprbWVhIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjU3NzczNTYsImV4cCI6MjA4MTM1MzM1Nn0.myYaq8rshNyB2aGTas2f1IzsQVv_rihOGL2v8EPl-x0'

headers = {
    'apikey': SUPABASE_ANON_KEY,
    'Authorization': f'Bearer {SUPABASE_ANON_KEY}',
    'Content-Type': 'application/json',
    'Prefer': 'return=representation'
}

# Buscar todos os publicadores
url = f'{SUPABASE_URL}/rest/v1/publishers?select=*'
response = requests.get(url, headers=headers)
pubs = response.json()

print(f'{len(pubs)} publicadores encontrados')

# Verificar estrutura
if pubs:
    data = pubs[0].get('data', {})
    print(f'Keys: {list(data.keys())}')

# Contar quantos têm helperOnly = true
helper_only_count = 0
for p in pubs:
    data = p.get('data', {})
    if data.get('isHelperOnly') == True:
        helper_only_count += 1
        print(f"  - {data.get('name')}: isHelperOnly=True")

print(f'\n{helper_only_count} publicadores com isHelperOnly=True')

# Desativar helperOnly em todos
print('\nDesativando isHelperOnly em todos...')
updated = 0
for p in pubs:
    data = p.get('data', {})
    if data.get('isHelperOnly') == True:
        # Atualizar o campo
        data['isHelperOnly'] = False
        
        update_url = f"{SUPABASE_URL}/rest/v1/publishers?id=eq.{p['id']}"
        response = requests.patch(update_url, headers=headers, json={'data': data})
        
        if response.status_code in [200, 204]:
            updated += 1
            print(f"  ✅ {data.get('name')}")
        else:
            print(f"  ❌ {data.get('name')}: {response.status_code}")

print(f'\n{updated} publicadores atualizados')
