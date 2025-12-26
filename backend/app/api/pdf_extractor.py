"""
Endpoint para extração de partes da Apostila (Workbook) de PDFs.
Reutiliza a lógica do script extract_detailed_parts.py.
"""
import re
import uuid
from typing import Optional
from datetime import datetime
from fastapi import APIRouter, UploadFile, File, HTTPException
from pydantic import BaseModel
import fitz  # PyMuPDF

router = APIRouter()

# =============================================================================
# Constantes e Mapeamentos (do extract_detailed_parts.py)
# =============================================================================

MESES = {
    'janeiro': 1, 'fevereiro': 2, 'março': 3, 'marco': 3, 'abril': 4,
    'maio': 5, 'junho': 6, 'julho': 7, 'agosto': 8,
    'setembro': 9, 'outubro': 10, 'novembro': 11, 'dezembro': 12 
}

SECOES = {
    'INICIO': 'Início da Reunião',
    'TESOUROS': 'Tesouros da Palavra de Deus',
    'MINISTERIO': 'Faça Seu Melhor no Ministério',
    'VIDA': 'Nossa Vida Cristã',
    'FINAL': 'Final da Reunião',
}

# Cores hexadecimais das seções no PDF
COLOR_TO_SECTION = {
    0x5A3C25: 'TESOUROS',  # Marrom
    0xC18626: 'MINISTERIO',  # Amarelo/dourado
    0x6D1719: 'VIDA',  # Vermelho escuro
}

TIPO_TO_MODALIDADE = {
    'Presidente': 'Presidência',
    'Cântico': 'Cântico',
    'Oração Final': 'Oração',
    'Discurso Tesouros': 'Discurso de Ensino',
    'Joias Espirituais': 'Discurso de Ensino',
    'Leitura da Bíblia': 'Leitura de Estudante',
    'Iniciando Conversas': 'Demonstração',
    'Cultivando o Interesse': 'Demonstração',
    'Fazendo Discípulos': 'Demonstração',
    'Explicando Suas Crenças': 'Demonstração',
    'Discurso de Estudante': 'Discurso de Estudante',
    'Dirigente EBC': 'Dirigente de EBC',
    'Leitor EBC': 'Leitor de EBC',
    'Necessidades Locais': 'Discurso de Ensino',
    'Parte Vida Cristã': 'Discurso de Ensino',
    'Elogios e Conselhos': 'Aconselhamento',
}

# =============================================================================
# Schemas
# =============================================================================

class ExtractedPart(BaseModel):
    id: str
    weekId: str
    weekDisplay: str
    date: str
    section: str
    tipoParte: str
    modalidade: str
    tituloParte: str
    descricaoParte: str
    detalhesParte: str
    seq: int
    funcao: str
    duracao: str
    horaInicio: str
    horaFim: str
    rawPublisherName: str
    status: str

class ExtractionResult(BaseModel):
    success: bool
    totalParts: int
    totalWeeks: int
    year: int
    records: list[ExtractedPart]
    error: Optional[str] = None

# =============================================================================
# Funções de Extração (adaptadas do extract_detailed_parts.py)
# =============================================================================

def get_section_from_color(color: int) -> Optional[str]:
    """Determina seção pela cor do texto."""
    if color is None:
        return None
    if color in COLOR_TO_SECTION:
        return COLOR_TO_SECTION[color]
    # Tolerância de ±5 em cada componente RGB
    r = (color >> 16) & 0xFF
    g = (color >> 8) & 0xFF
    b = color & 0xFF
    for known_color, section in COLOR_TO_SECTION.items():
        kr = (known_color >> 16) & 0xFF
        kg = (known_color >> 8) & 0xFF
        kb = known_color & 0xFF
        if abs(r - kr) <= 5 and abs(g - kg) <= 5 and abs(b - kb) <= 5:
            return section
    return None

def derivar_modalidade(tipo_parte: str) -> str:
    """Deriva modalidade de execução a partir do tipoParte."""
    return TIPO_TO_MODALIDADE.get(tipo_parte, 'Demonstração')

def extract_workbook_from_pdf(pdf_bytes: bytes) -> ExtractionResult:
    """
    Extrai todas as partes da apostila de um PDF.
    Retorna lista de registros prontos para upsert.
    """
    try:
        doc = fitz.open(stream=pdf_bytes, filetype="pdf")
        
        # Extrair ano da primeira página
        first_page_text = doc[0].get_text()
        year_match = re.search(r'\b(20\d{2})\b', first_page_text)
        year = int(year_match.group(1)) if year_match else datetime.now().year
        
        all_weeks = {}
        
        # Padrões
        week_pattern1 = re.compile(r'(\d{1,2})\s*[-–]\s*(\d{1,2})\s*(?:DE\s+)?([A-ZÇÃÉÍÓÚÂÊÎÔÛ]+)', re.IGNORECASE)
        week_pattern2 = re.compile(r'(\d{1,2})\s*(?:DE\s+)?([A-ZÇÃÉÍÓÚÂÊÎÔÛ]+)\s*[-–]\s*(\d{1,2})[°º.u]*\s*(?:DE\s+)?([A-ZÇÃÉÍÓÚÂÊÎÔÛ]+)', re.IGNORECASE)
        part_pattern = re.compile(r'^(\d+)\.\s*(.+)$')
        time_pattern = re.compile(r'\((\d+)\s*min\)')
        
        current_week_id = None
        
        for page_num in range(len(doc)):
            page = doc[page_num]
            page_text = page.get_text()
            
            # Detectar início de semana
            for match in week_pattern2.finditer(page_text):
                day1 = int(match.group(1))
                month1_name = match.group(2).lower()
                day2 = int(match.group(3))
                month2_name = match.group(4).lower()
                
                month1 = MESES.get(month1_name, MESES.get(month1_name.replace('ç', 'c'), 1))
                
                week_id = f"{year}-{month1:02d}-{day1:02d}"
                if week_id not in all_weeks:
                    current_week_id = week_id
                    all_weeks[week_id] = {
                        'weekId': week_id,
                        'display': f"{day1}-{day2} de {month1_name.title()}",
                        'parts': {},
                    }
            
            for match in week_pattern1.finditer(page_text):
                if current_week_id:
                    continue
                day1 = int(match.group(1))
                day2 = int(match.group(2))
                month_name = match.group(3).lower()
                month = MESES.get(month_name, MESES.get(month_name.replace('ç', 'c'), 1))
                
                week_id = f"{year}-{month:02d}-{day1:02d}"
                if week_id not in all_weeks:
                    current_week_id = week_id
                    all_weeks[week_id] = {
                        'weekId': week_id,
                        'display': f"{day1}-{day2} de {month_name.title()}",
                        'parts': {},
                    }
            
            if not current_week_id:
                continue
            
            week = all_weeks[current_week_id]
            
            # Extrair partes
            page_dict = page.get_text('dict')
            all_lines = []
            for block in page_dict.get('blocks', []):
                if 'lines' not in block:
                    continue
                for line in block['lines']:
                    line_text = ''
                    line_color = None
                    line_y = line['bbox'][1]
                    for span in line['spans']:
                        line_text += span['text']
                        if span.get('color') and span['color'] != 0:
                            line_color = span['color']
                    line_text = line_text.strip()
                    if line_text:
                        all_lines.append({'text': line_text, 'color': line_color, 'y': line_y})
            
            all_lines.sort(key=lambda x: x['y'])
            
            i = 0
            while i < len(all_lines):
                line_data = all_lines[i]
                line_text = line_data['text']
                line_color = line_data['color']
                
                part_match = part_pattern.match(line_text)
                if part_match:
                    num = int(part_match.group(1))
                    tema_raw = part_match.group(2)
                    
                    section = get_section_from_color(line_color) or 'INICIO'
                    
                    time_match = time_pattern.search(tema_raw)
                    duracao = time_match.group(1) if time_match else ''
                    
                    if time_match:
                        tema = tema_raw[:time_match.start()].strip()
                        desc_same_line = tema_raw[time_match.end():].strip()
                        desc_same_line = re.sub(r'^[:\s\u2014\u2013-]+', '', desc_same_line).strip()
                    else:
                        tema = tema_raw.strip()
                        desc_same_line = ''
                    
                    tema = re.sub(r'[:\s—–-]+$', '', tema).strip()
                    
                    # Capturar detalhes
                    detalhes_lines = []
                    if desc_same_line:
                        detalhes_lines.append(desc_same_line)
                    
                    j = i + 1
                    while j < len(all_lines):
                        next_line = all_lines[j]['text']
                        if part_pattern.match(next_line):
                            break
                        if re.match(r'^(TESOUROS|FAÇA SEU MELHOR|NOSSA VIDA|CÂNTICO)', next_line, re.IGNORECASE):
                            break
                        detalhes_lines.append(next_line)
                        j += 1
                    
                    descricao = detalhes_lines[0] if detalhes_lines else ''
                    detalhes = ' '.join(detalhes_lines[1:]) if len(detalhes_lines) > 1 else ''
                    
                    if num not in week['parts']:
                        week['parts'][num] = {
                            'num': num,
                            'tema': tema,
                            'duracao': duracao,
                            'descricao': descricao,
                            'detalhes': detalhes,
                            'section': section,
                        }
                
                i += 1
        
        doc.close()
        
        # Converter para registros
        records = []
        for week_id in sorted(all_weeks.keys()):
            week = all_weeks[week_id]
            seq = 1
            current_time = 19 * 60 + 30  # 19:30
            
            for num in sorted(week['parts'].keys()):
                part = week['parts'][num]
                section_key = part['section']
                secao = SECOES.get(section_key, section_key)
                tema = part['tema']
                
                # Determinar tipo
                tipo = 'Parte'
                needs_helper = False
                tema_lower = tema.lower()
                
                if 'joias espirituais' in tema_lower:
                    tipo = 'Joias Espirituais'
                elif 'leitura da bíblia' in tema_lower or 'leitura da biblia' in tema_lower:
                    tipo = 'Leitura da Bíblia'
                elif 'iniciando' in tema_lower:
                    tipo = 'Iniciando Conversas'
                    needs_helper = True
                elif 'cultivando' in tema_lower:
                    tipo = 'Cultivando o Interesse'
                    needs_helper = True
                elif 'fazendo' in tema_lower:
                    tipo = 'Fazendo Discípulos'
                    needs_helper = True
                elif 'explicando' in tema_lower:
                    tipo = 'Explicando Suas Crenças'
                    needs_helper = True
                elif 'discurso' in tema_lower and section_key == 'MINISTERIO':
                    tipo = 'Discurso de Estudante'
                elif 'estudo bíblico de congregação' in tema_lower:
                    tipo = 'Dirigente EBC'
                elif 'necessidades' in tema_lower:
                    tipo = 'Necessidades Locais'
                elif num == 1 and section_key == 'TESOUROS':
                    tipo = 'Discurso Tesouros'
                elif section_key == 'VIDA':
                    tipo = 'Parte Vida Cristã'
                elif section_key == 'MINISTERIO':
                    tipo = 'Parte Ministério'
                elif section_key == 'TESOUROS':
                    tipo = 'Parte Tesouros'
                
                modalidade = derivar_modalidade(tipo)
                duracao_min = int(part['duracao']) if part['duracao'] else 5
                
                def format_time(minutes: int) -> str:
                    h = minutes // 60
                    m = minutes % 60
                    return f"{h:02d}:{m:02d}"
                
                # Registro Titular
                records.append(ExtractedPart(
                    id=str(uuid.uuid4()),
                    weekId=week_id,
                    weekDisplay=week['display'],
                    date=week_id,
                    section=secao,
                    tipoParte=tipo,
                    modalidade=modalidade,
                    tituloParte=f"{num}. {tema}",
                    descricaoParte=part['descricao'],
                    detalhesParte=part['detalhes'],
                    seq=seq,
                    funcao='Titular',
                    duracao=part['duracao'],
                    horaInicio=format_time(current_time),
                    horaFim=format_time(current_time + duracao_min),
                    rawPublisherName='',
                    status='DRAFT',
                ))
                current_time += duracao_min
                seq += 1
                
                # Registro Ajudante
                if needs_helper:
                    records.append(ExtractedPart(
                        id=str(uuid.uuid4()),
                        weekId=week_id,
                        weekDisplay=week['display'],
                        date=week_id,
                        section=secao,
                        tipoParte=f'{tipo} (Ajudante)',
                        modalidade=modalidade,
                        tituloParte=f"{num}. {tema} - Ajudante",
                        descricaoParte='',
                        detalhesParte='',
                        seq=seq,
                        funcao='Ajudante',
                        duracao='',
                        horaInicio=format_time(current_time - duracao_min),
                        horaFim=format_time(current_time),
                        rawPublisherName='',
                        status='DRAFT',
                    ))
                    seq += 1
        
        return ExtractionResult(
            success=True,
            totalParts=len(records),
            totalWeeks=len(all_weeks),
            year=year,
            records=records,
        )
        
    except Exception as e:
        return ExtractionResult(
            success=False,
            totalParts=0,
            totalWeeks=0,
            year=0,
            records=[],
            error=str(e),
        )

# =============================================================================
# Endpoints
# =============================================================================

@router.post("/extract-pdf", response_model=ExtractionResult)
async def extract_workbook_pdf(file: UploadFile = File(...)):
    """
    Extrai partes da apostila (mwb) de um arquivo PDF.
    Retorna JSON com todas as partes prontas para importar.
    """
    if not file.filename.lower().endswith('.pdf'):
        raise HTTPException(status_code=400, detail="Arquivo deve ser PDF")
    
    # Ler conteúdo
    content = await file.read()
    
    # Extrair
    result = extract_workbook_from_pdf(content)
    
    if not result.success:
        raise HTTPException(status_code=500, detail=result.error)
    
    return result
