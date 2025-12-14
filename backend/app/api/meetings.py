"""
API Routes para gerenciamento de reuniões
"""
from fastapi import APIRouter, HTTPException
from typing import Optional
import json
from pathlib import Path
from uuid import uuid4
from datetime import datetime

from app.models.schemas import Participation

router = APIRouter()

DATA_DIR = Path(__file__).parent.parent.parent / "data"
MEETINGS_FILE = DATA_DIR / "meetings.json"


def load_meetings() -> list[dict]:
    """Carrega reuniões do arquivo JSON"""
    if not MEETINGS_FILE.exists():
        DATA_DIR.mkdir(parents=True, exist_ok=True)
        MEETINGS_FILE.write_text("[]", encoding="utf-8")
        return []
    
    return json.loads(MEETINGS_FILE.read_text(encoding="utf-8"))


def save_meetings(meetings: list[dict]) -> None:
    """Salva reuniões no arquivo JSON"""
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    MEETINGS_FILE.write_text(json.dumps(meetings, indent=2, ensure_ascii=False), encoding="utf-8")


@router.get("/")
async def list_meetings() -> list[dict]:
    """Lista todas as reuniões"""
    return load_meetings()


@router.get("/{meeting_id}")
async def get_meeting(meeting_id: str) -> dict:
    """Busca uma reunião pelo ID"""
    meetings = load_meetings()
    for m in meetings:
        if m.get("id") == meeting_id:
            return m
    raise HTTPException(status_code=404, detail="Reunião não encontrada")


@router.post("/")
async def create_meeting(meeting: dict) -> dict:
    """Cria uma nova reunião"""
    meetings = load_meetings()
    
    # Gerar ID se não fornecido
    if "id" not in meeting:
        meeting["id"] = str(uuid4())
    
    meetings.append(meeting)
    save_meetings(meetings)
    return meeting


@router.put("/{meeting_id}")
async def update_meeting(meeting_id: str, meeting: dict) -> dict:
    """Atualiza uma reunião existente"""
    meetings = load_meetings()
    
    for i, m in enumerate(meetings):
        if m.get("id") == meeting_id:
            meeting["id"] = meeting_id
            meetings[i] = meeting
            save_meetings(meetings)
            return meeting
    
    raise HTTPException(status_code=404, detail="Reunião não encontrada")


@router.delete("/{meeting_id}")
async def delete_meeting(meeting_id: str) -> dict:
    """Remove uma reunião"""
    meetings = load_meetings()
    
    for i, m in enumerate(meetings):
        if m.get("id") == meeting_id:
            meetings.pop(i)
            save_meetings(meetings)
            return {"message": "Reunião removida com sucesso"}
    
    raise HTTPException(status_code=404, detail="Reunião não encontrada")


@router.get("/week/{week}")
async def get_meetings_by_week(week: str) -> list[dict]:
    """Busca reuniões por semana"""
    meetings = load_meetings()
    return [m for m in meetings if m.get("week") == week]
