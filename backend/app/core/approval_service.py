"""
Serviço de Aprovação de Designações
Gerencia fluxo de aprovação hierárquica por Anciãos
"""
from datetime import datetime
from typing import Optional, List
from dataclasses import dataclass
from enum import Enum

from app.core.assignment_engine import (
    ApprovalStatus,
    GeneratedAssignment,
    generate_assignments,
    EngineConfig,
    DEFAULT_CONFIG,
)
from app.models.schemas import Publisher, Participation, ParticipationType


@dataclass
class StoredAssignment:
    """Designação armazenada com metadados completos"""
    id: str
    week_id: str
    part_id: str
    part_title: str
    part_type: str
    teaching_category: str
    
    # Designados
    principal_publisher_id: str
    principal_publisher_name: str
    secondary_publisher_id: Optional[str]
    secondary_publisher_name: Optional[str]
    
    # Timing
    date: str
    duration_min: int
    room: Optional[str]
    
    # Status
    status: ApprovalStatus
    approved_by_elder_id: Optional[str]
    approved_by_elder_name: Optional[str]
    approval_date: Optional[str]
    rejection_reason: Optional[str]
    
    # Metadados
    selection_reason: str
    score: float
    pairing_reason: Optional[str]
    
    created_at: str
    updated_at: Optional[str]


@dataclass
class ApprovalAction:
    """Ação de aprovação/rejeição"""
    assignment_id: str
    action: str  # 'APPROVE' or 'REJECT'
    elder_id: str
    elder_name: str
    reason: Optional[str] = None


class ApprovalService:
    """Serviço para gerenciar aprovações de designações"""
    
    def __init__(self, storage: dict = None):
        """
        Args:
            storage: Dicionário para armazenar designações (em memória)
                     Em produção, substituir por banco de dados
        """
        self._storage = storage if storage is not None else {}
    
    def get_assignment(self, assignment_id: str) -> Optional[StoredAssignment]:
        """Busca uma designação pelo ID"""
        return self._storage.get(assignment_id)
    
    def get_assignments_by_week(self, week_id: str) -> List[StoredAssignment]:
        """Lista todas as designações de uma semana"""
        return [
            a for a in self._storage.values()
            if a.week_id == week_id
        ]
    
    def get_pending_approvals(self) -> List[StoredAssignment]:
        """Lista todas as designações pendentes de aprovação"""
        return [
            a for a in self._storage.values()
            if a.status == ApprovalStatus.PENDING_APPROVAL
        ]
    
    def process_approval(
        self,
        action: ApprovalAction,
        publishers: List[Publisher],
        participations: List[Participation],
        parts_to_fill: List[tuple],
        config: EngineConfig = DEFAULT_CONFIG
    ) -> StoredAssignment:
        """
        Processa uma ação de aprovação ou rejeição.
        
        Se REJECT:
            1. Marca a designação como REJECTED
            2. Adiciona o publicador rejeitado à lista de exclusão
            3. Chama o motor novamente para regenerar
        
        Returns:
            A designação atualizada (ou nova, em caso de rejeição)
        """
        assignment = self.get_assignment(action.assignment_id)
        if not assignment:
            raise ValueError(f"Designação não encontrada: {action.assignment_id}")
        
        now = datetime.now().isoformat()
        
        if action.action == 'APPROVE':
            # Aprovar a designação
            assignment.status = ApprovalStatus.APPROVED
            assignment.approved_by_elder_id = action.elder_id
            assignment.approved_by_elder_name = action.elder_name
            assignment.approval_date = now
            assignment.updated_at = now
            
            self._storage[assignment.id] = assignment
            return assignment
        
        elif action.action == 'REJECT':
            # Rejeitar a designação
            assignment.status = ApprovalStatus.REJECTED
            assignment.rejection_reason = action.reason
            assignment.updated_at = now
            
            self._storage[assignment.id] = assignment
            
            # Regenerar a designação excluindo o publicador rejeitado
            # (Implementação futura: chamar generate_assignments novamente)
            
            return assignment
        
        else:
            raise ValueError(f"Ação inválida: {action.action}")
    
    def store_generated_assignments(
        self,
        week_id: str,
        date: str,
        assignments: List[GeneratedAssignment],
        duration_map: dict = None
    ) -> List[StoredAssignment]:
        """
        Armazena designações geradas pelo motor.
        
        Args:
            week_id: Identificador da semana
            date: Data da reunião
            assignments: Lista de designações geradas
            duration_map: Mapeamento de título -> duração em minutos
        
        Returns:
            Lista de designações armazenadas
        """
        import uuid
        
        stored = []
        now = datetime.now().isoformat()
        
        default_durations = {
            "Discurso": 10,
            "Joias espirituais": 10,
            "Leitura da Bíblia": 4,
            "Iniciando conversas": 3,
            "Cultivando o interesse": 4,
            "Fazendo discípulos": 5,
            "Necessidades locais": 10,
        }
        
        for a in assignments:
            # Determinar duração
            duration = 0
            if duration_map and a.part_title in duration_map:
                duration = duration_map[a.part_title]
            else:
                for key, dur in default_durations.items():
                    if key.lower() in a.part_title.lower():
                        duration = dur
                        break
            
            stored_assignment = StoredAssignment(
                id=str(uuid.uuid4()),
                week_id=week_id,
                part_id=f"{week_id}-{a.part_title.replace(' ', '-').lower()}",
                part_title=a.part_title,
                part_type=a.part_type.value if hasattr(a.part_type, 'value') else str(a.part_type),
                teaching_category=a.category.value if hasattr(a.category, 'value') else str(a.category),
                principal_publisher_id=a.principal_id,
                principal_publisher_name=a.principal_name,
                secondary_publisher_id=a.secondary_id,
                secondary_publisher_name=a.secondary_name,
                date=date,
                duration_min=duration,
                room=None,
                status=a.status,
                approved_by_elder_id=None,
                approved_by_elder_name=None,
                approval_date=None,
                rejection_reason=None,
                selection_reason=a.reason,
                score=a.score,
                pairing_reason=a.pairing_reason,
                created_at=now,
                updated_at=None
            )
            
            self._storage[stored_assignment.id] = stored_assignment
            stored.append(stored_assignment)
        
        return stored
    
    def get_stats(self) -> dict:
        """Retorna estatísticas das designações"""
        total = len(self._storage)
        by_status = {}
        
        for a in self._storage.values():
            status = a.status.value if hasattr(a.status, 'value') else str(a.status)
            by_status[status] = by_status.get(status, 0) + 1
        
        return {
            "total": total,
            "by_status": by_status,
            "pending_count": by_status.get(ApprovalStatus.PENDING_APPROVAL.value, 0),
            "approved_count": by_status.get(ApprovalStatus.APPROVED.value, 0),
            "rejected_count": by_status.get(ApprovalStatus.REJECTED.value, 0),
        }


# Instância global do serviço (em memória)
# Em produção, usar injeção de dependência com banco de dados
_approval_service: Optional[ApprovalService] = None


def get_approval_service() -> ApprovalService:
    """Retorna a instância do serviço de aprovação"""
    global _approval_service
    if _approval_service is None:
        _approval_service = ApprovalService()
    return _approval_service
