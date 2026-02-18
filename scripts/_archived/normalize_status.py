import requests

SUPABASE_URL = 'https://pevstuyzlewvjidjkmea.supabase.co'
SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBldnN0dXl6bGV3dmppZGprbWVhIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjU3NzczNTYsImV4cCI6MjA4MTM1MzM1Nn0.myYaq8rshNyB2aGTas2f1IzsQVv_rihOGL2v8EPl-x0'

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
