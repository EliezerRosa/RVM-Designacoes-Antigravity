"""
Extrator de dados de apostilas PDF
Baseado em: CRUD RVM Designações/extract_pdf.py e scripts/generate_table.py
"""
from __future__ import annotations

import re
from io import BytesIO
from pathlib import Path
from typing import Optional

# Tentar importar pypdf
try:
    from pypdf import PdfReader
except ImportError:
    PdfReader = None


# Fragmentos para identificar semanas
WEEK_FRAGMENTS = ['DE NOVEMBR', 'DE DEZEMBR', 'DE JANE', 'DE FEVER', 'DE MARÇO', 'DE ABRIL', 'DE MAIO', 'DE JUNHO', 'DE JULHO', 'DE AGOSTO', 'DE SET', 'DE OUT']

# Padrões regex
ASSIGNMENT_RE = re.compile(r'^(\d+)\. (.+?)\((\d+) min\)')
ASSIGNMENT_HEADER_RE = re.compile(r'^(\d+)\. (.+)$')
TIME_LINE_RE = re.compile(r'^(\d+) min$')


def normalize_source_text(text: str) -> str:
    """Normaliza o texto extraído do PDF"""
    # Substituir caracteres problemáticos
    replacements = {
        '\u00a0': ' ',  # Non-breaking space
        '\u02d9': '',   # Dot above
        'ã á': 'ã',     # Acentos duplicados
        'ã ¡': 'ã',
        'í ': 'í',
        'ó ': 'ó',
        'ú ': 'ú',
        'ê ': 'ê',
        'ô ': 'ô',
    }
    
    for old, new in replacements.items():
        text = text.replace(old, new)
    
    # Corrigir palavras quebradas
    text = re.sub(r'MINIST\s*ÉRIO', 'MINISTÉRIO', text)
    text = re.sub(r'PRO\s*VÉRBIOS', 'PROVÉRBIOS', text)
    text = re.sub(r'orienta\s*ção', 'orientação', text)
    text = re.sub(r'educa\s*ção', 'educação', text)
    text = re.sub(r'Celebra\s*ção', 'Celebração', text)
    
    return text


def should_skip_layout_line(line: str) -> bool:
    """Verifica se a linha deve ser ignorada (layout)"""
    if not line.strip():
        return True
    
    skip_markers = ['/CR', '/CAN', '/SUB', '/ETB', '/EM', '/ETX']
    for marker in skip_markers:
        if line.startswith(marker) and len(line) < 20:
            return True
    
    skip_headers = [
        'TESOUROS DA PALAVRA DE DEUS',
        'FAÇA SEU MELHOR NO MINISTÉRIO',
        'NOSSA VIDA CRISTÃ'
    ]
    
    normalized = line.strip().upper()
    for header in skip_headers:
        if normalized.startswith(header):
            return True
    
    return False


def clean_line(line: str) -> str:
    """Limpa uma linha removendo tokens de layout"""
    # Remover marcadores de layout
    line = re.sub(r'/CR+', '', line)
    line = re.sub(r'/CAN\w*', '', line)
    line = re.sub(r'/SUB\w*', '', line)
    line = re.sub(r'/ETB\w*', '', line)
    line = re.sub(r'/EM\w*', '', line)
    line = re.sub(r'/ETX\w*', '', line)
    
    # Limpar espaços extras
    line = re.sub(r'\s+', ' ', line)
    
    return line.strip()


def parse_week_header(line: str) -> Optional[tuple[str, str]]:
    """
    Extrai data e foco de um cabeçalho de semana
    Retorna (data, foco) ou None
    """
    # Procurar padrão de data
    has_week = False
    for fragment in WEEK_FRAGMENTS:
        if fragment.lower() in line.lower() or fragment in line.upper():
            has_week = True
            break
    
    if not has_week:
        return None
    
    # Tentar separar data e foco
    separators = ['|', '/', '/CAN']
    for sep in separators:
        if sep in line:
            parts = line.split(sep, 1)
            date_part = clean_line(parts[0])
            focus_part = clean_line(parts[1]) if len(parts) > 1 else ""
            return (date_part, focus_part)
    
    return (clean_line(line), "")


def classify_assignment(number: int) -> str:
    """Classifica o tipo de parte baseado no número"""
    if 1 <= number <= 3:
        return "Tesouros da Palavra de Deus"
    elif 4 <= number <= 6:
        return "Faça Seu Melhor no Ministério"
    else:
        return "Nossa Vida Cristã"


def extract_workbook_text(pdf_bytes: bytes) -> str:
    """Extrai texto de um PDF da apostila"""
    if PdfReader is None:
        raise ImportError("pypdf não está instalado. Execute: pip install pypdf")
    
    reader = PdfReader(BytesIO(pdf_bytes))
    
    text_parts = []
    for page in reader.pages:
        page_text = page.extract_text()
        if page_text:
            text_parts.append(page_text)
    
    full_text = "\n".join(text_parts)
    return normalize_source_text(full_text)


def extract_workbook_data(pdf_bytes: bytes, file_name: str) -> list[dict]:
    """
    Extrai dados estruturados de uma apostila PDF
    
    Args:
        pdf_bytes: Conteúdo binário do PDF
        file_name: Nome do arquivo para referência
    
    Returns:
        Lista de dicionários com dados das semanas
    """
    text = extract_workbook_text(pdf_bytes)
    lines = text.split('\n')
    
    weeks = []
    current_week = None
    current_assignment = None
    assignment_descriptions = []
    
    for line in lines:
        # Ignorar linhas de layout
        if should_skip_layout_line(line):
            continue
        
        line = clean_line(line)
        if not line:
            continue
        
        # Verificar se é cabeçalho de semana
        week_header = parse_week_header(line)
        if week_header:
            # Salvar semana anterior se existir
            if current_week:
                if current_assignment:
                    current_assignment["description"] = " ".join(assignment_descriptions)
                    current_week["assignments"].append(current_assignment)
                weeks.append(current_week)
            
            date, focus = week_header
            current_week = {
                "label": date,
                "focus": focus,
                "assignments": []
            }
            current_assignment = None
            assignment_descriptions = []
            continue
        
        if not current_week:
            continue
        
        # Verificar se é cabeçalho de designação
        match = ASSIGNMENT_RE.match(line)
        if match:
            # Salvar designação anterior
            if current_assignment:
                current_assignment["description"] = " ".join(assignment_descriptions)
                current_week["assignments"].append(current_assignment)
            
            number = int(match.group(1))
            title = match.group(2).strip()
            time = int(match.group(3))
            
            current_assignment = {
                "number": number,
                "title": title,
                "time_min": time,
                "section": classify_assignment(number)
            }
            assignment_descriptions = []
            continue
        
        # Verificar cabeçalho sem tempo
        header_match = ASSIGNMENT_HEADER_RE.match(line)
        if header_match:
            if current_assignment:
                current_assignment["description"] = " ".join(assignment_descriptions)
                current_week["assignments"].append(current_assignment)
            
            number = int(header_match.group(1))
            title = header_match.group(2).strip()
            
            current_assignment = {
                "number": number,
                "title": title,
                "time_min": 0,  # Será preenchido depois
                "section": classify_assignment(number)
            }
            assignment_descriptions = []
            continue
        
        # Verificar linha de tempo
        time_match = TIME_LINE_RE.match(line)
        if time_match and current_assignment and current_assignment["time_min"] == 0:
            current_assignment["time_min"] = int(time_match.group(1))
            continue
        
        # Adicionar à descrição
        if current_assignment:
            assignment_descriptions.append(line)
    
    # Salvar última semana
    if current_week:
        if current_assignment:
            current_assignment["description"] = " ".join(assignment_descriptions)
            current_week["assignments"].append(current_assignment)
        weeks.append(current_week)
    
    return weeks
