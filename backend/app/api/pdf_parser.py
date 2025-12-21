"""
Parser de PDFs S-140 para importação de histórico
Suporta dois formatos: Pautas semanais e Apostilas
"""
import re
import json
import unicodedata
from datetime import date
from typing import List, Dict, Optional, Tuple
from io import BytesIO

from fastapi import APIRouter, UploadFile, File, HTTPException
from pydantic import BaseModel


router = APIRouter()


# ==========================================
# Configurações e Constantes
# ==========================================

PORTUGUESE_MONTHS = {
    "janeiro": 1, "fevereiro": 2, "marco": 3, "março": 3, "abril": 4, "maio": 5, "junho": 6,
    "julho": 7, "agosto": 8, "setembro": 9, "outubro": 10, "novembro": 11, "dezembro": 12,
}

SECTION_HEADINGS = {
    "tesouros": "Tesouros",
    "minist": "Ministério",
    "vida": "Vida Cristã",
    "conclus": "Conclusão",
}

CONTROL_TOKENS = ("/CR", "/SUBC", "/CAN")
SKIP_KEYWORDS = ("SALA B", "SALAO PRINCIPAL", "SALÃO PRINCIPAL")

# Regex Patterns
DURATION_PATTERN = re.compile(r"(?P<title>.+?)\s*\((?P<duration>\d+)\s*min\)", re.IGNORECASE)
DATE_PATTERN_PT = re.compile(r"(?P<day>\d{1,2})\s+de\s+(?P<month>[a-zç]+)\s+de\s+(?P<year>\d{4})", re.IGNORECASE)
WEEK_LABEL_PATTERN = re.compile(r"\d{1,2}\s*(?:[-–]|a)\s*\d{1,2}\s+de\s+[a-zç]+", re.IGNORECASE)
YEAR_PATTERN = re.compile(r"20\d{2}")
TIME_TOKEN_PATTERN = re.compile(r"^\d{1,2}[\.:,]\d{2}$")
NUMBERED_LINE_PATTERN = re.compile(r"^(?P<number>\d+)(?:[\.)]?\s+).+")
DURATION_SUFFIX_PATTERN = re.compile(r"\(\s*\d+\s*min\s*\)", re.IGNORECASE)


# ==========================================
# Modelos
# ==========================================

class ParsedPart(BaseModel):
    section: str
    title: str
    student: Optional[str]
    assistant: Optional[str]


class ParsedWeek(BaseModel):
    label: str
    date: Optional[str]
    parts: List[ParsedPart]


class ParseResult(BaseModel):
    success: bool
    weeks: List[ParsedWeek]
    records: List[dict]  # HistoryRecord format
    error: Optional[str] = None


# ==========================================
# Funções de Parsing
# ==========================================

def _normalize_text(text: str) -> str:
    """Remove acentos e caracteres especiais"""
    normalized = unicodedata.normalize("NFKD", text)
    normalized = "".join(ch for ch in normalized if not unicodedata.combining(ch))
    for token in CONTROL_TOKENS:
        normalized = normalized.replace(token, " ")
    normalized = normalized.replace("\u2002", " ").replace("\u00a0", " ")
    return normalized


def _prepare_lines(text: str) -> List[str]:
    """Limpa e prepara linhas do texto"""
    normalized = _normalize_text(text)
    lines = []
    seen = None
    
    for raw in normalized.splitlines():
        line = raw.strip()
        if not line:
            continue
        
        # Remove timestamps
        line = re.sub(r"\d{1,2}:\d{2}\s+", "", line)
        line = re.sub(r"\s{2,}", " ", line)
        line = line.strip(" -:/")
        
        if not line:
            continue
        
        # Skip headers
        upper_line = line.upper()
        if any(keyword in upper_line for keyword in SKIP_KEYWORDS):
            continue
        
        # Skip duplicates
        if line == seen:
            continue
        seen = line
        lines.append(line)
    
    return lines


def _detect_year(text: str) -> int:
    """Extrai ano do texto"""
    match = YEAR_PATTERN.search(text)
    return int(match.group(0)) if match else date.today().year


def _extract_week_start(label: str, year_hint: int) -> Optional[date]:
    """Extrai data de início da semana"""
    sanitized = label.lower().replace(".o", "")
    range_pattern = re.compile(
        r"(?P<start>\d{1,2})\s*(?:[-–]|a)\s*(?P<end>\d{1,2})?\s+de\s+(?P<month>[a-zç]+)",
        re.IGNORECASE,
    )
    match = range_pattern.search(sanitized)
    if not match:
        return None
    
    day = int(match.group("start"))
    month_name = match.group("month").replace(" ", "")
    month = PORTUGUESE_MONTHS.get(month_name)
    
    if not month:
        return None
    
    try:
        return date(year_hint, month, day)
    except ValueError:
        return None


def _looks_like_week_header(line: str) -> bool:
    """Verifica se linha parece cabeçalho de semana"""
    compact = re.sub(r"\s+", "", line.lower())
    return bool(re.search(r"\d{1,2}(?:[-–]|a)\d{1,2}de[a-zç]+", compact))


def _detect_section(line: str, current: Optional[str]) -> Optional[str]:
    """Detecta seção da reunião"""
    normalized = line.lower()
    for snippet, section in SECTION_HEADINGS.items():
        if snippet in normalized:
            return section
    return current


def _next_name_block(lines: List[str], start_index: int) -> Optional[str]:
    """Procura próximo bloco com nome"""
    for offset in range(start_index, min(start_index + 4, len(lines))):
        candidate = lines[offset].strip()
        if not candidate:
            continue
        if TIME_TOKEN_PATTERN.match(candidate):
            continue
        if NUMBERED_LINE_PATTERN.match(candidate):
            break
        
        normalized = candidate.upper()
        if any(keyword in normalized for keyword in ("TESOUROS", "MINIST", "BIBL", "ORAÇÃO", "CÂNTICO", "CANTICO", "PROGRAMAÇÃO")):
            continue
        
        cleaned = DURATION_SUFFIX_PATTERN.sub("", candidate)
        cleaned = re.sub(r"\d+\s*min\)?", "", cleaned, flags=re.IGNORECASE)
        cleaned = cleaned.strip(" -:")
        
        if not cleaned:
            continue
        return cleaned
    
    return None


def _names_from_string(payload: str) -> Tuple[str, Optional[str]]:
    """Extrai estudante e ajudante de uma string"""
    sanitized = payload.strip().strip(") ")
    sanitized = re.sub(r"\s{2,}", " ", sanitized)
    
    if "+" in sanitized:
        parts = sanitized.split("+", 1)
        return parts[0].strip(), parts[1].strip() or None
    
    if " / " in sanitized or "/" in sanitized:
        parts = sanitized.split("/", 1)
        return parts[0].strip(), parts[1].strip() or None
    
    return sanitized.strip(), None


def extract_weeks_from_text(text: str) -> List[ParsedWeek]:
    """Extrai semanas e partes de texto de PDF"""
    year_hint = _detect_year(text)
    cleaned_lines = _prepare_lines(text)
    weeks = []
    current_week = None
    current_section = None
    
    for idx, line in enumerate(cleaned_lines):
        # Detectar cabeçalho de semana
        if _looks_like_week_header(line):
            if current_week:
                weeks.append(current_week)
            
            week_date = _extract_week_start(line, year_hint)
            current_week = ParsedWeek(
                label=line,
                date=week_date.isoformat() if week_date else None,
                parts=[]
            )
            current_section = None
            continue
        
        if not current_week:
            continue
        
        # Detectar seção
        next_section = _detect_section(line, current_section)
        if next_section != current_section:
            current_section = next_section
            continue
        
        # Detectar parte com duração
        match = DURATION_PATTERN.search(line)
        if match and current_section:
            title = match.group("title").strip(' -:"')
            
            # Procurar nome
            name_block = _next_name_block(cleaned_lines, idx + 1)
            if name_block:
                student, assistant = _names_from_string(name_block)
                
                current_week.parts.append(ParsedPart(
                    section=current_section,
                    title=title,
                    student=student,
                    assistant=assistant
                ))
    
    if current_week:
        weeks.append(current_week)
    
    return weeks


def convert_to_history_records(weeks: List[ParsedWeek], batch_id: str) -> List[dict]:
    """Converte semanas parseadas para formato HistoryRecord"""
    records = []
    
    for week in weeks:
        for part in week.parts:
            if part.student:
                records.append({
                    "id": f"hr-{batch_id}-{len(records)}",
                    "weekId": week.date[:7] if week.date else "",  # YYYY-MM
                    "weekDisplay": week.label,
                    "date": week.date or "",
                    "partTitle": part.title,
                    "partType": part.section,
                    "rawPublisherName": part.student,
                    "rawHelperName": part.assistant,
                    "status": "PENDING",
                    "importSource": "PDF",
                    "importBatchId": batch_id,
                })
    
    return records


# ==========================================
# Endpoint API
# ==========================================

@router.post("/parse-pdf", response_model=ParseResult)
async def parse_pdf(file: UploadFile = File(...)):
    """
    Faz parsing de PDF S-140 e retorna registros para staging.
    Suporta formatos: Pautas semanais e Apostilas.
    """
    if not file.filename.lower().endswith('.pdf'):
        raise HTTPException(status_code=400, detail="Arquivo deve ser PDF")
    
    try:
        # Ler arquivo
        content = await file.read()
        
        # Tentar importar pypdf
        try:
            from pypdf import PdfReader
        except ImportError:
            raise HTTPException(
                status_code=500, 
                detail="Biblioteca pypdf não instalada no servidor"
            )
        
        # Extrair texto
        reader = PdfReader(BytesIO(content))
        text_parts = []
        
        for page in reader.pages:
            try:
                page_text = page.extract_text(extraction_mode="layout")
            except:
                page_text = page.extract_text()
            if page_text:
                text_parts.append(page_text)
        
        full_text = "\n".join(text_parts)
        
        if not full_text.strip():
            return ParseResult(
                success=False,
                weeks=[],
                records=[],
                error="PDF sem texto extraível"
            )
        
        # Parsear
        weeks = extract_weeks_from_text(full_text)
        
        # Gerar batch_id
        import time
        batch_id = f"batch-{int(time.time())}"
        
        # Converter para HistoryRecords
        records = convert_to_history_records(weeks, batch_id)
        
        return ParseResult(
            success=True,
            weeks=weeks,
            records=records
        )
        
    except Exception as e:
        return ParseResult(
            success=False,
            weeks=[],
            records=[],
            error=str(e)
        )
