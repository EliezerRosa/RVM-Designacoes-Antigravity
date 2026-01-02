#!/usr/bin/env python3
"""
Script para importar nomes do Excel RVM_Consolidado_2024_2026.xlsx.

Uso:
    python scripts/import_excel_consolidado.py [--dry-run]
"""

import pandas as pd
import requests
from datetime import datetime
import sys

# ==============================================================================
# Configuração
# ==============================================================================

SUPABASE_URL = "https://pevstuyzlewvjidjkmea.supabase.co"
SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBldnN0dXl6bGV3dmppZGprbWVhIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjU3NzczNTYsImV4cCI6MjA4MTM1MzM1Nn0.myYaq8rshNyB2aGTas2f1IzsQVv_rihOGL2v8EPl-x0"

HEADERS = {
    "apikey": SUPABASE_ANON_KEY,
    "Authorization": f"Bearer {SUPABASE_ANON_KEY}",
    "Content-Type": "application/json",
    "Prefer": "return=representation"
}

EXCEL_PATH = r"c:\Antigravity - RVM Designações\ANTIGRAVITY Designações Antigas\RVM_Consolidado_2024_2026.xlsx"

# ==============================================================================
# Funções
# ==============================================================================

def normalize(s):
    if not s or pd.isna(s):
        return ""
    return str(s).lower().strip().replace('ã', 'a').replace('ç', 'c').replace('é', 'e').replace('í', 'i').replace('ó', 'o').replace('ú', 'u')

def fetch_parts_without_names():
    all_parts = []
    offset = 0
    while True:
        url = f"{SUPABASE_URL}/rest/v1/workbook_parts?select=*&or=(raw_publisher_name.is.null,raw_publisher_name.eq.)&offset={offset}&limit=1000"
        response = requests.get(url, headers=HEADERS)
        data = response.json()
        if not data:
            break
        all_parts.extend(data)
        if len(data) < 1000:
            break
        offset += 1000
    return all_parts

def update_part(part_id: str, updates: dict) -> bool:
    url = f"{SUPABASE_URL}/rest/v1/workbook_parts?id=eq.{part_id}"
    response = requests.patch(url, headers=HEADERS, json=updates)
    return response.status_code in [200, 204]

def main():
    dry_run = '--dry-run' in sys.argv
    
    print("=" * 70)
    print("IMPORTAÇÃO DO EXCEL CONSOLIDADO")
    print("=" * 70)
    
    if dry_run:
        print("\n⚠️  MODO DRY-RUN\n")
    
    # 1. Carregar Excel
    print("\n[1] CARREGANDO EXCEL")
    print("-" * 40)
    
    df = pd.read_excel(EXCEL_PATH)
    print(f"  Linhas: {len(df)}")
    print(f"  Colunas: {list(df.columns)}")
    
    # 2. Criar índice do Excel
    print("\n[2] INDEXANDO EXCEL")
    print("-" * 40)
    
    excel_index = {}
    for idx, row in df.iterrows():
        semana = row.get('Semana')
        if pd.isna(semana):
            continue
        
        # Formatar data
        if isinstance(semana, datetime):
            date_str = semana.strftime('%Y-%m-%d')
        else:
            date_str = str(semana)[:10]
        
        tipo = normalize(row.get('Tipo da Parte', ''))
        funcao = normalize(row.get('Função', 'titular'))
        
        # Nome: preferir Publicador, senão Nome Original
        nome = str(row.get('Publicador', '') or row.get('Nome Original', '')).strip()
        
        if nome and nome != 'nan' and len(nome) > 2:
            key = (date_str, tipo, funcao)
            excel_index[key] = nome
    
    print(f"  Entradas indexadas: {len(excel_index)}")
    
    # 3. Buscar partes sem nome
    print("\n[3] BUSCA NO BANCO DE DADOS")
    print("-" * 40)
    
    parts_without_names = fetch_parts_without_names()
    print(f"  [Supabase] {len(parts_without_names)} partes sem nome")
    
    # 4. Match e atualização
    print("\n[4] ATUALIZANDO")
    print("-" * 40)
    
    stats = {'updated': 0, 'not_found': 0, 'errors': 0}
    
    for part in parts_without_names:
        date = part.get('date', '')
        tipo = normalize(part.get('tipo_parte', ''))
        funcao = normalize(part.get('funcao', 'titular'))
        
        key = (date, tipo, funcao)
        
        if key not in excel_index:
            stats['not_found'] += 1
            continue
        
        nome = excel_index[key]
        titulo = part.get('titulo_parte', '') or part.get('tipo_parte', '')
        
        if not dry_run:
            updates = {
                'raw_publisher_name': nome,
                'status': 'CONCLUIDA',
                'updated_at': datetime.now().isoformat()
            }
            
            if update_part(part['id'], updates):
                stats['updated'] += 1
                print(f"  ✅ {date} | {titulo[:30]:<30} | {nome}")
            else:
                stats['errors'] += 1
        else:
            stats['updated'] += 1
            print(f"  📝 {date} | {titulo[:30]:<30} | {nome}")
    
    # 5. Estatísticas
    print("\n" + "=" * 70)
    print("📈 ESTATÍSTICAS")
    print("=" * 70)
    print(f"  Partes atualizadas:     {stats['updated']}")
    print(f"  Nome não encontrado:    {stats['not_found']}")
    print(f"  Erros:                  {stats['errors']}")
    print("=" * 70)
    
    if dry_run:
        print("\n⚠️  MODO DRY-RUN. Execute sem --dry-run para aplicar.")

if __name__ == "__main__":
    main()
