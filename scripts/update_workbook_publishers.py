#!/usr/bin/env python3
"""
Script para atualizar participações antigas na tabela workbook_parts (Apostila).
Atualiza apenas:
- raw_publisher_name: nome do publicador
- status: COMPLETED (parte já foi executada)

Match por: semana + Título da Parte + Função

Uso:
    python scripts/update_workbook_publishers.py
"""

import pandas as pd
import requests
from datetime import datetime

# ==============================================================================
# Configuração do Supabase
# ==============================================================================

import os
from dotenv import load_dotenv

# Load environment variables
load_dotenv()

SUPABASE_URL = os.getenv("SUPABASE_URL")
SUPABASE_ANON_KEY = os.getenv("SUPABASE_ANON_KEY")

if not SUPABASE_URL or not SUPABASE_ANON_KEY:
    print("❌ Erro: Credenciais do Supabase não encontradas no arquivo .env")
    exit(1)

HEADERS = {
    "apikey": SUPABASE_ANON_KEY,
    "Authorization": f"Bearer {SUPABASE_ANON_KEY}",
    "Content-Type": "application/json",
    "Prefer": "return=representation"
}

# Caminho do arquivo Excel
EXCEL_PATH = r"c:\Antigravity - RVM Designações\ANTIGRAVITY Designações Antigas\RVM_Consolidado_2024_2026 Gemini v2.xlsx"

# ==============================================================================
# Funções auxiliares
# ==============================================================================

def normalize_text(text: str) -> str:
    """Normaliza texto para comparação"""
    if not text:
        return ""
    return text.lower().strip()

def extract_part_number(title: str) -> str:
    """Extrai número da parte (ex: '4. Iniciando conversas' -> '4')"""
    if not title:
        return ""
    parts = title.strip().split('.')
    if len(parts) > 0 and parts[0].isdigit():
        return parts[0]
    return ""

def format_date(date_val) -> str:
    """Formata data para YYYY-MM-DD"""
    if pd.isna(date_val):
        return None
    if isinstance(date_val, datetime):
        return date_val.strftime("%Y-%m-%d")
    if isinstance(date_val, str):
        for fmt in ["%Y-%m-%d", "%d/%m/%Y", "%Y-%m-%d %H:%M:%S"]:
            try:
                return datetime.strptime(date_val.split()[0], fmt).strftime("%Y-%m-%d")
            except:
                continue
    return str(date_val).split()[0] if date_val else None

# ==============================================================================
# Funções de API
# ==============================================================================

def fetch_all_parts() -> list:
    """Busca todas as partes do workbook_parts com paginação"""
    all_parts = []
    offset = 0
    limit = 1000
    
    print("[Supabase] Carregando partes...")
    
    while True:
        url = f"{SUPABASE_URL}/rest/v1/workbook_parts?select=*&offset={offset}&limit={limit}"
        response = requests.get(url, headers=HEADERS)
        
        if response.status_code != 200:
            print(f"[ERRO] Falha: {response.status_code}")
            break
        
        data = response.json()
        if not data:
            break
            
        all_parts.extend(data)
        
        if len(data) < limit:
            break
        offset += limit
    
    print(f"[Supabase] {len(all_parts)} partes carregadas")
    return all_parts

def update_part(part_id: str, updates: dict) -> bool:
    """Atualiza uma parte no Supabase"""
    url = f"{SUPABASE_URL}/rest/v1/workbook_parts?id=eq.{part_id}"
    response = requests.patch(url, headers=HEADERS, json=updates)
    return response.status_code in [200, 204]

# ==============================================================================
# Match
# ==============================================================================

# Mapeamento de títulos do Excel para a Apostila
TITLE_MAPPING = {
    'presidente': 'presidente da reunião',
    'oração inicial': 'oração inicial',
    'oração final': 'oração final',
}

def normalize_title(title: str) -> str:
    """Normaliza título para comparação, aplicando mapeamento"""
    t = normalize_text(title)
    # Aplicar mapeamento se existir
    for excel_title, apostila_title in TITLE_MAPPING.items():
        if excel_title in t:
            return apostila_title
    return t

def find_matching_part(excel_row: dict, db_parts: list) -> dict:
    """
    Match por: semana + Título da Parte + Função
    """
    excel_date = format_date(excel_row.get('Data'))
    excel_title = str(excel_row.get('Título da Parte', '')).strip()
    excel_funcao = str(excel_row.get('Função', '')).strip()
    
    if not excel_date or not excel_title:
        return None
    
    excel_part_num = extract_part_number(excel_title)
    excel_title_normalized = normalize_title(excel_title)
    
    for part in db_parts:
        # Match por data (semana)
        if part.get('date', '') != excel_date:
            continue
        
        # Match por função
        if normalize_text(part.get('funcao', '')) != normalize_text(excel_funcao):
            continue
        
        # Match por título
        part_title = part.get('part_title', '') or part.get('tipo_parte', '') or ''
        part_num = extract_part_number(part_title)
        part_title_normalized = normalize_title(part_title)
        
        # Match por número da parte (se existir)
        if excel_part_num and part_num and excel_part_num == part_num:
            return part
        
        # Match por título normalizado (para partes sem número como Presidente)
        if excel_title_normalized and excel_title_normalized in part_title_normalized:
            return part
    
    return None

# ==============================================================================
# Main
# ==============================================================================

def main():
    print("=" * 60)
    print("ATUALIZAÇÃO DE PARTICIPAÇÕES ANTIGAS (APOSTILA)")
    print("=" * 60)
    
    # 1. Carregar Excel
    print(f"\n[Excel] Carregando: {EXCEL_PATH}")
    try:
        df = pd.read_excel(EXCEL_PATH)
        print(f"[Excel] {len(df)} linhas")
    except Exception as e:
        print(f"[ERRO] {e}")
        return
    
    # 2. Carregar partes do Supabase
    db_parts = fetch_all_parts()
    if not db_parts:
        print("[ERRO] Nenhuma parte no BD")
        return
    
    # 3. Processar
    print("\n[Processamento] Atualizando...")
    
    stats = {'updated': 0, 'skipped': 0, 'not_found': 0, 'errors': 0}
    
    for idx, row in df.iterrows():
        excel_name = str(row.get('Nome', '')).strip()
        excel_title = str(row.get('Título da Parte', '')).strip()
        excel_date = format_date(row.get('Data'))
        excel_funcao = str(row.get('Função', '')).strip()
        
        if not excel_name:
            continue
        
        # Encontrar parte
        part = find_matching_part(row.to_dict(), db_parts)
        
        if not part:
            print(f"  ⚠️ Não encontrado: {excel_date} | {excel_title[:40]} | {excel_funcao}")
            stats['not_found'] += 1
            continue
        
        # Verificar se já está COMPLETED com nome
        if part.get('status') == 'COMPLETED' and part.get('raw_publisher_name'):
            stats['skipped'] += 1
            continue
        
        # Atualizar apenas raw_publisher_name e status
        updates = {
            'raw_publisher_name': excel_name,
            'status': 'COMPLETED',
            'updated_at': datetime.now().isoformat()
        }
        
        if update_part(part['id'], updates):
            stats['updated'] += 1
            print(f"  ✅ {excel_date} | {excel_title[:35]}... | {excel_name}")
        else:
            stats['errors'] += 1
    
    # Relatório
    print("\n" + "=" * 60)
    print("RELATÓRIO")
    print("=" * 60)
    print(f"  📊 Excel: {len(df)} linhas")
    print(f"  ✅ Atualizadas: {stats['updated']}")
    print(f"  ⏭️ Já completas: {stats['skipped']}")
    print(f"  ⚠️ Não encontradas: {stats['not_found']}")
    print(f"  ❌ Erros: {stats['errors']}")
    print("=" * 60)

if __name__ == "__main__":
    main()
