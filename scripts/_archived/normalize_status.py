import os
import requests

SUPABASE_URL = 'https://pevstuyzlewvjidjkmea.supabase.co'
SUPABASE_ANON_KEY = os.getenv('SUPABASE_ANON_KEY', '')

headers = {
    'apikey': SUPABASE_ANON_KEY,
    'Authorization': f'Bearer {SUPABASE_ANON_KEY}',
    'Content-Type': 'application/json',
    'Prefer': 'return=representation'
}

print("Normalizando status no banco de dados...")
print()

# 1. Corrigir 'Pendente' -> 'PENDENTE'
print("[1] Corrigindo 'Pendente' -> 'PENDENTE'")
url = f'{SUPABASE_URL}/rest/v1/workbook_parts?status=eq.Pendente'
response = requests.patch(url, headers=headers, json={'status': 'PENDENTE'})
print(f"    Status: {response.status_code}")

# 2. Corrigir 'COMPLETED' -> 'CONCLUIDA'
print("[2] Corrigindo 'COMPLETED' -> 'CONCLUIDA'")
url = f'{SUPABASE_URL}/rest/v1/workbook_parts?status=eq.COMPLETED'
response = requests.patch(url, headers=headers, json={'status': 'CONCLUIDA'})
print(f"    Status: {response.status_code}")

# Verificar resultado
print()
print("Verificando resultado:")
url = f'{SUPABASE_URL}/rest/v1/workbook_parts?select=status&limit=3000'
response = requests.get(url, headers=headers)
parts = response.json()
from collections import Counter
status_count = Counter(p.get('status') for p in parts)
for s, c in sorted(status_count.items(), key=lambda x: -x[1]):
    print(f'  {repr(s)}: {c}')
