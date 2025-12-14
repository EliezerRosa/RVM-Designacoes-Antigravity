"""
Motor de Alocação de Designações
Responsável por distribuir partes de forma justa entre publicadores elegíveis
"""
from datetime import datetime, timedelta
from typing import Optional
from collections import defaultdict

from app.models.schemas import (
    Publisher,
    Participation,
    ParticipationType,
    AiScheduleResult,
    PublisherStats
)


def is_publisher_available(publisher: Publisher, date: str) -> bool:
    """Verifica se o publicador está disponível na data especificada"""
    availability = publisher.availability
    
    if availability.mode == "always":
        # Disponível sempre, exceto nas datas de exceção
        return date not in availability.exception_dates
    else:
        # Indisponível sempre, exceto nas datas de exceção
        return date in availability.exception_dates


def is_publisher_eligible_for_part(
    publisher: Publisher,
    part_type: ParticipationType,
    part_title: str
) -> tuple[bool, str]:
    """
    Verifica se o publicador pode receber a designação
    Retorna (elegível, motivo)
    """
    # Verificar se está servindo
    if not publisher.is_serving:
        return False, "Não está servindo atualmente"
    
    # Verificar privilégios específicos
    privileges = publisher.privileges
    
    if part_type == ParticipationType.TESOUROS:
        if "Discurso" in part_title or "Joias" in part_title:
            if publisher.gender != "brother":
                return False, "Apenas irmãos podem dar discursos"
            if not privileges.can_give_talks:
                return False, "Não tem privilégio de dar discursos"
        
        if "Leitura" in part_title:
            if publisher.gender != "brother":
                return False, "Apenas irmãos podem fazer leitura da Bíblia"
    
    if part_type == ParticipationType.PRESIDENTE:
        if publisher.gender != "brother":
            return False, "Apenas irmãos podem presidir"
        if not privileges.can_preside:
            return False, "Não tem privilégio de presidir"
    
    if part_type in [ParticipationType.ORACAO_INICIAL, ParticipationType.ORACAO_FINAL]:
        if publisher.gender != "brother":
            return False, "Apenas irmãos batizados podem fazer oração"
        if not publisher.is_baptized:
            return False, "Precisa ser batizado para fazer oração"
        if not privileges.can_pray:
            return False, "Não tem privilégio de oração"
    
    if part_type == ParticipationType.DIRIGENTE:
        if publisher.gender != "brother":
            return False, "Apenas irmãos podem dirigir o Estudo"
        if not privileges.can_conduct_cbs:
            return False, "Não tem privilégio de dirigir o Estudo"
    
    if part_type == ParticipationType.LEITOR:
        if publisher.gender != "brother":
            return False, "Apenas irmãos podem ler no Estudo"
        if not privileges.can_read_cbs:
            return False, "Não tem privilégio de ler no Estudo"
    
    # Verificar privilégios por seção
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
    
    # Verificar se é apenas ajudante
    if publisher.is_helper_only:
        if part_type != ParticipationType.AJUDANTE:
            return False, "Participa apenas como ajudante"
    
    return True, "Elegível"


def get_last_assignment(publisher_name: str, participations: list[Participation]) -> Optional[Participation]:
    """Retorna a última participação do publicador"""
    publisher_participations = [
        p for p in participations 
        if p.publisher_name.lower() == publisher_name.lower()
    ]
    
    if not publisher_participations:
        return None
    
    return max(publisher_participations, key=lambda p: p.date)


def days_since_last_assignment(publisher_name: str, participations: list[Participation]) -> int:
    """Calcula dias desde a última designação"""
    last = get_last_assignment(publisher_name, participations)
    
    if not last:
        return 999  # Nunca participou, prioridade alta
    
    last_date = datetime.fromisoformat(last.date)
    today = datetime.now()
    
    return (today - last_date).days


def rank_candidates(
    candidates: list[Publisher],
    participations: list[Participation],
    part_type: ParticipationType
) -> list[tuple[Publisher, int, str]]:
    """
    Ordena candidatos por elegibilidade e tempo sem participar
    Retorna lista de (publicador, score, motivo)
    """
    ranked = []
    
    for publisher in candidates:
        days = days_since_last_assignment(publisher.name, participations)
        
        # Score baseado em dias sem participar (maior = mais tempo)
        score = days
        
        # Bônus para quem nunca participou
        if days >= 999:
            score = 10000
        
        reason = f"Último: {days} dias atrás" if days < 999 else "Nunca participou"
        ranked.append((publisher, score, reason))
    
    # Ordenar por score decrescente (quem espera mais tem prioridade)
    ranked.sort(key=lambda x: x[1], reverse=True)
    
    return ranked


async def generate_schedule(
    week: str,
    publishers: list[Publisher],
    participations: list[Participation]
) -> list[AiScheduleResult]:
    """
    Gera designações para uma semana usando lógica de distribuição justa
    """
    results = []
    
    # Partes típicas a preencher
    parts_to_fill = [
        ("Leitura da Bíblia", ParticipationType.TESOUROS, False),
        ("Iniciando conversas", ParticipationType.MINISTERIO, True),
        ("Cultivando o interesse", ParticipationType.MINISTERIO, True),
        ("Fazendo discípulos", ParticipationType.MINISTERIO, True),
        ("Discurso", ParticipationType.MINISTERIO, False),
    ]
    
    assigned_this_week = set()
    
    for part_title, part_type, needs_helper in parts_to_fill:
        # Filtrar candidatos elegíveis
        eligible = []
        for publisher in publishers:
            if publisher.name in assigned_this_week:
                continue
            
            is_eligible, reason = is_publisher_eligible_for_part(publisher, part_type, part_title)
            if is_eligible and is_publisher_available(publisher, week):
                eligible.append(publisher)
        
        if not eligible:
            results.append(AiScheduleResult(
                part_title=part_title,
                student_name="[Sem candidato elegível]",
                helper_name=None,
                reason="Nenhum publicador disponível/elegível"
            ))
            continue
        
        # Ranquear candidatos
        ranked = rank_candidates(eligible, participations, part_type)
        
        if ranked:
            best_candidate, score, reason = ranked[0]
            assigned_this_week.add(best_candidate.name)
            
            # Encontrar ajudante se necessário
            helper_name = None
            if needs_helper:
                # Filtrar candidatos para ajudante
                helper_candidates = [
                    p for p in publishers 
                    if p.name not in assigned_this_week
                    and is_publisher_available(p, week)
                ]
                
                if helper_candidates:
                    # Preferir ajudantes do mesmo gênero ou parentesco
                    helper_ranked = rank_candidates(helper_candidates, participations, ParticipationType.AJUDANTE)
                    if helper_ranked:
                        helper = helper_ranked[0][0]
                        helper_name = helper.name
                        assigned_this_week.add(helper.name)
            
            results.append(AiScheduleResult(
                part_title=part_title,
                student_name=best_candidate.name,
                helper_name=helper_name,
                reason=reason
            ))
    
    return results


def calculate_stats(participations: list[Participation]) -> list[PublisherStats]:
    """
    Calcula estatísticas de participação para todos os publicadores
    """
    stats_by_publisher = defaultdict(lambda: {
        "total": 0,
        "dates": [],
        "last": None,
        "last_week": None,
        "last_title": None,
        "last_type": None
    })
    
    for p in participations:
        stats = stats_by_publisher[p.publisher_name]
        stats["total"] += 1
        stats["dates"].append(p.date)
        
        # Atualizar último se for mais recente
        if stats["last"] is None or p.date > stats["last"]:
            stats["last"] = p.date
            stats["last_week"] = p.week
            stats["last_title"] = p.part_title
            stats["last_type"] = p.type
    
    results = []
    for publisher_name, data in stats_by_publisher.items():
        # Calcular média de dias entre participações
        avg_days = None
        if len(data["dates"]) > 1:
            dates_sorted = sorted([datetime.fromisoformat(d) for d in data["dates"]])
            intervals = [(dates_sorted[i+1] - dates_sorted[i]).days for i in range(len(dates_sorted)-1)]
            avg_days = sum(intervals) / len(intervals)
        
        results.append(PublisherStats(
            publisher_id=publisher_name.lower().replace(" ", "-"),
            publisher_name=publisher_name,
            total_assignments=data["total"],
            last_assignment_date=data["last"],
            last_assignment_week=data["last_week"],
            last_assignment_title=data["last_title"],
            last_assignment_type=data["last_type"],
            avg_days_between_assignments=avg_days
        ))
    
    # Ordenar por total de participações (ascendente - menos participações primeiro)
    results.sort(key=lambda x: x.total_assignments)
    
    return results
