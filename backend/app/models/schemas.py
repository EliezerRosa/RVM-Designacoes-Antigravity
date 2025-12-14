"""
Modelos de dados Pydantic para a API
"""
from datetime import datetime
from enum import Enum
from typing import Optional
from pydantic import BaseModel, Field


class Gender(str, Enum):
    BROTHER = "brother"
    SISTER = "sister"


class Condition(str, Enum):
    ANCIAO = "Ancião"
    SERVO_MINISTERIAL = "Servo Ministerial"
    PUBLICADOR = "Publicador"


class AgeGroup(str, Enum):
    ADULTO = "Adulto"
    JOVEM = "Jovem"
    CRIANCA = "Criança"


class ParticipationType(str, Enum):
    PRESIDENTE = "Presidente"
    ORACAO_INICIAL = "Oração Inicial"
    ORACAO_FINAL = "Oração Final"
    TESOUROS = "Tesouros da Palavra de Deus"
    MINISTERIO = "Faça Seu Melhor no Ministério"
    VIDA_CRISTA = "Nossa Vida Cristã"
    DIRIGENTE = "Dirigente do EBC"
    LEITOR = "Leitor do EBC"
    AJUDANTE = "Ajudante"
    CANTICO = "Cântico"
    COMENTARIOS_FINAIS = "Comentários Finais"


class PublisherPrivileges(BaseModel):
    can_give_talks: bool = False
    can_conduct_cbs: bool = False
    can_read_cbs: bool = False
    can_pray: bool = False
    can_preside: bool = False


class PublisherPrivilegesBySection(BaseModel):
    can_participate_in_treasures: bool = True
    can_participate_in_ministry: bool = True
    can_participate_in_life: bool = True


class PublisherAvailability(BaseModel):
    mode: str = "always"
    exception_dates: list[str] = Field(default_factory=list)


class Publisher(BaseModel):
    id: str
    name: str
    gender: Gender
    condition: Condition
    phone: str = ""
    is_baptized: bool = False
    is_serving: bool = True
    age_group: AgeGroup = AgeGroup.ADULTO
    parent_ids: list[str] = Field(default_factory=list)
    is_helper_only: bool = False
    can_pair_with_non_parent: bool = True
    privileges: PublisherPrivileges = Field(default_factory=PublisherPrivileges)
    privileges_by_section: PublisherPrivilegesBySection = Field(
        default_factory=PublisherPrivilegesBySection
    )
    availability: PublisherAvailability = Field(default_factory=PublisherAvailability)
    aliases: list[str] = Field(default_factory=list)


class Participation(BaseModel):
    id: str
    publisher_name: str
    week: str
    date: str
    part_title: str
    type: ParticipationType
    duration: Optional[int] = None


class Assignment(BaseModel):
    id: str
    date: str
    congregation: str
    part_number: int
    section: str
    title: str
    student: str
    assistant: Optional[str] = None
    duration_min: int
    room: Optional[str] = None


class S89Request(BaseModel):
    assignment: Assignment


class WorkbookExtractRequest(BaseModel):
    file_data: str  # Base64 encoded PDF
    file_name: str


class WorkbookExtractResponse(BaseModel):
    weeks: list[dict]
    success: bool
    message: str


class AiScheduleRequest(BaseModel):
    week: str
    workbook_id: str
    publishers: list[Publisher]
    participations: list[Participation]


class AiScheduleResult(BaseModel):
    part_title: str
    student_name: str
    helper_name: Optional[str] = None
    reason: str


class PublisherStats(BaseModel):
    publisher_id: str
    publisher_name: str
    total_assignments: int
    last_assignment_date: Optional[str] = None
    last_assignment_week: Optional[str] = None
    last_assignment_title: Optional[str] = None
    last_assignment_type: Optional[ParticipationType] = None
    avg_days_between_assignments: Optional[float] = None
