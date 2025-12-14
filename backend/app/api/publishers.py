"""
API Routes para gerenciamento de publicadores
"""
from fastapi import APIRouter, HTTPException
from typing import Optional
import json
from pathlib import Path
from uuid import uuid4

from app.models.schemas import Publisher

router = APIRouter()

DATA_DIR = Path(__file__).parent.parent.parent / "data"
PUBLISHERS_FILE = DATA_DIR / "publishers.json"


def load_publishers() -> list[Publisher]:
    """Carrega publicadores do arquivo JSON"""
    if not PUBLISHERS_FILE.exists():
        DATA_DIR.mkdir(parents=True, exist_ok=True)
        PUBLISHERS_FILE.write_text("[]", encoding="utf-8")
        return []
    
    data = json.loads(PUBLISHERS_FILE.read_text(encoding="utf-8"))
    return [Publisher(**p) for p in data]


def save_publishers(publishers: list[Publisher]) -> None:
    """Salva publicadores no arquivo JSON"""
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    data = [p.model_dump() for p in publishers]
    PUBLISHERS_FILE.write_text(json.dumps(data, indent=2, ensure_ascii=False), encoding="utf-8")


@router.get("/")
async def list_publishers() -> list[Publisher]:
    """Lista todos os publicadores"""
    return load_publishers()


@router.get("/{publisher_id}")
async def get_publisher(publisher_id: str) -> Publisher:
    """Busca um publicador pelo ID"""
    publishers = load_publishers()
    for p in publishers:
        if p.id == publisher_id:
            return p
    raise HTTPException(status_code=404, detail="Publicador não encontrado")


@router.post("/")
async def create_publisher(publisher: Publisher) -> Publisher:
    """Cria um novo publicador"""
    publishers = load_publishers()
    
    # Gerar ID se não fornecido
    if not publisher.id:
        publisher.id = str(uuid4())
    
    # Verificar duplicidade
    for p in publishers:
        if p.id == publisher.id:
            raise HTTPException(status_code=400, detail="Publicador já existe")
    
    publishers.append(publisher)
    save_publishers(publishers)
    return publisher


@router.put("/{publisher_id}")
async def update_publisher(publisher_id: str, publisher: Publisher) -> Publisher:
    """Atualiza um publicador existente"""
    publishers = load_publishers()
    
    for i, p in enumerate(publishers):
        if p.id == publisher_id:
            publisher.id = publisher_id
            publishers[i] = publisher
            save_publishers(publishers)
            return publisher
    
    raise HTTPException(status_code=404, detail="Publicador não encontrado")


@router.delete("/{publisher_id}")
async def delete_publisher(publisher_id: str) -> dict:
    """Remove um publicador"""
    publishers = load_publishers()
    
    for i, p in enumerate(publishers):
        if p.id == publisher_id:
            publishers.pop(i)
            save_publishers(publishers)
            return {"message": "Publicador removido com sucesso"}
    
    raise HTTPException(status_code=404, detail="Publicador não encontrado")


@router.get("/search/{name}")
async def search_publishers(name: str) -> list[Publisher]:
    """Busca publicadores por nome"""
    publishers = load_publishers()
    name_lower = name.lower()
    return [
        p for p in publishers 
        if name_lower in p.name.lower() or any(name_lower in a.lower() for a in p.aliases)
    ]
