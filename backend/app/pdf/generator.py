"""
Gerador de PDF S-89
Baseado em: S-89 RVM Designações/generate_s89_forms.py
"""
from __future__ import annotations

import copy
import re
from datetime import datetime
from io import BytesIO
from pathlib import Path
from typing import Iterable

from pypdf import PdfReader, PdfWriter
from reportlab.pdfgen import canvas

from app.models.schemas import Assignment

# Posições dos campos no template S-89
NAME_POS = (60, 270)
ASSISTANT_POS = (86, 245)
DATE_POS = (60, 224)
PART_POS = (150, 200)
ROOM_POS = (70, 168)
OBS_POS = (70, 130)
OBS_WIDTH = 150
OBS_LINE_HEIGHT = 11

# Fontes
NAME_FONT = ("Helvetica-Bold", 12)
DEFAULT_FONT = ("Helvetica", 11)
OBS_FONT = ("Helvetica", 10)

# Caminho do template
TEMPLATE_DIR = Path(__file__).parent.parent.parent.parent / "templates"
TEMPLATE_PATH = TEMPLATE_DIR / "S-89_T.pdf"


def get_template_path() -> Path:
    """Retorna o caminho do template S-89"""
    if TEMPLATE_PATH.exists():
        return TEMPLATE_PATH
    
    # Tentar encontrar em outros locais
    alt_paths = [
        Path(__file__).parent.parent.parent.parent.parent / "S-89_T.pdf",
        Path(__file__).parent.parent.parent.parent.parent.parent / "S-89_T.pdf",
    ]
    
    for alt_path in alt_paths:
        if alt_path.exists():
            return alt_path
    
    raise FileNotFoundError(f"Template S-89 não encontrado em {TEMPLATE_PATH}")


def format_date(date_str: str) -> str:
    """Formata a data para exibição no PDF"""
    try:
        date = datetime.fromisoformat(date_str)
        return date.strftime("%d/%m/%Y")
    except ValueError:
        return date_str


def create_overlay(page_size: tuple[float, float], assignment: Assignment) -> PdfReader:
    """Cria uma camada de texto para sobrepor ao template"""
    buffer = BytesIO()
    c = canvas.Canvas(buffer, pagesize=page_size)
    
    # Nome do estudante
    c.setFont(*NAME_FONT)
    c.drawString(NAME_POS[0], NAME_POS[1], assignment.student)
    
    # Nome do ajudante
    c.setFont(*DEFAULT_FONT)
    if assignment.assistant:
        assistant_y = ASSISTANT_POS[1]
        # Ajuste especial para certos nomes (do código original)
        normalized = assignment.assistant.strip().lower()
        if normalized in {"mara rúbia", "mária rúbia"}:
            assistant_y -= 4
        c.drawString(ASSISTANT_POS[0], assistant_y, assignment.assistant)
    
    # Data
    c.drawString(DATE_POS[0], DATE_POS[1], format_date(assignment.date))
    
    # Número da parte
    c.drawString(PART_POS[0], PART_POS[1], str(assignment.part_number))
    
    # Sala
    if assignment.room:
        c.drawString(ROOM_POS[0], ROOM_POS[1], assignment.room)
    
    c.save()
    buffer.seek(0)
    return PdfReader(buffer)


def render_assignment(template_reader: PdfReader, assignment: Assignment, output_path: Path) -> None:
    """Renderiza o PDF final mesclando template com overlay"""
    page_size = template_reader.pages[0].mediabox
    overlay_reader = create_overlay((float(page_size.width), float(page_size.height)), assignment)
    overlay_page = overlay_reader.pages[0]
    
    page = copy.copy(template_reader.pages[0])
    page.merge_page(overlay_page)
    
    writer = PdfWriter()
    writer.add_page(page)
    
    with output_path.open("wb") as target:
        writer.write(target)


def assignment_filename(assignment: Assignment) -> str:
    """Gera o nome do arquivo de saída"""
    slug = re.sub(r"[^A-Za-z0-9]+", "-", assignment.student).strip("-") or "designacao"
    return f"{assignment.date}_parte-{assignment.part_number}_{slug}.pdf"


def generate_s89_pdf(assignment: Assignment, output_dir: Path) -> Path:
    """
    Gera um PDF S-89 para uma designação
    
    Args:
        assignment: Dados da designação
        output_dir: Diretório de saída
    
    Returns:
        Caminho do arquivo gerado
    """
    template_path = get_template_path()
    template_reader = PdfReader(str(template_path))
    
    output_dir.mkdir(parents=True, exist_ok=True)
    output_path = output_dir / assignment_filename(assignment)
    
    render_assignment(template_reader, assignment, output_path)
    
    return output_path


def generate_s89_batch(assignments: list[Assignment], output_dir: Path) -> list[Path]:
    """
    Gera múltiplos PDFs S-89
    
    Args:
        assignments: Lista de designações
        output_dir: Diretório de saída
    
    Returns:
        Lista de caminhos dos arquivos gerados
    """
    template_path = get_template_path()
    template_reader = PdfReader(str(template_path))
    
    output_dir.mkdir(parents=True, exist_ok=True)
    
    paths = []
    for assignment in assignments:
        output_path = output_dir / assignment_filename(assignment)
        render_assignment(template_reader, assignment, output_path)
        paths.append(output_path)
    
    return paths
