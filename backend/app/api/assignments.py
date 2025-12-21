"""
API Routes para gerenciamento de designações - Motor de Regras
"""
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from typing import Optional, List
import json
from pathlib import Path
from uuid import uuid4

from app.models.schemas import (
    Publisher, 
    Participation, 
    ParticipationType,
    PublisherStats
)
from app.core.allocator import calculate_stats
from app.core.assignment_engine import (
    generate_assignments,
    apply_rigid_filters,
    rank_candidates,
    get_category_for_part,
    EngineConfig,
    DEFAULT_CONFIG,
    ApprovalStatus,
    TeachingCategory,
)
from app.core.approval_service import (
    get_approval_service,
    ApprovalAction,
    StoredAssignment,
)

router = APIRouter()

DATA_DIR = Path(__file__).parent.parent.parent / "data"
PARTICIPATIONS_FILE = DATA_DIR / "participations.json"


# ============================================================================
# MODELOS DE REQUEST/RESPONSE
# ============================================================================

class GenerateRequest(BaseModel):
    """Request para gerar designações"""
    week: str
    date: str
    publishers: List[Publisher]
    participations: List[Participation]
    parts: Optional[List[dict]] = None  # [{"title": str, "type": str, "needsHelper": bool}]


class GeneratedAssignmentResponse(BaseModel):
    """Resposta com designação gerada"""
    part_title: str
    part_type: str
    teaching_category: str
    principal_name: str
    principal_id: str
    secondary_name: Optional[str]
    secondary_id: Optional[str]
    status: str
    score: float
    reason: str
    pairing_reason: Optional[str]


class ApprovalRequest(BaseModel):
    """Request para aprovar/rejeitar designação"""
    action: str  # 'APPROVE' or 'REJECT'
    elder_id: str
    elder_name: str
    reason: Optional[str] = None


class FilterTestRequest(BaseModel):
    """Request para testar filtro"""
    publishers: List[Publisher]
    part_type: str
    part_title: str
    date: str
    already_assigned: List[str] = []


class RankTestRequest(BaseModel):
    """Request para testar ranqueamento"""
    publishers: List[Publisher]
    participations: List[Participation]
    part_title: str


# ============================================================================
# FUNÇÕES AUXILIARES
# ============================================================================

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


def get_part_type_enum(part_type_str: str) -> ParticipationType:
    """Converte string para enum ParticipationType"""
    mapping = {
        "tesouros": ParticipationType.TESOUROS,
        "ministerio": ParticipationType.MINISTERIO,
        "vida_crista": ParticipationType.VIDA_CRISTA,
        "presidente": ParticipationType.PRESIDENTE,
        "oracao_inicial": ParticipationType.ORACAO_INICIAL,
        "oracao_final": ParticipationType.ORACAO_FINAL,
        "dirigente": ParticipationType.DIRIGENTE,
        "leitor": ParticipationType.LEITOR,
        "ajudante": ParticipationType.AJUDANTE,
    }
    return mapping.get(part_type_str.lower(), ParticipationType.MINISTERIO)


# ============================================================================
# ENDPOINTS DE PARTICIPAÇÕES
# ============================================================================

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


# ============================================================================
# ENDPOINTS DO MOTOR DE DESIGNAÇÕES
# ============================================================================

@router.post("/generate")
async def generate_schedule(request: GenerateRequest) -> List[GeneratedAssignmentResponse]:
    """
    Gera designações usando o Motor de Regras.
    
    O motor aplica:
    1. Filtros rígidos (gênero, disponibilidade, privilégios)
    2. Ranqueamento ponderado (dias de espera × peso da categoria)
    3. Cooldown (penalidade por repetição recente)
    4. Pareamento de ajudantes
    5. Verificação de aprovação
    """
    try:
        # Partes padrão se não especificadas
        if request.parts:
            parts_to_fill = [
                (p["title"], get_part_type_enum(p.get("type", "ministerio")), p.get("needsHelper", False))
                for p in request.parts
            ]
        else:
            parts_to_fill = [
                ("Leitura da Bíblia", ParticipationType.TESOUROS, False),
                ("Iniciando conversas", ParticipationType.MINISTERIO, True),
                ("Cultivando o interesse", ParticipationType.MINISTERIO, True),
                ("Fazendo discípulos", ParticipationType.MINISTERIO, True),
            ]
        
        results = await generate_assignments(
            week=request.week,
            date=request.date,
            parts_to_fill=parts_to_fill,
            publishers=request.publishers,
            participations=request.participations,
            config=DEFAULT_CONFIG
        )
        
        # Armazenar no serviço de aprovação
        approval_service = get_approval_service()
        approval_service.store_generated_assignments(
            week_id=request.week,
            date=request.date,
            assignments=results
        )
        
        return [
            GeneratedAssignmentResponse(
                part_title=r.part_title,
                part_type=r.part_type.value if hasattr(r.part_type, 'value') else str(r.part_type),
                teaching_category=r.category.value if hasattr(r.category, 'value') else str(r.category),
                principal_name=r.principal_name,
                principal_id=r.principal_id,
                secondary_name=r.secondary_name,
                secondary_id=r.secondary_id,
                status=r.status.value if hasattr(r.status, 'value') else str(r.status),
                score=r.score,
                reason=r.reason,
                pairing_reason=r.pairing_reason
            )
            for r in results
        ]
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/filter-test")
async def test_filter(request: FilterTestRequest) -> dict:
    """
    Testa o filtro rígido com os parâmetros fornecidos.
    Útil para debugging e verificação de regras.
    """
    try:
        part_type = get_part_type_enum(request.part_type)
        result = apply_rigid_filters(
            publishers=request.publishers,
            part_type=part_type,
            part_title=request.part_title,
            date=request.date,
            already_assigned=request.already_assigned
        )
        
        return {
            "eligible_count": len(result.eligible),
            "eligible": [{"id": p.id, "name": p.name} for p in result.eligible],
            "rejected_count": len(result.rejected),
            "rejected": [{"id": p.id, "name": p.name, "reason": r} for p, r in result.rejected]
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/rank-test")
async def test_ranking(request: RankTestRequest) -> dict:
    """
    Testa o ranqueamento com os parâmetros fornecidos.
    Útil para debugging e verificação de algoritmo.
    """
    try:
        category = get_category_for_part(request.part_title)
        ranked = rank_candidates(
            candidates=request.publishers,
            participations=request.participations,
            part_title=request.part_title,
            category=category
        )
        
        return {
            "category": category.value,
            "ranked": [
                {
                    "name": r.publisher.name,
                    "score": r.score,
                    "days_since_last": r.days_since_last,
                    "category_weight": r.category_weight,
                    "cooldown_penalty": r.cooldown_penalty,
                    "never_participated_bonus": r.never_participated_bonus,
                    "reason": r.reason
                }
                for r in ranked
            ]
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


# ============================================================================
# ENDPOINTS DE APROVAÇÃO
# ============================================================================

@router.get("/pending")
async def list_pending_approvals() -> List[dict]:
    """Lista todas as designações pendentes de aprovação"""
    service = get_approval_service()
    pending = service.get_pending_approvals()
    
    return [
        {
            "id": a.id,
            "week_id": a.week_id,
            "part_title": a.part_title,
            "principal_name": a.principal_publisher_name,
            "secondary_name": a.secondary_publisher_name,
            "status": a.status.value if hasattr(a.status, 'value') else str(a.status),
            "selection_reason": a.selection_reason,
            "created_at": a.created_at
        }
        for a in pending
    ]


@router.get("/week/{week_id}")
async def list_week_assignments(week_id: str) -> List[dict]:
    """Lista todas as designações de uma semana"""
    service = get_approval_service()
    assignments = service.get_assignments_by_week(week_id)
    
    return [
        {
            "id": a.id,
            "part_title": a.part_title,
            "part_type": a.part_type,
            "principal_name": a.principal_publisher_name,
            "secondary_name": a.secondary_publisher_name,
            "status": a.status.value if hasattr(a.status, 'value') else str(a.status),
            "score": a.score,
            "selection_reason": a.selection_reason,
            "approved_by": a.approved_by_elder_name,
            "rejection_reason": a.rejection_reason
        }
        for a in assignments
    ]


@router.patch("/{assignment_id}/approve")
async def approve_assignment(assignment_id: str, request: ApprovalRequest) -> dict:
    """
    Processa aprovação ou rejeição de uma designação.
    Apenas Anciãos podem executar esta ação.
    """
    if request.action not in ['APPROVE', 'REJECT']:
        raise HTTPException(status_code=400, detail="Ação deve ser 'APPROVE' ou 'REJECT'")
    
    if request.action == 'REJECT' and not request.reason:
        raise HTTPException(status_code=400, detail="Motivo é obrigatório para rejeição")
    
    try:
        service = get_approval_service()
        action = ApprovalAction(
            assignment_id=assignment_id,
            action=request.action,
            elder_id=request.elder_id,
            elder_name=request.elder_name,
            reason=request.reason
        )
        
        result = service.process_approval(
            action=action,
            publishers=[],  # TODO: passar lista real se necessário para regeneração
            participations=[],
            parts_to_fill=[]
        )
        
        return {
            "id": result.id,
            "status": result.status.value if hasattr(result.status, 'value') else str(result.status),
            "message": f"Designação {'aprovada' if request.action == 'APPROVE' else 'rejeitada'} com sucesso"
        }
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/approval-stats")
async def get_approval_stats() -> dict:
    """Retorna estatísticas das designações"""
    service = get_approval_service()
    return service.get_stats()


# ============================================================================
# ENDPOINTS DE ESTATÍSTICAS
# ============================================================================

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

