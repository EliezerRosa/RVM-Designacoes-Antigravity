import os
#!/usr/bin/env python3
"""
Script para preencher gaps com publicadores elegíveis em rotação.

Períodos alvo:
- Mar-Mai 2024: ~236 partes
- Jan 2025: ~57 partes  
- Set 2025: ~57 partes

Uso:
    python scripts/fill_gaps_with_rotation.py [--dry-run]
"""

import requests
from datetime import datetime
import sys
from collections import defaultdict

# ==============================================================================
# Configuração
# ==============================================================================

SUPABASE_URL = "https://pevstuyzlewvjidjkmea.supabase.co"
SUPABASE_ANON_KEY = os.getenv('SUPABASE_ANON_KEY', '')

HEADERS = {
    "apikey": SUPABASE_ANON_KEY,
    "Authorization": f"Bearer {SUPABASE_ANON_KEY}",
    "Content-Type": "application/json",
    "Prefer": "return=representation"
}

# Períodos alvo: TODAS as semanas PASSADAS (antes de hoje)
# Se quiser apenas períodos específicos, descomente e ajuste:
# TARGET_PERIODS = ['2024-03', '2024-04', '2024-05', '2025-01', '2025-09']
TARGET_PERIODS = None  # None = todas as datas passadas

# Data de corte: semanas antes desta data serão preenchidas
CUTOFF_DATE = '2026-01-02'

# Tipos a EXCLUIR (não precisam de nome específico)
TIPOS_EXCLUIR = [
    'cântico final', 'cântico', 'cântico inicial', 'cântico do meio',
    'comentários iniciais', 'comentários finais', 
    'elogios e conselhos',
]

# ==============================================================================
# Funções
# ==============================================================================

def normalize(s):
    if not s:
        return ""
    return str(s).lower().strip()

def fetch_publishers():
    """Busca todos os publicadores ativos"""
    all_pubs = []
    offset = 0
    
    while True:
        url = f"{SUPABASE_URL}/rest/v1/publishers?select=*&offset={offset}&limit=1000"
        response = requests.get(url, headers=HEADERS)
        data = response.json() if response.status_code == 200 else []
        if not data:
            break
        
        # Extrair dados do campo 'data' aninhado
        for p in data:
            pub_data = p.get('data', {})
            all_pubs.append({
                'id': p.get('id'),
                'name': pub_data.get('name', ''),
                'gender': pub_data.get('gender', ''),
                'condition': pub_data.get('condition', ''),
                'is_serving': pub_data.get('isServing', True),
            })
        
        if len(data) < 1000:
            break
        offset += 1000
    
    return all_pubs

def fetch_parts_without_names_in_periods():
    """Busca partes sem nome nos períodos alvo, excluindo tipos do presidente"""
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
    
    # Filtrar por período e excluir tipos
    filtered = []
    for p in all_parts:
        date = p.get('date', '')
        
        # Filtrar por data
        if TARGET_PERIODS is None:
            # Incluir todas as datas ANTES de CUTOFF_DATE
            if date >= CUTOFF_DATE:
                continue
        else:
            # Incluir apenas períodos específicos
            periodo = date[:7]  # YYYY-MM
            if periodo not in TARGET_PERIODS:
                continue
        
        tipo = normalize(p.get('tipo_parte', ''))
        if any(t in tipo for t in [normalize(x) for x in TIPOS_EXCLUIR]):
            continue
        
        filtered.append(p)
    
    return filtered

def update_part(part_id: str, updates: dict) -> bool:
    url = f"{SUPABASE_URL}/rest/v1/workbook_parts?id=eq.{part_id}"
    response = requests.patch(url, headers=HEADERS, json=updates)
    return response.status_code in [200, 204]

def get_eligible_publishers_for_part(part, publishers):
    """
    Retorna lista de publicadores elegíveis para a parte.
    Regras simplificadas para preenchimento histórico.
    """
    tipo = normalize(part.get('tipo_parte', ''))
    funcao = normalize(part.get('funcao', 'titular'))
    
    eligible = []
    
    for pub in publishers:
        gender = pub.get('gender', '')
        condition = pub.get('condition', '')
        is_serving = pub.get('is_serving', True)
        
        # Regras básicas de elegibilidade
        is_brother = gender == 'brother'
        is_sister = gender == 'sister'
        is_elder = condition == 'Ancião'
        is_ms = condition == 'Servo Ministerial'
        is_baptized = condition in ['Ancião', 'Servo Ministerial', 'Publicador Batizado']
        
        # Presidente, Oração: só irmãos batizados
        if 'presidente' in tipo or 'oração' in tipo:
            if is_brother and is_baptized:
                eligible.append(pub)
            continue
        
        # Dirigente EBC: só anciãos
        if 'dirigente' in tipo:
            if is_elder:
                eligible.append(pub)
            continue
        
        # Leitor EBC: só irmãos batizados
        if 'leitor' in tipo:
            if is_brother and is_baptized:
                eligible.append(pub)
            continue
        
        # Discurso Tesouros, Joias: anciãos ou SM
        if 'discurso' in tipo or 'tesouros' in tipo or 'joias' in tipo:
            if is_elder or is_ms:
                eligible.append(pub)
            continue
        
        # Leitura da Bíblia: só irmãos
        if 'leitura' in tipo:
            if is_brother:
                eligible.append(pub)
            continue
        
        # Partes do ministério (Iniciando, Cultivando, Fazendo): qualquer um
        if 'iniciando' in tipo or 'cultivando' in tipo or 'fazendo' in tipo or 'explicando' in tipo:
            # Ajudante: preferir irmãs
            if funcao == 'ajudante':
                if is_sister or is_brother:
                    eligible.append(pub)
            else:
                # Titular: qualquer um
                eligible.append(pub)
            continue
        
        # Parte Vida Cristã: anciãos ou SM
        if 'vida cristã' in tipo or 'vida crista' in tipo:
            if is_elder or is_ms:
                eligible.append(pub)
            continue
        
        # Default: qualquer um
        eligible.append(pub)
    
    return eligible

def main():
    dry_run = '--dry-run' in sys.argv
    
    print("=" * 70)
    print("PREENCHIMENTO DE GAPS COM ROTAÇÃO DE PUBLICADORES")
    print("=" * 70)
    
    if dry_run:
        print("\n⚠️  MODO DRY-RUN\n")
    
    # 1. Buscar publicadores
    print("\n[1] CARREGANDO PUBLICADORES")
    print("-" * 40)
    
    publishers = fetch_publishers()
    print(f"  {len(publishers)} publicadores carregados")
    
    # 2. Buscar partes sem nome nos períodos alvo
    print("\n[2] BUSCANDO PARTES NOS PERÍODOS ALVO")
    print("-" * 40)
    print(f"  Períodos: {TARGET_PERIODS}")
    
    parts = fetch_parts_without_names_in_periods()
    print(f"  {len(parts)} partes encontradas")
    
    # Agrupar por período
    by_period = defaultdict(list)
    for p in parts:
        periodo = p.get('date', '')[:7]
        by_period[periodo].append(p)
    
    for periodo in sorted(by_period.keys()):
        print(f"    {periodo}: {len(by_period[periodo])} partes")
    
    # 3. Preencher com rotação
    print("\n[3] PREENCHENDO COM ROTAÇÃO")
    print("-" * 40)
    
    # Contador de uso por publicador (para rotação)
    usage_count = defaultdict(int)
    
    stats = {'updated': 0, 'no_eligible': 0, 'errors': 0}
    
    for part in parts:
        tipo = part.get('tipo_parte', '') or ''
        date = part.get('date', '')
        funcao = part.get('funcao', '')
        
        # Buscar elegíveis
        eligible = get_eligible_publishers_for_part(part, publishers)
        
        if not eligible:
            stats['no_eligible'] += 1
            continue
        
        # Escolher o menos usado (rotação)
        eligible_sorted = sorted(eligible, key=lambda p: usage_count[p['id']])
        chosen = eligible_sorted[0]
        
        # Incrementar uso
        usage_count[chosen['id']] += 1
        
        # Atualizar
        if not dry_run:
            updates = {
                'raw_publisher_name': chosen['name'],
                'status': 'CONCLUIDA',
                'updated_at': datetime.now().isoformat()
            }
            
            if update_part(part['id'], updates):
                stats['updated'] += 1
            else:
                stats['errors'] += 1
        else:
            stats['updated'] += 1
            print(f"  📝 {date} | {tipo[:30]:<30} | {funcao:<10} | {chosen['name']}")
    
    # 4. Estatísticas
    print("\n" + "=" * 70)
    print("📈 ESTATÍSTICAS")
    print("=" * 70)
    print(f"  Partes atualizadas:     {stats['updated']}")
    print(f"  Sem elegíveis:          {stats['no_eligible']}")
    print(f"  Erros:                  {stats['errors']}")
    
    print("\n  Uso por publicador (rotação):")
    for pub_id, count in sorted(usage_count.items(), key=lambda x: -x[1])[:15]:
        pub_name = next((p['name'] for p in publishers if p['id'] == pub_id), 'N/A')
        print(f"    {pub_name}: {count} designações")
    
    print("=" * 70)
    
    if dry_run:
        print("\n⚠️  MODO DRY-RUN. Execute sem --dry-run para aplicar.")

if __name__ == "__main__":
    main()
