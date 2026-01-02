import requests
from collections import defaultdict

SUPABASE_URL = 'https://pevstuyzlewvjidjkmea.supabase.co'
SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBldnN0dXl6bGV3dmppZGprbWVhIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjU3NzczNTYsImV4cCI6MjA4MTM1MzM1Nn0.myYaq8rshNyB2aGTas2f1IzsQVv_rihOGL2v8EPl-x0'

week_id = '2026-01-05'
url = f'{SUPABASE_URL}/rest/v1/workbook_parts?select=seq,funcao,tipo_parte,resolved_publisher_name,raw_publisher_name&week_id=eq.{week_id}&limit=100'
response = requests.get(url, headers={'apikey': SUPABASE_ANON_KEY, 'Authorization': f'Bearer {SUPABASE_ANON_KEY}'})
parts = response.json()

# Contar titulares vs ajudantes
titulares = [p for p in parts if p.get('funcao') == 'Titular']
ajudantes = [p for p in parts if p.get('funcao') == 'Ajudante']

print(f'Semana: {week_id}')
print(f'Titulares: {len(titulares)}, Ajudantes: {len(ajudantes)}')
print()

if ajudantes:
    print('AJUDANTES encontrados:')
    for a in ajudantes:
        print(f"  seq={a.get('seq')} | {a.get('tipo_parte')[:30]} | {a.get('resolved_publisher_name') or a.get('raw_publisher_name')}")
else:
    print('NENHUM AJUDANTE encontrado! Problema no BD ou no preenchimento.')
