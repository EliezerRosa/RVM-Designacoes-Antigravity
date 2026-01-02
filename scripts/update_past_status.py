import requests
from datetime import datetime
from collections import Counter

SUPABASE_URL = 'https://pevstuyzlewvjidjkmea.supabase.co'
SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBldnN0dXl6bGV3dmppZGprbWVhIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjU3NzczNTYsImV4cCI6MjA4MTM1MzM1Nn0.myYaq8rshNyB2aGTas2f1IzsQVv_rihOGL2v8EPl-x0'

headers = {
    'apikey': SUPABASE_ANON_KEY,
    'Authorization': f'Bearer {SUPABASE_ANON_KEY}',
    'Content-Type': 'application/json',
    'Prefer': 'return=representation'
}

CUTOFF = '2026-01-02'

# Buscar partes passadas que NAO sao CONCLUIDA
print(f'Buscando partes com date < {CUTOFF} e status != CONCLUIDA...')
all_parts = []
offset = 0
while True:
    url = f'{SUPABASE_URL}/rest/v1/workbook_parts?select=id,date,status&date=lt.{CUTOFF}&status=neq.CONCLUIDA&offset={offset}&limit=1000'
    response = requests.get(url, headers=headers)
    data = response.json()
    if not data:
        break
    all_parts.extend(data)
    if len(data) < 1000:
        break
    offset += 1000

print(f'{len(all_parts)} partes encontradas')

# Mostrar status atual
status_count = Counter(p.get('status') for p in all_parts)
for s, c in status_count.items():
    print(f'  {s}: {c}')

# Atualizar todas
print(f'\nAtualizando para CONCLUIDA...')
updated = 0
errors = 0
for p in all_parts:
    url = f"{SUPABASE_URL}/rest/v1/workbook_parts?id=eq.{p['id']}"
    response = requests.patch(url, headers=headers, json={'status': 'CONCLUIDA'})
    if response.status_code in [200, 204]:
        updated += 1
    else:
        errors += 1

print(f'\nAtualizadas: {updated}')
print(f'Erros: {errors}')
