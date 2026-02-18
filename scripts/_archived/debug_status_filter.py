import requests
from collections import Counter

SUPABASE_URL = 'https://pevstuyzlewvjidjkmea.supabase.co'
SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBldnN0dXl6bGV3dmppZGprbWVhIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjU3NzczNTYsImV4cCI6MjA4MTM1MzM1Nn0.myYaq8rshNyB2aGTas2f1IzsQVv_rihOGL2v8EPl-x0'

# 1. Primeiro, ver todos os status distintos no BD
print("=" * 60)
print("1. STATUS DISTINTOS NO BD")
print("=" * 60)
url = f'{SUPABASE_URL}/rest/v1/workbook_parts?select=status&limit=3000'
response = requests.get(url, headers={'apikey': SUPABASE_ANON_KEY, 'Authorization': f'Bearer {SUPABASE_ANON_KEY}'})
parts = response.json()
status_count = Counter(p.get('status') for p in parts)
for s, c in sorted(status_count.items(), key=lambda x: -x[1]):
    print(f'  {repr(s)}: {c}')

print()

# 2. Testar query com filtro status=PENDENTE (como a UI faz)
print("=" * 60)
print("2. QUERY COM FILTRO status=eq.PENDENTE")
print("=" * 60)
url = f'{SUPABASE_URL}/rest/v1/workbook_parts?select=id,week_id,tipo_parte,status&status=eq.PENDENTE&limit=20'
response = requests.get(url, headers={'apikey': SUPABASE_ANON_KEY, 'Authorization': f'Bearer {SUPABASE_ANON_KEY}'})
pend_parts = response.json()
print(f'Retornou: {len(pend_parts)} partes')
for p in pend_parts[:10]:
    print(f'  {p.get("week_id")} | {p.get("tipo_parte")[:30]:<30} | {p.get("status")}')

print()

# 3. Testar query com filtro status=eq.Pendente (case diferente)
print("=" * 60)
print("3. QUERY COM FILTRO status=eq.Pendente (minúsculo)")
print("=" * 60)
url = f'{SUPABASE_URL}/rest/v1/workbook_parts?select=id,week_id,tipo_parte,status&status=eq.Pendente&limit=20'
response = requests.get(url, headers={'apikey': SUPABASE_ANON_KEY, 'Authorization': f'Bearer {SUPABASE_ANON_KEY}'})
pend_parts2 = response.json()
print(f'Retornou: {len(pend_parts2)} partes')
