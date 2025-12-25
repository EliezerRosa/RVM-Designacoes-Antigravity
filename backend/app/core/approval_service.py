"""
Serviço de Aprovação de Designações
Gerencia fluxo de aprovação hierárquica por Anciãos
Persistência: Supabase (scheduled_assignments)
"""
from datetime import datetime
from typing import Optional, List
from dataclasses import dataclass
import uuid

from app.core.assignment_engine import (
    ApprovalStatus,
    GeneratedAssignment,
    EngineConfig,
    DEFAULT_CONFIG,
)
from app.core.supabase_client import get_supabase
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
    
    # Promoção
    promoted_to_history_id: Optional[str] = None
    promoted_at: Optional[str] = None
    
    # Metadados
    selection_reason: str = ""
    score: float = 0
    pairing_reason: Optional[str] = None
    
    created_at: str = ""
    updated_at: Optional[str] = None


@dataclass
class ApprovalAction:
    """Ação de aprovação/rejeição"""
    assignment_id: str
    action: str  # 'APPROVE', 'REJECT', or 'COMPLETE'
    elder_id: str
    elder_name: str
    reason: Optional[str] = None


def _row_to_stored(row: dict) -> StoredAssignment:
    """Converte row do Supabase para StoredAssignment"""
    return StoredAssignment(
        id=row['id'],
        week_id=row['week_id'],
        part_id=row['part_id'],
        part_title=row['part_title'],
        part_type=row['part_type'],
        teaching_category=row['teaching_category'],
        principal_publisher_id=row['principal_publisher_id'] or '',
        principal_publisher_name=row['principal_publisher_name'],
        secondary_publisher_id=row.get('secondary_publisher_id'),
        secondary_publisher_name=row.get('secondary_publisher_name'),
        date=row['date'],
        duration_min=row.get('duration_min', 0),
        room=row.get('room'),
        status=ApprovalStatus(row['status']),
        approved_by_elder_id=row.get('approved_by_elder_id'),
        approved_by_elder_name=row.get('approved_by_elder_name'),
        approval_date=row.get('approval_date'),
        rejection_reason=row.get('rejection_reason'),
        promoted_to_history_id=row.get('promoted_to_history_id'),
        promoted_at=row.get('promoted_at'),
        selection_reason=row.get('selection_reason', ''),
        score=row.get('score', 0),
        pairing_reason=row.get('pairing_reason'),
        created_at=row.get('created_at', ''),
        updated_at=row.get('updated_at'),
    )


class ApprovalService:
    """Serviço para gerenciar aprovações de designações"""
    
    def __init__(self, use_supabase: bool = True):
        """
        Args:
            use_supabase: Se True, usa Supabase. Se False, usa memória (para testes).
        """
        self._use_supabase = use_supabase
        self._memory_storage: dict = {}  # Fallback para testes
    
    def _get_supabase(self):
        """Retorna cliente Supabase"""
        return get_supabase()
    
    def get_assignment(self, assignment_id: str) -> Optional[StoredAssignment]:
        """Busca uma designação pelo ID"""
        if not self._use_supabase:
            return self._memory_storage.get(assignment_id)
        
        result = self._get_supabase().table('scheduled_assignments').select('*').eq('id', assignment_id).execute()
        if result.data and len(result.data) > 0:
            return _row_to_stored(result.data[0])
        return None
    
    def get_assignments_by_week(self, week_id: str) -> List[StoredAssignment]:
        """Lista todas as designações de uma semana"""
        if not self._use_supabase:
            return [a for a in self._memory_storage.values() if a.week_id == week_id]
        
        result = self._get_supabase().table('scheduled_assignments').select('*').eq('week_id', week_id).order('created_at').execute()
        return [_row_to_stored(row) for row in (result.data or [])]
    
    def get_pending_approvals(self) -> List[StoredAssignment]:
        """Lista todas as designações pendentes de aprovação"""
        if not self._use_supabase:
            return [a for a in self._memory_storage.values() if a.status == ApprovalStatus.PENDING_APPROVAL]
        
        result = self._get_supabase().table('scheduled_assignments').select('*').eq('status', 'PENDING_APPROVAL').execute()
        return [_row_to_stored(row) for row in (result.data or [])]
    
    def get_approved(self) -> List[StoredAssignment]:
        """Lista todas as designações aprovadas"""
        if not self._use_supabase:
            return [a for a in self._memory_storage.values() if a.status == ApprovalStatus.APPROVED]
        
        result = self._get_supabase().table('scheduled_assignments').select('*').eq('status', 'APPROVED').execute()
        return [_row_to_stored(row) for row in (result.data or [])]
    
    def process_approval(
        self,
        action: ApprovalAction,
        publishers: List[Publisher],
        participations: List[Participation],
        parts_to_fill: List[tuple],
        config: EngineConfig = DEFAULT_CONFIG
    ) -> StoredAssignment:
        """
        Processa uma ação de aprovação, rejeição ou conclusão.
        """
        assignment = self.get_assignment(action.assignment_id)
        if not assignment:
            raise ValueError(f"Designação não encontrada: {action.assignment_id}")
        
        now = datetime.now().isoformat()
        updates = {'updated_at': now}
        
        if action.action == 'APPROVE':
            updates['status'] = ApprovalStatus.APPROVED.value
            updates['approved_by_elder_id'] = action.elder_id
            updates['approved_by_elder_name'] = action.elder_name
            updates['approval_date'] = now
            
        elif action.action == 'REJECT':
            updates['status'] = ApprovalStatus.REJECTED.value
            updates['rejection_reason'] = action.reason
            
        elif action.action == 'COMPLETE':
            updates['status'] = ApprovalStatus.COMPLETED.value
            
        else:
            raise ValueError(f"Ação inválida: {action.action}")
        
        if self._use_supabase:
            result = self._get_supabase().table('scheduled_assignments').update(updates).eq('id', action.assignment_id).execute()
            if result.data:
                return _row_to_stored(result.data[0])
        else:
            for key, value in updates.items():
                setattr(assignment, key, value)
            self._memory_storage[assignment.id] = assignment
        
        return assignment
    
    def mark_as_completed(self, assignment_ids: List[str]) -> List[StoredAssignment]:
        """Marca múltiplas designações como COMPLETED (reunião aconteceu)"""
        if not self._use_supabase:
            results = []
            for aid in assignment_ids:
                if aid in self._memory_storage:
                    self._memory_storage[aid].status = ApprovalStatus.COMPLETED
                    results.append(self._memory_storage[aid])
            return results
        
        now = datetime.now().isoformat()
        self._get_supabase().table('scheduled_assignments').update({
            'status': ApprovalStatus.COMPLETED.value,
            'updated_at': now
        }).in_('id', assignment_ids).execute()
        
        result = self._get_supabase().table('scheduled_assignments').select('*').in_('id', assignment_ids).execute()
        return [_row_to_stored(row) for row in (result.data or [])]
    
    def promote_to_history(self, assignment_ids: List[str]) -> List[str]:
        """
        Promove designações COMPLETED para history_records.
        Retorna lista de IDs dos HistoryRecords criados.
        """
        # Buscar designações
        if not self._use_supabase:
            assignments = [self._memory_storage[aid] for aid in assignment_ids if aid in self._memory_storage]
        else:
            result = self._get_supabase().table('scheduled_assignments').select('*').in_('id', assignment_ids).eq('status', 'COMPLETED').execute()
            assignments = [_row_to_stored(row) for row in (result.data or [])]
        
        if not assignments:
            raise ValueError("Nenhuma designação COMPLETED encontrada")
        
        # Criar HistoryRecords
        history_ids = []
        now = datetime.now().isoformat()
        
        for a in assignments:
            history_id = str(uuid.uuid4())
            history_ids.append(history_id)
            
            history_record = {
                'id': history_id,
                'week_id': a.week_id,
                'semana': a.date,
                'status': 'APPROVED',
                'import_source': 'ScheduledAssignment',
                'import_batch_id': f'promotion-{now[:10]}',
                'data': {
                    'id': history_id,
                    'weekId': a.week_id,
                    'weekDisplay': a.week_id,
                    'date': a.date,
                    'semana': a.date,
                    'partTitle': a.part_title,
                    'tipoParte': a.part_type,
                    'rawPublisherName': a.principal_publisher_name,
                    'nomeOriginal': a.principal_publisher_name,
                    'resolvedPublisherId': a.principal_publisher_id,
                    'resolvedPublisherName': a.principal_publisher_name,
                    'publicadorId': a.principal_publisher_id,
                    'publicadorNome': a.principal_publisher_name,
                    'participationRole': 'Titular',
                    'funcao': 'Titular',
                    'status': 'APPROVED',
                    'importSource': 'ScheduledAssignment',
                    'importBatchId': f'promotion-{now[:10]}',
                    'createdAt': now,
                }
            }
            
            if self._use_supabase:
                self._get_supabase().table('history_records').insert(history_record).execute()
                
                # Atualizar a designação com referência ao histórico
                self._get_supabase().table('scheduled_assignments').update({
                    'promoted_to_history_id': history_id,
                    'promoted_at': now,
                    'updated_at': now
                }).eq('id', a.id).execute()
        
        return history_ids
    
    def store_generated_assignments(
        self,
        week_id: str,
        date: str,
        assignments: List[GeneratedAssignment],
        duration_map: dict = None
    ) -> List[StoredAssignment]:
        """
        Armazena designações geradas pelo motor.
        """
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
        
        stored_list = []
        
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
            
            assignment_id = str(uuid.uuid4())
            part_id = f"{week_id}-{a.part_title.replace(' ', '-').lower()}"
            
            row = {
                'id': assignment_id,
                'week_id': week_id,
                'part_id': part_id,
                'part_title': a.part_title,
                'part_type': a.part_type.value if hasattr(a.part_type, 'value') else str(a.part_type),
                'teaching_category': a.category.value if hasattr(a.category, 'value') else str(a.category),
                'principal_publisher_id': a.principal_id or None,
                'principal_publisher_name': a.principal_name,
                'secondary_publisher_id': a.secondary_id or None,
                'secondary_publisher_name': a.secondary_name,
                'date': date,
                'duration_min': duration,
                'status': a.status.value if hasattr(a.status, 'value') else str(a.status),
                'selection_reason': a.reason,
                'score': a.score,
                'pairing_reason': a.pairing_reason,
                'created_at': now,
            }
            
            if self._use_supabase:
                self._get_supabase().table('scheduled_assignments').insert(row).execute()
            
            stored = StoredAssignment(
                id=assignment_id,
                week_id=week_id,
                part_id=part_id,
                part_title=a.part_title,
                part_type=row['part_type'],
                teaching_category=row['teaching_category'],
                principal_publisher_id=a.principal_id or '',
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
            
            if not self._use_supabase:
                self._memory_storage[stored.id] = stored
            
            stored_list.append(stored)
        
        return stored_list
    
    def get_stats(self) -> dict:
        """Retorna estatísticas das designações"""
        if not self._use_supabase:
            total = len(self._memory_storage)
            by_status = {}
            for a in self._memory_storage.values():
                status = a.status.value if hasattr(a.status, 'value') else str(a.status)
                by_status[status] = by_status.get(status, 0) + 1
        else:
            result = self._get_supabase().table('scheduled_assignments').select('status').execute()
            by_status = {}
            for row in (result.data or []):
                by_status[row['status']] = by_status.get(row['status'], 0) + 1
            total = len(result.data or [])
        
        return {
            "total": total,
            "by_status": by_status,
            "pending_count": by_status.get('PENDING_APPROVAL', 0),
            "approved_count": by_status.get('APPROVED', 0),
            "rejected_count": by_status.get('REJECTED', 0),
            "completed_count": by_status.get('COMPLETED', 0),
        }


# Instância global do serviço
_approval_service: Optional[ApprovalService] = None


def get_approval_service(use_supabase: bool = True) -> ApprovalService:
    """Retorna a instância do serviço de aprovação"""
    global _approval_service
    if _approval_service is None:
        _approval_service = ApprovalService(use_supabase=use_supabase)
    return _approval_service
