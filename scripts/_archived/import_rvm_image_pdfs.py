import os
#!/usr/bin/env python3
"""
Script para importar designações de PDFs tipo IMAGEM (RVM gerados).
Usa EasyOCR para extrair texto das imagens.

Uso:
    python scripts/import_rvm_image_pdfs.py [--dry-run]
"""

import fitz
import easyocr
import numpy as np
from PIL import Image
import io
import re
import requests
from datetime import datetime
import sys

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

PAUTAS_FOLDER = r"c:\Antigravity - RVM Designações\ANTIGRAVITY Designações Antigas"

# PDFs RVM (imagem) a processar
RVM_PDF_FILES = [
    "RVM - 2025-12-15 (15 de Dez 2025).pdf",
    "RVM - 2025-12-22 (22 de Dez 2025).pdf",
    "RVM - 2025-12-29 (29 de Dez 2025).pdf",
    "RVM - 2026-01-05 (05 de Jan 2026).pdf",
    "RVM - 2026-01-12 (12 de Jan 2026).pdf",
]

# ==============================================================================
# Funções de API Supabase
# ==============================================================================

def fetch_parts_without_names():
    """Busca partes sem nome"""
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
    """Atualiza uma parte no Supabase"""
    url = f"{SUPABASE_URL}/rest/v1/workbook_parts?id=eq.{part_id}"
    response = requests.patch(url, headers=HEADERS, json=updates)
    return response.status_code in [200, 204]

# ==============================================================================
# Extração OCR
# ==============================================================================

def extract_date_from_filename(filename: str) -> str:
    """Extrai data do nome do arquivo RVM"""
    # RVM - 2025-12-15 (15 de Dez 2025).pdf
    match = re.search(r'(\d{4}-\d{2}-\d{2})', filename)
    if match:
        return match.group(1)
    return None

def extract_participations_from_ocr(ocr_results: list, date: str) -> dict:
    """
    Parseia resultados do OCR e extrai participações.
    Retorna: {(tipo_parte_normalizado, funcao): nome}
    """
    participations = {}
    
    # Juntar todo o texto
    lines = [text for (bbox, text, conf) in ocr_results]
    
    i = 0
    while i < len(lines):
        line = lines[i].strip()
        line_lower = line.lower()
        
        # Presidente
        if 'presidente' in line_lower and i + 1 < len(lines):
            # Próxima linha pode ser o nome
            next_line = lines[i + 1].strip()
            if next_line and not any(x in next_line.lower() for x in ['oração', 'comentário', 'tesouro', 'min']):
                participations[('presidente', 'titular')] = next_line
        
        # Oração Inicial
        if 'oração inicial' in line_lower and i + 1 < len(lines):
            next_line = lines[i + 1].strip()
            if next_line and len(next_line) > 2:
                participations[('oração inicial', 'titular')] = next_line
        
        # Oração Final
        if 'oração final' in line_lower and i + 1 < len(lines):
            next_line = lines[i + 1].strip()
            if next_line and len(next_line) > 2:
                participations[('oração final', 'titular')] = next_line
        
        # Discurso Tesouros (parte 1 ou "profetizada", "luz")
        if ('tesouro' in line_lower or 'profetizada' in line_lower or 'luz' in line_lower) and i + 1 < len(lines):
            next_line = lines[i + 1].strip()
            if next_line and len(next_line) > 2 and 'min' not in next_line.lower():
                participations[('discurso tesouros', 'titular')] = next_line
                participations[('discurso', 'titular')] = next_line
        
        # Joias espirituais
        if 'joias' in line_lower and i + 1 < len(lines):
            next_line = lines[i + 1].strip()
            if next_line and len(next_line) > 2 and 'min' not in next_line.lower():
                participations[('joias espirituais', 'titular')] = next_line
        
        # Leitura da Bíblia
        if 'leitura da bíblia' in line_lower or 'leitura da biblia' in line_lower:
            if i + 1 < len(lines):
                next_line = lines[i + 1].strip()
                if next_line and len(next_line) > 2 and 'min' not in next_line.lower():
                    participations[('leitura da bíblia', 'titular')] = next_line
        
        # Iniciando conversas
        if 'iniciando' in line_lower and i + 1 < len(lines):
            next_line = lines[i + 1].strip()
            if next_line and len(next_line) > 2 and 'min' not in next_line.lower():
                # Pode ter formato "Nome / Nome"
                if '/' in next_line:
                    parts = next_line.split('/')
                    participations[('iniciando conversas', 'titular')] = parts[0].strip()
                    if len(parts) > 1:
                        participations[('iniciando conversas', 'ajudante')] = parts[1].strip()
                else:
                    participations[('iniciando conversas', 'titular')] = next_line
        
        # Cultivando o interesse
        if 'cultivando' in line_lower and i + 1 < len(lines):
            next_line = lines[i + 1].strip()
            if next_line and len(next_line) > 2 and 'min' not in next_line.lower():
                if '/' in next_line:
                    parts = next_line.split('/')
                    participations[('cultivando o interesse', 'titular')] = parts[0].strip()
                    if len(parts) > 1:
                        participations[('cultivando o interesse', 'ajudante')] = parts[1].strip()
                else:
                    participations[('cultivando o interesse', 'titular')] = next_line
        
        # Explicando suas crenças
        if 'explicando' in line_lower and i + 1 < len(lines):
            next_line = lines[i + 1].strip()
            if next_line and len(next_line) > 2 and 'min' not in next_line.lower():
                if '/' in next_line:
                    parts = next_line.split('/')
                    participations[('explicando suas crenças', 'titular')] = parts[0].strip()
                    if len(parts) > 1:
                        participations[('explicando suas crenças', 'ajudante')] = parts[1].strip()
                else:
                    participations[('explicando suas crenças', 'titular')] = next_line
        
        # Estudo bíblico de congregação
        if 'estudo bíblico' in line_lower or 'estudo biblico' in line_lower:
            if i + 1 < len(lines):
                next_line = lines[i + 1].strip()
                if next_line and len(next_line) > 2 and 'min' not in next_line.lower():
                    if '/' in next_line:
                        parts = next_line.split('/')
                        participations[('dirigente ebc', 'titular')] = parts[0].strip()
                        if len(parts) > 1:
                            participations[('leitor ebc', 'titular')] = parts[1].strip()
                    else:
                        participations[('dirigente ebc', 'titular')] = next_line
        
        i += 1
    
    return participations

def normalize(text: str) -> str:
    if not text:
        return ""
    return text.lower().strip().replace('ã', 'a').replace('ç', 'c').replace('é', 'e').replace('í', 'i').replace('ó', 'o').replace('ú', 'u')

def find_name_for_part(part: dict, pdf_data: dict) -> str | None:
    """Tenta encontrar nome no PDF para a parte do BD"""
    date = part.get('date', '')
    
    if date not in pdf_data:
        return None
    
    week_data = pdf_data[date]
    
    titulo = normalize(part.get('titulo_parte', '') or '')
    tipo = normalize(part.get('tipo_parte', '') or '')
    funcao = normalize(part.get('funcao', '') or 'titular')
    
    for key, name in week_data.items():
        key_titulo, key_funcao = key
        
        if normalize(key_funcao) != funcao:
            continue
        
        if key_titulo in titulo or titulo in key_titulo:
            return name
        if key_titulo in tipo or tipo in key_titulo:
            return name
    
    return None

# ==============================================================================
# Main
# ==============================================================================

def main():
    from pathlib import Path
    
    dry_run = '--dry-run' in sys.argv
    
    print("=" * 70)
    print("IMPORTAÇÃO DE PDFs RVM (IMAGEM) COM OCR")
    print("=" * 70)
    
    if dry_run:
        print("\n⚠️  MODO DRY-RUN\n")
    
    # 1. Inicializar OCR
    print("\n[1] INICIALIZANDO OCR...")
    reader = easyocr.Reader(['pt'], gpu=False, verbose=False)
    print("    EasyOCR pronto!")
    
    # 2. Processar cada PDF
    print("\n[2] EXTRAÇÃO DOS PDFs COM OCR")
    print("-" * 40)
    
    all_data = {}
    
    for pdf_name in RVM_PDF_FILES:
        pdf_path = Path(PAUTAS_FOLDER) / pdf_name
        if not pdf_path.exists():
            print(f"  ⚠️ Não encontrado: {pdf_name}")
            continue
        
        print(f"  📄 {pdf_name}")
        
        # Extrair data do nome do arquivo
        date = extract_date_from_filename(pdf_name)
        if not date:
            print(f"     ⚠️ Data não encontrada no nome")
            continue
        
        print(f"     Data: {date}")
        
        # Abrir PDF e extrair imagem
        doc = fitz.open(str(pdf_path))
        page = doc[0]
        
        zoom = 2
        mat = fitz.Matrix(zoom, zoom)
        pix = page.get_pixmap(matrix=mat)
        
        img = Image.open(io.BytesIO(pix.tobytes()))
        img_np = np.array(img)
        
        # OCR
        results = reader.readtext(img_np)
        
        # Parsear resultados
        participations = extract_participations_from_ocr(results, date)
        all_data[date] = participations
        
        print(f"     Extraídos: {len(participations)} participações")
        
        doc.close()
    
    print(f"\n📅 {len(all_data)} semanas processadas")
    
    # 3. Buscar partes sem nome
    print("\n[3] BUSCA NO BANCO DE DADOS")
    print("-" * 40)
    
    parts_without_names = fetch_parts_without_names()
    print(f"[Supabase] {len(parts_without_names)} partes sem nome")
    
    # 4. Atualizar
    print("\n[4] ATUALIZANDO")
    print("-" * 40)
    
    stats = {'updated': 0, 'not_found': 0, 'no_pdf_date': 0, 'errors': 0}
    
    for part in parts_without_names:
        date = part.get('date', '')
        if date not in all_data:
            stats['no_pdf_date'] += 1
            continue
        
        pdf_name = find_name_for_part(part, all_data)
        
        if not pdf_name:
            stats['not_found'] += 1
            continue
        
        titulo = part.get('titulo_parte', '') or part.get('tipo_parte', '')
        
        if not dry_run:
            updates = {
                'raw_publisher_name': pdf_name,
                'status': 'CONCLUIDA',
                'updated_at': datetime.now().isoformat()
            }
            
            if update_part(part['id'], updates):
                stats['updated'] += 1
                print(f"  ✅ {date} | {titulo[:30]:<30} | {pdf_name}")
            else:
                stats['errors'] += 1
        else:
            stats['updated'] += 1
            print(f"  📝 {date} | {titulo[:30]:<30} | {pdf_name}")
    
    # 5. Estatísticas
    print("\n" + "=" * 70)
    print("📈 ESTATÍSTICAS")
    print("=" * 70)
    print(f"  Partes atualizadas:     {stats['updated']}")
    print(f"  Sem data no PDF:        {stats['no_pdf_date']}")
    print(f"  Nome não encontrado:    {stats['not_found']}")
    print(f"  Erros:                  {stats['errors']}")
    print("=" * 70)
    
    if dry_run:
        print("\n⚠️  MODO DRY-RUN. Execute sem --dry-run para aplicar.")

if __name__ == "__main__":
    main()
