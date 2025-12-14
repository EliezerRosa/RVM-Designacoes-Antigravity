"""
API Routes para gerenciamento de designações e motor de IA
"""
from fastapi import APIRouter, HTTPException
from typing import Optional
import json
from pathlib import Path
from uuid import uuid4

from app.models.schemas import (
    Publisher, 
    Participation, 
    AiScheduleRequest, 
    AiScheduleResult,
    PublisherStats
)
from app.core.allocator import generate_schedule, calculate_stats

router = APIRouter()

DATA_DIR = Path(__file__).parent.parent.parent / "data"
PARTICIPATIONS_FILE = DATA_DIR / "participations.json"


def load_participations() -> list[Participation]:
    """Carrega participações do arquivo JSON"""
    if not PARTICIPATIONS_FILE.exists():
        DATA_DIR.mkdir(parents=True, exist_ok=True)
        PARTICIPATIONS_FILE.write_text("[]", encoding="utf-8")
        return []
    
    data = json.loads(PARTICIPATIONS_FILE.read_text(encoding="utf-8"))
    return [Participation(**p) for p in data]


def save_participations(participations: list[Participation]) -> None:
    """Salva participações no arquivo JSON"""
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    data = [p.model_dump() for p in participations]
    PARTICIPATIONS_FILE.write_text(json.dumps(data, indent=2, ensure_ascii=False), encoding="utf-8")


@router.get("/participations")
async def list_participations() -> list[Participation]:
    """Lista todas as participações"""
    return load_participations()


@router.post("/participations")
async def create_participation(participation: Participation) -> Participation:
    """Cria uma nova participação"""
    participations = load_participations()
    
    if not participation.id:
        participation.id = str(uuid4())
    
    participations.append(participation)
    save_participations(participations)
    return participation


@router.delete("/participations/{participation_id}")
async def delete_participation(participation_id: str) -> dict:
    """Remove uma participação"""
    participations = load_participations()
    
    for i, p in enumerate(participations):
        if p.id == participation_id:
            participations.pop(i)
            save_participations(participations)
            return {"message": "Participação removida com sucesso"}
    
    raise HTTPException(status_code=404, detail="Participação não encontrada")


@router.post("/generate")
async def generate_ai_schedule(request: AiScheduleRequest) -> list[AiScheduleResult]:
    """Gera designações usando motor de IA"""
    try:
        results = await generate_schedule(
            week=request.week,
            publishers=request.publishers,
            participations=request.participations
        )
        return results
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/stats")
async def get_publisher_stats() -> list[PublisherStats]:
    """Calcula estatísticas de participação dos publicadores"""
    participations = load_participations()
    return calculate_stats(participations)


@router.get("/stats/{publisher_id}")
async def get_publisher_stat(publisher_id: str) -> PublisherStats:
    """Busca estatísticas de um publicador específico"""
    participations = load_participations()
    stats = calculate_stats(participations)
    
    for s in stats:
        if s.publisher_id == publisher_id:
            return s
    
    raise HTTPException(status_code=404, detail="Estatísticas não encontradas")
