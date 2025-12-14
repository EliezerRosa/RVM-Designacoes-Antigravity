"""
API Routes para geração e extração de PDFs
"""
from fastapi import APIRouter, HTTPException, UploadFile, File
from fastapi.responses import FileResponse
from typing import Optional
import base64
from pathlib import Path
from io import BytesIO
import tempfile

from app.models.schemas import Assignment, S89Request, WorkbookExtractRequest, WorkbookExtractResponse
from app.pdf.generator import generate_s89_pdf
from app.pdf.extractor import extract_workbook_data

router = APIRouter()

OUTPUT_DIR = Path(__file__).parent.parent.parent / "output"


@router.post("/s89")
async def generate_s89(request: S89Request) -> dict:
    """Gera um PDF S-89 para uma designação"""
    try:
        OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
        
        output_path = generate_s89_pdf(request.assignment, OUTPUT_DIR)
        
        # Retornar o PDF em base64
        pdf_bytes = output_path.read_bytes()
        pdf_base64 = base64.b64encode(pdf_bytes).decode("utf-8")
        
        return {
            "success": True,
            "filename": output_path.name,
            "pdf_data": pdf_base64
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/s89/batch")
async def generate_s89_batch(assignments: list[Assignment]) -> dict:
    """Gera múltiplos PDFs S-89"""
    try:
        OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
        
        results = []
        for assignment in assignments:
            output_path = generate_s89_pdf(assignment, OUTPUT_DIR)
            pdf_bytes = output_path.read_bytes()
            pdf_base64 = base64.b64encode(pdf_bytes).decode("utf-8")
            
            results.append({
                "filename": output_path.name,
                "pdf_data": pdf_base64
            })
        
        return {
            "success": True,
            "count": len(results),
            "files": results
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/extract")
async def extract_workbook(request: WorkbookExtractRequest) -> WorkbookExtractResponse:
    """Extrai dados de uma apostila PDF"""
    try:
        # Decodificar o PDF
        pdf_bytes = base64.b64decode(request.file_data)
        
        # Extrair dados
        weeks = extract_workbook_data(pdf_bytes, request.file_name)
        
        return WorkbookExtractResponse(
            weeks=weeks,
            success=True,
            message=f"Extraídas {len(weeks)} semanas com sucesso"
        )
    except Exception as e:
        return WorkbookExtractResponse(
            weeks=[],
            success=False,
            message=str(e)
        )


@router.post("/extract/upload")
async def extract_workbook_upload(file: UploadFile = File(...)) -> WorkbookExtractResponse:
    """Extrai dados de uma apostila PDF via upload"""
    try:
        pdf_bytes = await file.read()
        weeks = extract_workbook_data(pdf_bytes, file.filename or "workbook.pdf")
        
        return WorkbookExtractResponse(
            weeks=weeks,
            success=True,
            message=f"Extraídas {len(weeks)} semanas com sucesso"
        )
    except Exception as e:
        return WorkbookExtractResponse(
            weeks=[],
            success=False,
            message=str(e)
        )
