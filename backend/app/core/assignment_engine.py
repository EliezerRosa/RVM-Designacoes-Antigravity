"""
Motor de Designações Baseado em Regras
Sistema determinístico para alocação de partes na reunião RV&M
"""
from datetime import datetime, timedelta
from typing import Optional, List, Tuple
from dataclasses import dataclass
from enum import Enum

from app.models.schemas import (
    Publisher,
    Participation,
    ParticipationType,
)


# ============================================================================
# ENUMS E CONSTANTES
# ============================================================================

class ApprovalStatus(str, Enum):
    DRAFT = "DRAFT"
    PENDING_APPROVAL = "PENDING_APPROVAL"
    APPROVED = "APPROVED"
    REJECTED = "REJECTED"
    COMPLETED = "COMPLETED"


class TeachingCategory(str, Enum):
    TEACHING = "TEACHING"   # Peso 1.0 - Discursos, Joias, Necessidades Locais
    STUDENT = "STUDENT"     # Peso 0.5 - Leitura, Demonstrações titular
    HELPER = "HELPER"       # Peso 0.1 - Ajudante em demonstrações


@dataclass
class EngineConfig:
    """Configuração do Motor de Designações"""
    # Pesos por categoria
    weight_teaching: float = 1.0
    weight_student: float = 0.5
    weight_helper: float = 0.1
    
    # Cooldown
    cooldown_same_part_weeks: int = 6
    cooldown_same_section_weeks: int = 2
    cooldown_penalty_points: int = 500
    
    # Bônus
    bonus_never_participated: int = 1000
    
    # Pareamento
    prefer_same_gender: bool = True
    prefer_family: bool = True


DEFAULT_CONFIG = EngineConfig()


# ============================================================================
# MAPEAMENTO DE CATEGORIAS
# ============================================================================

PART_CATEGORY_MAP = {
    # TEACHING - Peso máximo (1.0)
    "Discurso": TeachingCategory.TEACHING,
    "Joias espirituais": TeachingCategory.TEACHING,
    "Joias": TeachingCategory.TEACHING,
    "Necessidades locais": TeachingCategory.TEACHING,
    "Necessidades da congregação": TeachingCategory.TEACHING,
    
    # STUDENT - Peso médio (0.5)
    "Leitura da Bíblia": TeachingCategory.STUDENT,
    "Leitura": TeachingCategory.STUDENT,
    "Iniciando conversas": TeachingCategory.STUDENT,
    "Cultivando o interesse": TeachingCategory.STUDENT,
    "Fazendo discípulos": TeachingCategory.STUDENT,
    "Explicando suas crenças": TeachingCategory.STUDENT,
    "Discurso do estudante": TeachingCategory.STUDENT,
    
    # HELPER - Peso mínimo (0.1)
    "Ajudante": TeachingCategory.HELPER,
}


def get_category_for_part(part_title: str) -> TeachingCategory:
    """Determina a categoria de ensino baseado no título da parte"""
    for key, category in PART_CATEGORY_MAP.items():
        if key.lower() in part_title.lower():
            return category
    # Default: STUDENT para demonstrações não mapeadas
    return TeachingCategory.STUDENT


def get_weight_for_category(category: TeachingCategory, config: EngineConfig) -> float:
    """Retorna o peso para uma categoria"""
    if category == TeachingCategory.TEACHING:
        return config.weight_teaching
    elif category == TeachingCategory.STUDENT:
        return config.weight_student
    else:
        return config.weight_helper


# ============================================================================
# MÓDULO 1: FILTRO RÍGIDO
# ============================================================================

@dataclass
class FilterResult:
    """Resultado da filtragem"""
    eligible: List[Publisher]
    rejected: List[Tuple[Publisher, str]]  # (publisher, motivo)


def is_publisher_available(publisher: Publisher, date: str) -> bool:
    """Verifica se o publicador está disponível na data"""
    availability = publisher.availability
    
    if availability.mode == "always":
        return date not in availability.exception_dates
    else:
        return date in availability.exception_dates


def apply_rigid_filters(
    publishers: List[Publisher],
    part_type: ParticipationType,
    part_title: str,
    date: str,
    already_assigned: List[str],
    config: EngineConfig = DEFAULT_CONFIG
) -> FilterResult:
    """
    Aplica filtros rígidos que eliminam candidatos.
    Retorna lista de elegíveis e lista de rejeitados com motivos.
    """
    eligible = []
    rejected = []
    
    for publisher in publishers:
        # Regra 1: Já designado nesta reunião
        if publisher.id in already_assigned or publisher.name in already_assigned:
            rejected.append((publisher, "Já tem designação nesta reunião"))
            continue
        
        # Regra 2: Status de serviço
        if not publisher.is_serving:
            rejected.append((publisher, "Não está servindo atualmente"))
            continue
        
        # Regra 3: Exclusões especiais
        if getattr(publisher, 'is_not_qualified', False):
            rejected.append((publisher, "Não está apto"))
            continue
            
        if getattr(publisher, 'requested_no_participation', False):
            rejected.append((publisher, "Pediu para não participar"))
            continue
        
        # Regra 4: Disponibilidade
        if not is_publisher_available(publisher, date):
            rejected.append((publisher, f"Indisponível em {date}"))
            continue
        
        # Regra 5: Gênero e privilégios específicos por tipo de parte
        is_eligible, reason = check_part_eligibility(publisher, part_type, part_title)
        if not is_eligible:
            rejected.append((publisher, reason))
            continue
        
        # Regra 6: Privilégios por seção
        section_eligible, section_reason = check_section_privileges(publisher, part_type)
        if not section_eligible:
            rejected.append((publisher, section_reason))
            continue
        
        # Regra 7: Apenas ajudante
        if publisher.is_helper_only and part_type != ParticipationType.AJUDANTE:
            rejected.append((publisher, "Participa apenas como ajudante"))
            continue
        
        eligible.append(publisher)
    
    return FilterResult(eligible=eligible, rejected=rejected)


def check_part_eligibility(
    publisher: Publisher,
    part_type: ParticipationType,
    part_title: str
) -> Tuple[bool, str]:
    """Verifica privilégios específicos para o tipo de parte"""
    privileges = publisher.privileges
    
    # Tesouros - Discursos e Joias
    if part_type == ParticipationType.TESOUROS:
        if "Discurso" in part_title or "Joias" in part_title:
            if publisher.gender != "brother":
                return False, "Apenas irmãos podem dar discursos"
            if not privileges.can_give_talks:
                return False, "Não tem privilégio de dar discursos"
        
        if "Leitura" in part_title:
            if publisher.gender != "brother":
                return False, "Apenas irmãos podem fazer leitura da Bíblia"
    
    # Presidente
    if part_type == ParticipationType.PRESIDENTE:
        if publisher.gender != "brother":
            return False, "Apenas irmãos podem presidir"
        if not privileges.can_preside:
            return False, "Não tem privilégio de presidir"
    
    # Orações
    if part_type in [ParticipationType.ORACAO_INICIAL, ParticipationType.ORACAO_FINAL]:
        if publisher.gender != "brother":
            return False, "Apenas irmãos batizados podem fazer oração"
        if not publisher.is_baptized:
            return False, "Precisa ser batizado para fazer oração"
        if not privileges.can_pray:
            return False, "Não tem privilégio de oração"
    
    # Dirigente EBC
    if part_type == ParticipationType.DIRIGENTE:
        if publisher.gender != "brother":
            return False, "Apenas irmãos podem dirigir o Estudo"
        if not privileges.can_conduct_cbs:
            return False, "Não tem privilégio de dirigir o Estudo"
    
    # Leitor EBC
    if part_type == ParticipationType.LEITOR:
        if publisher.gender != "brother":
            return False, "Apenas irmãos podem ler no Estudo"
        if not privileges.can_read_cbs:
            return False, "Não tem privilégio de ler no Estudo"
    
    return True, "Elegível"


def check_section_privileges(
    publisher: Publisher,
    part_type: ParticipationType
) -> Tuple[bool, str]:
    """Verifica privilégios por seção da reunião"""
    section_privileges = publisher.privileges_by_section
    
    if part_type == ParticipationType.TESOUROS:
        if not section_privileges.can_participate_in_treasures:
            return False, "Não participa na seção Tesouros"
    
    if part_type == ParticipationType.MINISTERIO:
        if not section_privileges.can_participate_in_ministry:
            return False, "Não participa na seção Ministério"
    
    if part_type == ParticipationType.VIDA_CRISTA:
        if not section_privileges.can_participate_in_life:
            return False, "Não participa na seção Nossa Vida"
    
    return True, "Elegível"


# ============================================================================
# MÓDULO 2: RANQUEAMENTO PONDERADO
# ============================================================================

@dataclass
class RankedCandidate:
    """Candidato com pontuação calculada"""
    publisher: Publisher
    score: float
    days_since_last: int
    category_weight: float
    cooldown_penalty: float
    never_participated_bonus: float
    reason: str


def calculate_days_since_last(
    publisher_name: str,
    participations: List[Participation],
    reference_date: Optional[datetime] = None
) -> int:
    """Calcula dias desde a última participação do publicador"""
    if reference_date is None:
        reference_date = datetime.now()
    
    publisher_participations = [
        p for p in participations
        if p.publisher_name.lower() == publisher_name.lower()
    ]
    
    if not publisher_participations:
        return 9999  # Nunca participou
    
    # Encontrar a data mais recente
    last_date = max(
        datetime.fromisoformat(p.date) 
        for p in publisher_participations
    )
    
    return (reference_date - last_date).days


def calculate_cooldown_penalty(
    publisher_name: str,
    part_title: str,
    participations: List[Participation],
    config: EngineConfig
) -> float:
    """Calcula penalidade se fez a mesma parte recentemente"""
    weeks_limit = config.cooldown_same_part_weeks
    cutoff_date = datetime.now() - timedelta(weeks=weeks_limit)
    
    for p in participations:
        if p.publisher_name.lower() != publisher_name.lower():
            continue
        
        try:
            part_date = datetime.fromisoformat(p.date)
        except:
            continue
        
        if part_date < cutoff_date:
            continue
        
        # Verificar se é a mesma parte
        if p.part_title.lower() == part_title.lower():
            return config.cooldown_penalty_points
    
    return 0


def rank_candidates(
    candidates: List[Publisher],
    participations: List[Participation],
    part_title: str,
    category: TeachingCategory,
    config: EngineConfig = DEFAULT_CONFIG
) -> List[RankedCandidate]:
    """
    Rankeia candidatos por prioridade ponderada.
    Fórmula: Score = (Dias × Peso) - Penalidade + Bônus
    """
    ranked = []
    weight = get_weight_for_category(category, config)
    
    for publisher in candidates:
        days = calculate_days_since_last(publisher.name, participations)
        cooldown = calculate_cooldown_penalty(
            publisher.name, part_title, participations, config
        )
        bonus = config.bonus_never_participated if days >= 9999 else 0
        
        # Fórmula de pontuação
        score = (days * weight) - cooldown + bonus
        
        # Construir razão
        if days >= 9999:
            reason = "Nunca participou"
        elif cooldown > 0:
            reason = f"{days} dias sem participar (penalidade por repetição)"
        else:
            reason = f"{days} dias sem participar"
        
        ranked.append(RankedCandidate(
            publisher=publisher,
            score=score,
            days_since_last=days if days < 9999 else -1,
            category_weight=weight,
            cooldown_penalty=cooldown,
            never_participated_bonus=bonus,
            reason=reason
        ))
    
    # Ordenar por score decrescente
    ranked.sort(key=lambda x: x.score, reverse=True)
    
    return ranked


# ============================================================================
# MÓDULO 3: PAREAMENTO DE AJUDANTE
# ============================================================================

@dataclass
class PairingResult:
    """Resultado do pareamento estudante/ajudante"""
    student: Publisher
    helper: Optional[Publisher]
    pairing_reason: str


def find_helper(
    student: Publisher,
    eligible_helpers: List[Publisher],
    participations: List[Participation],
    config: EngineConfig = DEFAULT_CONFIG
) -> PairingResult:
    """Encontra o melhor ajudante para o estudante"""
    if not eligible_helpers:
        return PairingResult(
            student=student,
            helper=None,
            pairing_reason="Nenhum ajudante disponível"
        )
    
    # Filtrar candidatos a ajudante
    helper_candidates = [h for h in eligible_helpers if h.id != student.id]
    
    if not helper_candidates:
        return PairingResult(
            student=student,
            helper=None,
            pairing_reason="Nenhum ajudante elegível após exclusões"
        )
    
    # Ranquear candidatos
    ranked = rank_candidates(
        helper_candidates,
        participations,
        "Ajudante",
        TeachingCategory.HELPER,
        config
    )
    
    # Aplicar preferências de pareamento
    best_helper = None
    best_reason = ""
    
    for candidate in ranked:
        helper = candidate.publisher
        
        # Preferência 1: Vínculo familiar
        if config.prefer_family and student.parent_ids:
            if helper.id in student.parent_ids:
                best_helper = helper
                best_reason = f"Familiar do estudante ({candidate.reason})"
                break
        
        # Preferência 2: Mesmo gênero
        if config.prefer_same_gender:
            if helper.gender == student.gender:
                if best_helper is None:
                    best_helper = helper
                    best_reason = f"Mesmo gênero ({candidate.reason})"
        
        # Se não encontrou por preferência, pegar o primeiro do ranking
        if best_helper is None:
            best_helper = helper
            best_reason = candidate.reason
    
    return PairingResult(
        student=student,
        helper=best_helper,
        pairing_reason=best_reason
    )


# ============================================================================
# MÓDULO 4: VERIFICAÇÃO DE APROVAÇÃO
# ============================================================================

def check_approval_required(
    publisher: Publisher,
    part_type: ParticipationType,
    part_title: str
) -> ApprovalStatus:
    """
    Determina se a designação requer aprovação hierárquica.
    Retorna PENDING_APPROVAL ou DRAFT.
    """
    # Partes que sempre requerem aprovação de Ancião
    approval_required_parts = [
        ParticipationType.PRESIDENTE,
        ParticipationType.DIRIGENTE,
    ]
    
    if part_type in approval_required_parts:
        return ApprovalStatus.PENDING_APPROVAL
    
    # Discursos de ensino requerem aprovação
    if "Discurso" in part_title and "estudante" not in part_title.lower():
        return ApprovalStatus.PENDING_APPROVAL
    
    # Publicador em revisão
    if getattr(publisher, 'approval_needed', False):
        return ApprovalStatus.PENDING_APPROVAL
    
    return ApprovalStatus.DRAFT


# ============================================================================
# MÓDULO 5: MOTOR PRINCIPAL
# ============================================================================

@dataclass
class GeneratedAssignment:
    """Designação gerada pelo motor"""
    part_title: str
    part_type: ParticipationType
    category: TeachingCategory
    principal_name: str
    principal_id: str
    secondary_name: Optional[str]
    secondary_id: Optional[str]
    status: ApprovalStatus
    score: float
    reason: str
    pairing_reason: Optional[str]


async def generate_assignments(
    week: str,
    date: str,
    parts_to_fill: List[Tuple[str, ParticipationType, bool]],  # (título, tipo, requer_ajudante)
    publishers: List[Publisher],
    participations: List[Participation],
    config: EngineConfig = DEFAULT_CONFIG
) -> List[GeneratedAssignment]:
    """
    Motor principal de geração de designações.
    
    Args:
        week: Identificador da semana (ex: "2024-W01")
        date: Data da reunião (ISO format)
        parts_to_fill: Lista de (título, tipo, requer_ajudante)
        publishers: Lista de todos os publicadores
        participations: Histórico de participações
        config: Configuração do motor
    
    Returns:
        Lista de designações geradas
    """
    results = []
    assigned_this_week = set()
    
    for part_title, part_type, needs_helper in parts_to_fill:
        category = get_category_for_part(part_title)
        
        # Passo 1: Filtro Rígido
        filter_result = apply_rigid_filters(
            publishers=publishers,
            part_type=part_type,
            part_title=part_title,
            date=date,
            already_assigned=list(assigned_this_week),
            config=config
        )
        
        if not filter_result.eligible:
            results.append(GeneratedAssignment(
                part_title=part_title,
                part_type=part_type,
                category=category,
                principal_name="[Sem candidato elegível]",
                principal_id="",
                secondary_name=None,
                secondary_id=None,
                status=ApprovalStatus.DRAFT,
                score=0,
                reason="Nenhum publicador disponível/elegível",
                pairing_reason=None
            ))
            continue
        
        # Passo 2: Ranqueamento
        ranked = rank_candidates(
            candidates=filter_result.eligible,
            participations=participations,
            part_title=part_title,
            category=category,
            config=config
        )
        
        # Passo 3: Seleção do melhor candidato
        best = ranked[0]
        assigned_this_week.add(best.publisher.id)
        assigned_this_week.add(best.publisher.name)
        
        # Passo 4: Pareamento de ajudante (se necessário)
        helper_name = None
        helper_id = None
        pairing_reason = None
        
        if needs_helper:
            # Filtrar elegíveis para ajudante (remover o titular)
            helper_eligible = [p for p in filter_result.eligible if p.id != best.publisher.id]
            
            pairing = find_helper(
                student=best.publisher,
                eligible_helpers=helper_eligible,
                participations=participations,
                config=config
            )
            
            if pairing.helper:
                helper_name = pairing.helper.name
                helper_id = pairing.helper.id
                assigned_this_week.add(pairing.helper.id)
                assigned_this_week.add(pairing.helper.name)
            
            pairing_reason = pairing.pairing_reason
        
        # Passo 5: Verificação de aprovação
        status = check_approval_required(
            publisher=best.publisher,
            part_type=part_type,
            part_title=part_title
        )
        
        results.append(GeneratedAssignment(
            part_title=part_title,
            part_type=part_type,
            category=category,
            principal_name=best.publisher.name,
            principal_id=best.publisher.id,
            secondary_name=helper_name,
            secondary_id=helper_id,
            status=status,
            score=best.score,
            reason=best.reason,
            pairing_reason=pairing_reason
        ))
    
    return results
