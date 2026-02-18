from supabase import create_client
import os
from dotenv import load_dotenv
import sys

load_dotenv(os.path.join(os.path.dirname(__file__), '..', '.env'))

client = create_client(
    os.getenv('VITE_SUPABASE_URL'),
    os.getenv('VITE_SUPABASE_ANON_KEY')
)

# Buscar partes da semana 2026-02 (12-18 Janeiro)
result = client.table('workbook_parts').select(
    'seq,funcao,tipoParte,tituloParte,rawPublisherName,resolvedPublisherName'
).eq('weekId', '2026-02').order('seq').execute()

print("seq  funcao     tipoParte                      tituloParte                              Nome")
print("-" * 150)
for p in result.data:
    seq = p.get('seq', 0)
    funcao = p.get('funcao', '')[:8]
    tipoParte = (p.get('tipoParte', '') or '')[:30]
    tituloParte = (p.get('tituloParte', '') or '')[:40]
    nome = p.get('resolvedPublisherName') or p.get('rawPublisherName') or ''
    print(f"{seq:02d}  {funcao:8s}  {tipoParte:30s}  {tituloParte:40s}  {nome}")
