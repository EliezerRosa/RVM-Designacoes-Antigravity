#!/usr/bin/env python3
"""
Script para preencher nomes de participantes nas partes da Apostila.

LÓGICA:
1. Busca no BD todas as partes SEM raw_publisher_name preenchido
2. Para cada parte sem nome, identifica a semana (date)
3. Encontra qual PDF corresponde àquela semana
4. Extrai do PDF o nome para aquela parte específica
5. Atualiza o BD com o nome encontrado

Uso:
    python scripts/import_legacy_designations.py [--dry-run]
"""

import fitz  # PyMuPDF
import re
import requests
from datetime import datetime
from pathlib import Path
from difflib import SequenceMatcher
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

PAUTAS_FOLDER = r"c:\Antigravity - RVM Designações\ANTIGRAVITY Designações Antigas"

# Mapeamento de meses
MONTHS = {
    'JANEIRO': '01', 'FEVEREIRO': '02', 'MARÇO': '03', 'MARCO': '03',
    'ABRIL': '04', 'MAIO': '05', 'JUNHO': '06', 'JULHO': '07',
    'AGOSTO': '08', 'SETEMBRO': '09', 'OUTUBRO': '10',
    'NOVEMBRO': '11', 'DEZEMBRO': '12'
}

# Lista de PDFs disponíveis
PDF_FILES = [
    # 2024 - Antigos
    "Janiero 2024_Vida e Ministério (S-140_T).pdf",
    "VIDA E MINISTÉRIO_JANEIRO S-140_Tc 2.pdf",
    "Fevereiro 2024_Vida e Ministério-1.pdf",
    "Vida e Ministério Jumho a Julho 2024.pdf",
    "Agosto 2024_Vida e Ministério.pdf",
    # 2024 - Nov/Dez
    "1. Novembro_Dezembro 2024_Vida e Ministério.pdf",
    "2. Dezembro-Janeiro 2025_Vida e Ministério.pdf",
    # 2025
    "3. fevereiro2025 mwb_T_202501.pdf",
    "4. Març-Abril 2025 mwb_T_202501.pdf",
    "5. Abril-Maio 2025 mwb_T_202501.pdf",
    "6. Junho-Julho 2025 mwb_T_202501.pdf",
    "7. Agosto-Setembro de 2025 mwb_T_202509.pdf",
    "8. Outubro-Novembro de 2025 mwb_T_202509.pdf",
]

# ==============================================================================
# Funções de API Supabase
# ==============================================================================

def fetch_parts_without_names():
    """Busca todas as partes SEM raw_publisher_name preenchido"""
    all_parts = []
    offset = 0
    limit = 1000
    
    print("[Supabase] Buscando partes sem nome...")
    
    while True:
        url = f"{SUPABASE_URL}/rest/v1/workbook_parts?select=*&or=(raw_publisher_name.is.null,raw_publisher_name.eq.)&offset={offset}&limit={limit}"
        response = requests.get(url, headers=HEADERS)
        
        if response.status_code != 200:
            print(f"[ERRO] Status: {response.status_code}")
            break
        
        data = response.json()
        if not data:
            break
            
        all_parts.extend(data)
        
        if len(data) < limit:
            break
        offset += limit
    
    print(f"[Supabase] {len(all_parts)} partes sem nome encontradas")
    return all_parts

def fetch_publishers():
    """Busca todos os publicadores"""
    url = f"{SUPABASE_URL}/rest/v1/publishers?select=id,name"
    response = requests.get(url, headers=HEADERS)
    return response.json() if response.status_code == 200 else []

def update_part(part_id: str, updates: dict) -> bool:
    """Atualiza uma parte no Supabase"""
    url = f"{SUPABASE_URL}/rest/v1/workbook_parts?id=eq.{part_id}"
    response = requests.patch(url, headers=HEADERS, json=updates)
    return response.status_code in [200, 204]

# ==============================================================================
# Extração de PDFs - indexado por data
# ==============================================================================

def extract_week_date(text, default_year=2024):
    """Extrai data da semana do cabeçalho"""
    year = default_year
    year_match = re.search(r'—\s*(20\d{2})', text)
    if year_match:
        year = int(year_match.group(1))
    
    match = re.search(r'SEMANA\s+(\d{1,2})\s*[-–]\s*\d{1,2}\s*(?:DE\s+)?([A-ZÇÃÉÍÓÚÂÊÎÔÛ]+)', text, re.IGNORECASE)
    if match:
        day = int(match.group(1))
        month_name = match.group(2).upper()
        month = MONTHS.get(month_name)
        if month:
            return f"{year}-{month}-{day:02d}"
    return None

def extract_all_pdfs_by_date() -> dict:
    """
    Extrai TODOS os PDFs e retorna dicionário:
    {date: {(tipo_parte_normalizado, funcao): nome}}
    """
    all_data = {}
    
    for pdf_name in PDF_FILES:
        pdf_path = Path(PAUTAS_FOLDER) / pdf_name
        if not pdf_path.exists():
            continue
        
        print(f"  📄 {pdf_name}")
        
        default_year = 2025 if '2025' in pdf_name else 2024
        
        doc = fitz.open(str(pdf_path))
        
        for page_num in range(len(doc)):
            page = doc[page_num]
            text = page.get_text()
            
            week_date = extract_week_date(text, default_year)
            if not week_date:
                continue
            
            if week_date not in all_data:
                all_data[week_date] = {}
            
            lines = text.split('\n')
            
            # Extrair participações
            i = 0
            while i < len(lines):
                line = lines[i].strip()
                
                # Presidente
                if line.startswith('Presidente:') or line == 'Presidente:':
                    if i + 1 < len(lines):
                        name = lines[i + 1].strip()
                        if name and not name.startswith('19:') and not name.startswith('20:') and len(name) > 2:
                            all_data[week_date][('presidente', 'titular')] = name
                            all_data[week_date][('presidente da reunião', 'titular')] = name
                
                # Oração (primeira = inicial, última perto de Comentários = final)
                if 'Oração:' in line:
                    if i + 1 < len(lines):
                        name = lines[i + 1].strip()
                        if name and not name.startswith('19:') and not name.startswith('20:') and not name.startswith('21:') and len(name) > 2:
                            # Verificar se é final (perto de Comentários finais)
                            is_final = any('Comentários finais' in lines[j] for j in range(max(0, i-5), i))
                            if is_final:
                                all_data[week_date][('oração final', 'titular')] = name
                            elif ('oração inicial', 'titular') not in all_data[week_date]:
                                all_data[week_date][('oração inicial', 'titular')] = name
                
                # Partes numeradas
                part_match = re.match(r'^(\d+)\.\s*(.+?)(?:\s*\((\d+)\s*min\))?$', line)
                if part_match:
                    part_num = part_match.group(1)
                    part_title = part_match.group(2).strip()
                    part_title = re.sub(r'["""]', '', part_title)
                    
                    if i + 1 < len(lines):
                        next_line = lines[i + 1].strip()
                        
                        if next_line and not re.match(r'^[\d:]+$', next_line) and not next_line.startswith('Estudante'):
                            if next_line in ['Dirigente:', 'Leitor:', 'Dirigente', 'Leitor']:
                                i += 1
                                continue
                            
                            titular = next_line
                            ajudante = None
                            
                            if i + 2 < len(lines):
                                ajudante_line = lines[i + 2].strip()
                                if ajudante_line and not re.match(r'^[\d:]+$', ajudante_line) and not re.match(r'^\d+\.', ajudante_line):
                                    if ajudante_line not in ['Estudante', 'Ajudante', 'Cântico', 'Dirigente:', 'Leitor:']:
                                        ajudante = ajudante_line
                            
                            # Armazenar por número e por título
                            all_data[week_date][(f"{part_num}.", 'titular')] = titular
                            all_data[week_date][(part_title.lower(), 'titular')] = titular
                            
                            # Mapeamento específico por número
                            if part_num == '1':
                                all_data[week_date][('tesouros da palavra de deus', 'titular')] = titular
                                all_data[week_date][('discurso', 'titular')] = titular
                            elif part_num == '2':
                                all_data[week_date][('joias espirituais', 'titular')] = titular
                            elif part_num == '3':
                                all_data[week_date][('leitura da bíblia', 'titular')] = titular
                            elif part_num in ['4', '5', '6']:
                                # Partes do Ministério (Iniciando, Cultivando, etc)
                                all_data[week_date][(f"iniciando conversas{'' if part_num == '4' else ' '+part_num}", 'titular')] = titular
                                all_data[week_date][(f"cultivando o interesse{'' if part_num == '5' else ' '+part_num}", 'titular')] = titular
                            elif part_num == '7':
                                all_data[week_date][('elogios e conselhos', 'titular')] = titular
                                all_data[week_date][('discurso de estudante', 'titular')] = titular
                            
                            if ajudante:
                                all_data[week_date][(f"{part_num}.", 'ajudante')] = ajudante
                                all_data[week_date][(part_title.lower(), 'ajudante')] = ajudante
                
                # Leitura da Bíblia com Estudante:
                if 'Leitura da Bíblia' in line or 'Leitura da biblia' in line.lower():
                    for j in range(i, min(i + 5, len(lines))):
                        if 'Estudante:' in lines[j] or lines[j].strip() == 'Estudante:':
                            if j + 1 < len(lines):
                                name = lines[j + 1].strip()
                                if name and name != 'Estudante' and name != 'Ajudante' and len(name) > 2:
                                    all_data[week_date][('leitura da bíblia', 'titular')] = name
                                    all_data[week_date][('3.', 'titular')] = name
                            break
                
                i += 1
            
            # Extrair EBC usando coordenadas
            all_lines_coords = []
            blocks = page.get_text("dict")["blocks"]
            for block in blocks:
                if "lines" in block:
                    for ln in block["lines"]:
                        text_line = "".join([span["text"] for span in ln["spans"]]).strip()
                        if text_line:
                            bbox = ln["bbox"]
                            all_lines_coords.append({
                                'x': bbox[0],
                                'y': bbox[1],
                                'text': text_line
                            })
            
            all_lines_coords.sort(key=lambda l: (l['y'], l['x']))
            
            dirigente_pos = None
            leitor_pos = None
            
            for lc in all_lines_coords:
                if 'Dirigente:' in lc['text'] or lc['text'] == 'Dirigente:':
                    dirigente_pos = {'x': lc['x'], 'y': lc['y']}
                if 'Leitor:' in lc['text'] or lc['text'] == 'Leitor:':
                    leitor_pos = {'x': lc['x'], 'y': lc['y']}
            
            if dirigente_pos:
                for lc in all_lines_coords:
                    dx = abs(lc['x'] - dirigente_pos['x'])
                    dy = dirigente_pos['y'] - lc['y']
                    if 0 < dy < 15 and dx < 80:
                        candidate = lc['text']
                        if candidate and 'Leitor' not in candidate and 'Dirigente' not in candidate and '(' not in candidate and ':' not in candidate and len(candidate) > 2:
                            all_data[week_date][('dirigente ebc', 'titular')] = candidate
                            all_data[week_date][('estudo bíblico de congregação', 'dirigente')] = candidate
                            break
            
            if leitor_pos:
                for lc in all_lines_coords:
                    dx = abs(lc['x'] - leitor_pos['x'])
                    dy = leitor_pos['y'] - lc['y']
                    if 0 < dy < 15 and dx < 80:
                        candidate = lc['text']
                        if candidate and 'Dirigente' not in candidate and 'Leitor' not in candidate and '(' not in candidate and ':' not in candidate and len(candidate) > 2:
                            all_data[week_date][('leitor ebc', 'titular')] = candidate
                            all_data[week_date][('estudo bíblico de congregação', 'leitor')] = candidate
                            break
        
        doc.close()
    
    return all_data

def normalize(text: str) -> str:
    """Normaliza texto para match"""
    if not text:
        return ""
    return text.lower().strip().replace('ã', 'a').replace('ç', 'c').replace('é', 'e').replace('í', 'i').replace('ó', 'o').replace('ú', 'u')

def find_name_for_part(part: dict, pdf_data: dict) -> str | None:
    """Tenta encontrar nome no PDF para a parte do BD"""
    date = part.get('date', '')
    
    if date not in pdf_data:
        return None
    
    week_data = pdf_data[date]
    
    # Campos do BD
    titulo = normalize(part.get('titulo_parte', '') or '')
    tipo = normalize(part.get('tipo_parte', '') or '')
    funcao = normalize(part.get('funcao', '') or 'titular')
    
    # Tentar match direto
    for key, name in week_data.items():
        key_titulo, key_funcao = key
        
        # Match por funcao
        if normalize(key_funcao) != funcao:
            continue
        
        # Match por título
        if key_titulo in titulo or titulo in key_titulo:
            return name
        if key_titulo in tipo or tipo in key_titulo:
            return name
    
    return None

def match_publisher_name(pdf_name: str, publishers: list) -> dict:
    """Match fuzzy do nome com cadastro"""
    best_match = None
    best_ratio = 0
    
    pdf_name_lower = pdf_name.lower().strip()
    
    for pub in publishers:
        pub_name = pub.get('name', '')
        ratio = SequenceMatcher(None, pdf_name_lower, pub_name.lower()).ratio()
        if ratio > best_ratio:
            best_ratio = ratio
            best_match = pub
    
    status = 'HIGH' if best_ratio >= 0.85 else ('MEDIUM' if best_ratio >= 0.6 else 'LOW')
    
    return {
        'pdf_name': pdf_name,
        'matched_publisher': best_match.get('name') if best_match else None,
        'confidence': round(best_ratio * 100),
        'status': status
    }

# ==============================================================================
# Main
# ==============================================================================

def main():
    dry_run = '--dry-run' in sys.argv
    
    print("=" * 70)
    print("PREENCHIMENTO DE NOMES NAS PARTES DA APOSTILA")
    print("=" * 70)
    
    if dry_run:
        print("\n⚠️  MODO DRY-RUN: Nenhuma alteração será salva\n")
    
    # 1. Extrair TODOS os PDFs primeiro
    print("\n[1] EXTRAÇÃO DOS PDFs")
    print("-" * 40)
    pdf_data = extract_all_pdfs_by_date()
    print(f"\n📅 {len(pdf_data)} semanas extraídas dos PDFs")
    
    # 2. Buscar partes sem nome no BD
    print("\n[2] BUSCA NO BANCO DE DADOS")
    print("-" * 40)
    parts_without_names = fetch_parts_without_names()
    
    if not parts_without_names:
        print("\n✅ Todas as partes já têm nome preenchido!")
        return
    
    publishers = fetch_publishers()
    print(f"[Supabase] {len(publishers)} publicadores carregados")
    
    # 3. Processar cada parte sem nome
    print("\n[3] PROCESSAMENTO")
    print("-" * 40)
    
    stats = {
        'total': len(parts_without_names),
        'updated': 0,
        'no_pdf_date': 0,
        'not_found': 0,
        'errors': 0
    }
    
    name_matches = []
    
    for part in parts_without_names:
        date = part.get('date', '')
        titulo = part.get('titulo_parte', '') or part.get('tipo_parte', '') or ''
        funcao = part.get('funcao', '') or 'Titular'
        
        if date not in pdf_data:
            stats['no_pdf_date'] += 1
            continue
        
        # Tentar encontrar nome
        pdf_name = find_name_for_part(part, pdf_data)
        
        if not pdf_name:
            stats['not_found'] += 1
            continue
        
        # Match com cadastro
        name_match = match_publisher_name(pdf_name, publishers)
        name_matches.append(name_match)
        
        # Atualizar
        if not dry_run:
            updates = {
                'raw_publisher_name': pdf_name,
                'status': 'CONCLUIDA',
                'updated_at': datetime.now().isoformat()
            }
            
            if update_part(part['id'], updates):
                stats['updated'] += 1
            else:
                stats['errors'] += 1
        else:
            stats['updated'] += 1
            status_emoji = '✅' if name_match['status'] == 'HIGH' else ('🔶' if name_match['status'] == 'MEDIUM' else '❌')
            print(f"  📝 {date} | {titulo[:30]:<30} | {funcao:<10} | {pdf_name} {status_emoji}")
    
    # 4. Relatório
    print("\n" + "=" * 70)
    print("CORRESPONDÊNCIA DE NOMES COM CADASTRO")
    print("=" * 70)
    
    unique_matches = {}
    for m in name_matches:
        if m['pdf_name'] not in unique_matches:
            unique_matches[m['pdf_name']] = m
    
    sorted_matches = sorted(unique_matches.values(), key=lambda x: -x['confidence'])
    
    print(f"\n{'Nome no PDF':<25} | {'Match Cadastro':<25} | Conf. | Status")
    print("-" * 75)
    
    for m in sorted_matches[:30]:  # Mostrar apenas top 30
        status_emoji = '✅' if m['status'] == 'HIGH' else ('🔶' if m['status'] == 'MEDIUM' else '❌')
        matched = m['matched_publisher'] or '(não encontrado)'
        print(f"{m['pdf_name'][:25]:<25} | {matched[:25]:<25} | {m['confidence']:>3}% | {status_emoji}")
    
    if len(sorted_matches) > 30:
        print(f"  ... e mais {len(sorted_matches) - 30} nomes")
    
    high_count = sum(1 for m in sorted_matches if m['status'] == 'HIGH')
    medium_count = sum(1 for m in sorted_matches if m['status'] == 'MEDIUM')
    low_count = sum(1 for m in sorted_matches if m['status'] == 'LOW')
    
    # 5. Estatísticas
    print("\n" + "=" * 70)
    print("📈 ESTATÍSTICAS")
    print("=" * 70)
    print(f"  Partes sem nome no BD:      {stats['total']}")
    print(f"  Partes atualizadas:         {stats['updated']}")
    print(f"  Sem data no PDF:            {stats['no_pdf_date']}")
    print(f"  Nome não encontrado:        {stats['not_found']}")
    print(f"  Erros:                      {stats['errors']}")
    print()
    print(f"  Correspondência com cadastro:")
    print(f"    ✅ HIGH (>=85%):          {high_count}")
    print(f"    🔶 MEDIUM (60-84%):       {medium_count}")
    print(f"    ❌ LOW (<60%):            {low_count}")
    print("=" * 70)
    
    if dry_run:
        print("\n⚠️  MODO DRY-RUN ativo.")
        print("    Execute sem --dry-run para aplicar as alterações.")

if __name__ == "__main__":
    main()
