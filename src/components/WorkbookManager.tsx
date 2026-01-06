/**
 * WorkbookManager - Gerenciador de Apostila
 * Componente principal para upload, CRUD e promoção de partes
 */

import { useState, useEffect, useMemo } from 'react';
import * as XLSX from 'xlsx';
import type { WorkbookPart, Publisher, HistoryRecord } from '../types';
import { EnumModalidade, EnumFuncao } from '../types';
import { workbookService, type WorkbookExcelRow } from '../services/workbookService';
import { checkEligibility, isPastWeekDate, getThursdayFromDate } from '../services/eligibilityService';
import { selectBestCandidate } from '../services/cooldownService';
import { loadCompletedParticipations } from '../services/historyAdapter';
import { localNeedsService } from '../services/localNeedsService';
import { PublisherSelect } from './PublisherSelect';
import { SpecialEventsManager } from './SpecialEventsManager';
import { LocalNeedsQueue } from './LocalNeedsQueue';
import { getStatusConfig } from '../constants/status';
import { downloadS140, downloadS140MultiWeek } from '../services/s140Generator';
import { downloadS140RoomB } from '../services/s140GeneratorRoomB';
import { downloadS140RoomBEV } from '../services/s140GeneratorRoomBEvents';
import { PartEditModal } from './PartEditModal';
import { BulkResetModal } from './BulkResetModal';


import { Tooltip } from './Tooltip';
import { ReportsTab } from './ReportsTab';
import { generateSessionReport } from '../services/analyticsService';
import type { AnalyticsSummary } from '../services/analyticsService';
import {
    validatePartsBeforeGeneration,
    getGrupoPresidentes,
    getGrupoEnsino,
    getGrupoEnsinoExpandido,
    getGrupoEstudante,
    rankByPriority
} from '../services/linearRotationService';

interface Props {
    publishers: Publisher[];
}

// Colunas esperadas no Excel da apostila (deve corresponder ao extract_detailed_parts.py)
const EXPECTED_COLUMNS = [
    'id', 'weekId', 'weekDisplay', 'date', 'section', 'tipoParte',
    'modalidade', 'tituloParte', 'descricaoParte', 'detalhesParte',
    'seq', 'funcao', 'duracao', 'horaInicio', 'horaFim', 'rawPublisherName', 'status'
];

// ========================================================================
// Funções de Temporalidade - "Semana Atual" = contém a segunda-feira
// ========================================================================

/**
 * Retorna a segunda-feira da semana atual (meia-noite).
 */
const getMondayOfCurrentWeek = (): Date => {
    const today = new Date();
    const dayOfWeek = today.getDay(); // 0=Dom, 1=Seg, 2=Ter, ...
    // Se hoje é domingo (0), volta 6 dias; senão, volta (dayOfWeek - 1) dias
    const daysToSubtract = dayOfWeek === 0 ? 6 : dayOfWeek - 1;
    const monday = new Date(today);
    monday.setDate(today.getDate() - daysToSubtract);
    monday.setHours(0, 0, 0, 0);
    return monday;
};

/**
 * Verifica se uma parte pertence a uma semana passada.
 * Usa o campo `date` da parte (ex: "2024-01-04" ou "04/01/2024").
 */
const isPartInPastWeek = (partDate: string): boolean => {
    if (!partDate) return false;

    // Parse da data (suporta YYYY-MM-DD ou DD/MM/YYYY)
    let dateObj: Date;
    if (partDate.match(/^\d{4}-\d{2}-\d{2}/)) {
        dateObj = new Date(partDate + 'T12:00:00');
    } else {
        const dmy = partDate.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
        if (dmy) {
            dateObj = new Date(`${dmy[3]}-${dmy[2].padStart(2, '0')}-${dmy[1].padStart(2, '0')}T12:00:00`);
        } else {
            dateObj = new Date(partDate);
        }
    }

    if (isNaN(dateObj.getTime())) return false;

    const mondayOfCurrentWeek = getMondayOfCurrentWeek();
    return dateObj < mondayOfCurrentWeek;
};

export function WorkbookManager({ publishers }: Props) {
    // ========================================================================
    // Estado
    // ========================================================================

    const [parts, setParts] = useState<WorkbookPart[]>([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [successMessage, setSuccessMessage] = useState<string | null>(null);

    // Filtros - carregar do localStorage para persistência
    const [filterWeek, setFilterWeek] = useState<string>(() => localStorage.getItem('wm_filterWeek') || '');
    const [filterSection, setFilterSection] = useState<string>(() => localStorage.getItem('wm_filterSection') || '');
    const [filterTipo, setFilterTipo] = useState<string>(() => localStorage.getItem('wm_filterTipo') || '');
    const [filterStatus, setFilterStatus] = useState<string>(() => localStorage.getItem('wm_filterStatus') || '');
    const [filterFuncao, setFilterFuncao] = useState<string>('all');
    const [searchText, setSearchText] = useState<string>('');

    // Estado do Modal de Edição
    const [isEditModalOpen, setIsEditModalOpen] = useState(false);
    const [editingPart, setEditingPart] = useState<WorkbookPart | null>(null);

    // Estado do Modal de Fila de Necessidades Locais
    const [isLocalNeedsQueueOpen, setIsLocalNeedsQueueOpen] = useState(false);

    // Estado do Modal de Eventos Especiais
    const [isEventsModalOpen, setIsEventsModalOpen] = useState(false);

    // Estado do Modal de S-140 Multi-Semanas
    const [isS140MultiModalOpen, setIsS140MultiModalOpen] = useState(false);
    const [s140StartWeek, setS140StartWeek] = useState('');
    const [s140EndWeek, setS140EndWeek] = useState('');

    // Estado para Relatórios
    const [reportData, setReportData] = useState<AnalyticsSummary | null>(null);
    const [activeTab, setActiveTab] = useState<'planning' | 'reports'>('planning');

    // Estado do Modal de Reset em Lote
    const [isBulkResetModalOpen, setIsBulkResetModalOpen] = useState(false);

    // Paginação
    const [currentPage, setCurrentPage] = useState(1);

    // Toggle para exibir partes ocultas (Cânticos, Comentários, Oração Inicial, Elogios)
    const [showHiddenParts, setShowHiddenParts] = useState(false);


    // ========================================================================
    // Persistir filtros no localStorage
    // ========================================================================
    useEffect(() => {
        localStorage.setItem('wm_filterWeek', filterWeek);
        localStorage.setItem('wm_filterSection', filterSection);
        localStorage.setItem('wm_filterTipo', filterTipo);
        localStorage.setItem('wm_filterStatus', filterStatus);
        localStorage.setItem('wm_filterFuncao', filterFuncao);
        localStorage.setItem('wm_searchText', searchText);
        setCurrentPage(1); // Resetar página ao filtrar
    }, [filterWeek, filterSection, filterTipo, filterStatus, filterFuncao, searchText]);

    // ========================================================================
    // Carregar dados - COM FILTROS SERVER-SIDE
    // ========================================================================

    // Função para carregar partes com filtros server-side
    const loadPartsWithFilters = async (filters?: {
        weekId?: string;
        section?: string;
        tipoParte?: string;
        status?: string;
        funcao?: string;
    }) => {
        try {
            setLoading(true);
            const data = await workbookService.getAll(filters);
            setParts(data);
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Erro ao carregar partes');
        } finally {
            setLoading(false);
        }
    };

    // Carregar dados inicialmente (sem filtros para ter o total)
    useEffect(() => {
        loadPartsWithFilters();
    }, []);

    // Recarregar dados quando filtros server-side mudarem
    // Debounce para evitar muitas requisições
    const [filterTrigger, setFilterTrigger] = useState(0);

    useEffect(() => {
        const timer = setTimeout(() => {
            // Incrementar trigger para forçar reload mesmo quando valores são vazios
            setFilterTrigger(prev => prev + 1);
        }, 300); // 300ms debounce
        return () => clearTimeout(timer);
    }, [filterSection, filterStatus]);

    useEffect(() => {
        if (filterTrigger === 0) return; // Skip initial render

        // Sempre recarregar quando trigger muda
        const hasActiveFilters = filterSection || filterStatus;
        console.log('[WorkbookManager] 🔄 Recarregando com filtros:', {
            section: filterSection,
            status: filterStatus,
            hasActiveFilters
        });

        loadPartsWithFilters({
            section: filterSection || undefined,
            status: filterStatus || undefined,
        });
    }, [filterTrigger]);



    // ========================================================================
    // Upload de Excel
    // ========================================================================
    const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
        const file = event.target.files?.[0];
        if (!file) return;

        try {
            setLoading(true);
            setError(null);

            console.log('[WorkbookManager] 📊 Iniciando upload:', file.name);

            const arrayBuffer = await file.arrayBuffer();
            const workbook = XLSX.read(arrayBuffer, { type: 'array' });
            const sheetName = workbook.SheetNames[0];
            const worksheet = workbook.Sheets[sheetName];
            const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(worksheet);

            console.log(`[WorkbookManager] 📋 Planilha lida: ${rows.length} linhas`);

            if (rows.length === 0) {
                throw new Error('Planilha vazia');
            }

            // Validar colunas
            const firstRow = rows[0];
            const missingColumns = EXPECTED_COLUMNS.filter(col => !(col in firstRow));
            if (missingColumns.length > 0) {
                console.warn('[WorkbookManager] ⚠️ Colunas ausentes:', missingColumns);
            }

            // Helper para obter valor case-insensitive
            const getValue = (row: any, key: string) => {
                if (row[key] !== undefined) return row[key];
                const foundKey = Object.keys(row).find(k => k.toLowerCase() === key.toLowerCase());
                return foundKey ? row[foundKey] : undefined;
            };

            // Converter para WorkbookExcelRow
            const excelRows: WorkbookExcelRow[] = rows.map(row => {
                const weekId = (getValue(row, 'weekId') as string) || '';
                const year = weekId ? parseInt(weekId.split('-')[0]) : undefined;

                return {
                    id: (getValue(row, 'id') as string) || crypto.randomUUID(),
                    year,
                    weekId,
                    weekDisplay: (getValue(row, 'weekDisplay') as string) || '',
                    date: (() => {
                        const rawDate = getValue(row, 'date') as string | number;
                        if (!rawDate) return '';

                        // Se for número (Excel Serial)
                        if (typeof rawDate === 'number') {
                            const date = new Date((rawDate - 25569) * 86400 * 1000);
                            return date.toISOString().split('T')[0];
                        }

                        const strDate = String(rawDate).trim();
                        // Se for DD/MM/YYYY
                        const dmy = strDate.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
                        if (dmy) {
                            return `${dmy[3]}-${dmy[2].padStart(2, '0')}-${dmy[1].padStart(2, '0')}`;
                        }
                        return strDate;
                    })(),
                    section: (getValue(row, 'section') as string) || '',
                    tipoParte: (getValue(row, 'tipoParte') as string) || (getValue(row, 'tipo de parte') as string) || '',
                    modalidade: (getValue(row, 'modalidade') as string) || '',
                    tituloParte: (getValue(row, 'tituloParte') as string) || (getValue(row, 'titulo') as string) || '',
                    descricaoParte: (getValue(row, 'descricaoParte') as string) || (getValue(row, 'descricao') as string) || '',
                    detalhesParte: (getValue(row, 'detalhesParte') as string) || (getValue(row, 'detalhes') as string) || '',
                    seq: (getValue(row, 'seq') as number) || 0,
                    funcao: (getValue(row, 'funcao') as 'Titular' | 'Ajudante') || 'Titular',
                    duracao: (getValue(row, 'duracao') as string) || '',
                    horaInicio: (getValue(row, 'horaInicio') as string) || '',
                    horaFim: (getValue(row, 'horaFim') as string) || '',
                    rawPublisherName: (getValue(row, 'rawPublisherName') as string) || (getValue(row, 'publicador') as string) || '',
                    status: (getValue(row, 'status') as string) || 'PENDENTE',
                };
            });

            // Log de amostra para debug
            console.log('[WorkbookManager] 📝 Exemplo de registro convertido:', {
                weekId: excelRows[0]?.weekId,
                year: excelRows[0]?.year,
                tipoParte: excelRows[0]?.tipoParte,
                modalidade: excelRows[0]?.modalidade,
                tituloParte: excelRows[0]?.tituloParte,
                descricaoParte: excelRows[0]?.descricaoParte?.substring(0, 50),
            });

            // Criar batch (upsert interno atualiza partes existentes)
            console.log('[WorkbookManager] 💾 Enviando para createBatch...');
            const batch = await workbookService.createBatch(file.name, excelRows);
            console.log('[WorkbookManager] ✅ Batch criado:', batch.id);

            setSuccessMessage(`✅ Importadas ${excelRows.length} partes de "${file.name}"`);

            // Recarregar partes
            console.log('[WorkbookManager] 🔄 Recarregando partes...');
            await loadPartsWithFilters();

            console.log('[WorkbookManager] ✅ Upload completo!');

        } catch (err) {
            console.error('[WorkbookManager] ❌ Erro no upload:', err);
            setError(err instanceof Error ? err.message : 'Erro ao processar arquivo');
        } finally {
            setLoading(false);
            event.target.value = '';
        }
    };



    // ========================================================================
    // Ações
    // ========================================================================



    // ========================================================================
    // Gerar Designações (Motor Completo)
    // ========================================================================
    const handleGenerateDesignations = async () => {

        // Helper para normalizar data (duplicado do ApprovalPanel por enquanto)
        const parseDate = (dateStr: string): Date => {
            if (!dateStr) return new Date(0);
            if (dateStr.match(/^\d{4}-\d{2}-\d{2}/)) return new Date(dateStr + 'T12:00:00');
            const dmy = dateStr.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
            if (dmy) return new Date(`${dmy[3]}-${dmy[2].padStart(2, '0')}-${dmy[1].padStart(2, '0')}T12:00:00`);
            return new Date(dateStr);
        };

        const today = new Date();
        today.setHours(0, 0, 0, 0);

        // Filtrar partes que precisam de designação (Titular OU Ajudante, não promovidas)
        // E filtrar APENAS partes futuras (data >= hoje) usando parseDate robusto
        const partsNeedingAssignment = parts.filter(p => {
            const d = parseDate(p.date);
            return (p.funcao === 'Titular' || p.funcao === 'Ajudante') &&
                p.status !== 'DESIGNADA' &&
                p.status !== 'CONCLUIDA' &&
                p.status !== 'CANCELADA' &&
                d >= today;
        });

        if (partsNeedingAssignment.length === 0) {
            setError('Todas as partes já foram promovidas');
            return;
        }

        if (!confirm(`Gerar designações para ${partsNeedingAssignment.length} partes usando o motor de elegibilidade? Isso criará registros na aba Aprovações.`)) {
            return;
        }

        try {
            setLoading(true);
            setError(null);

            // =================================================================
            // VALIDAÇÃO v5.0: Avisar sobre partes de Titular sem duração
            // =================================================================
            const durationWarnings = validatePartsBeforeGeneration(partsNeedingAssignment);
            if (durationWarnings.length > 0) {
                const warningMessages = durationWarnings.map(w => w.message).join('\n');
                console.warn('[Motor] ⚠️ Partes sem duração:', durationWarnings);
                alert(`⚠️ ATENÇÃO: ${durationWarnings.length} parte(s) de Titular sem duração definida:\n\n${warningMessages}\n\nAs designações serão geradas, mas revise essas partes.`);
            }

            // Carregar histórico para cooldown (usando historyAdapter)
            let historyRecords: HistoryRecord[] = [];
            try {
                historyRecords = await loadCompletedParticipations();
            } catch (e) {
                console.warn('Não foi possível carregar histórico para cooldown:', e);
            }

            // =====================================================================
            // UNIFIED NOMENCLATURE: Use part.modalidade directly (Phase 5)
            // Fallback to tipoParte-based derivation for legacy data
            // =====================================================================

            // Mapeamento tipoParte → modalidade (fallback para dados legados)
            const TIPO_TO_MODALIDADE: Record<string, string> = {
                'Presidente': EnumModalidade.PRESIDENCIA,
                'Oração Inicial': EnumModalidade.ORACAO,
                'Oração Final': EnumModalidade.ORACAO,
                'Comentários Iniciais': EnumModalidade.PRESIDENCIA,
                'Comentários Finais': EnumModalidade.PRESIDENCIA,
                'Leitura da Bíblia': EnumModalidade.LEITURA_ESTUDANTE,
                'Dirigente EBC': EnumModalidade.DIRIGENTE_EBC,
                'Leitor EBC': EnumModalidade.LEITOR_EBC,
                'Discurso Tesouros': EnumModalidade.DISCURSO_ENSINO,
                'Joias Espirituais': EnumModalidade.DISCURSO_ENSINO,
                'Iniciando Conversas': EnumModalidade.DEMONSTRACAO,
                'Cultivando o Interesse': EnumModalidade.DEMONSTRACAO,
                'Fazendo Discípulos': EnumModalidade.DEMONSTRACAO,
                'Explicando Suas Crenças': EnumModalidade.DEMONSTRACAO,
                'Discurso de Estudante': EnumModalidade.DISCURSO_ESTUDANTE,
                'Necessidades Locais': EnumModalidade.DISCURSO_ENSINO,
            };

            // Usar modalidade do registro ou derivar do tipoParte
            const getModalidade = (part: WorkbookPart): string => {
                // PRIORITY 1: Use modalidade field directly (unified nomenclature)
                if (part.modalidade) return part.modalidade;
                // PRIORITY 2: Fallback to tipoParte mapping
                return TIPO_TO_MODALIDADE[part.tipoParte] || EnumModalidade.DEMONSTRACAO;
            };



            // Agrupar por semana
            const byWeek = partsNeedingAssignment.reduce((acc, part) => {
                const week = part.weekId || part.weekDisplay;
                if (!acc[week]) acc[week] = [];
                acc[week].push(part);
                return acc;
            }, {} as Record<string, WorkbookPart[]>);

            let totalCreated = 0;
            let totalWithPublisher = 0;

            // Map para armazenar publicador selecionado por partId
            const selectedPublisherByPart = new Map<string, { id: string; name: string }>();

            // =====================================================================
            // ARRAY DINÂMICO DE DESIGNAÇÕES FEITAS NESTE LOOP
            // Usado para penalizar publicadores que acabaram de ser designados
            // =====================================================================
            const inLoopAssignments: Array<{
                date: string;
                tipoParte: string;
                rawPublisherName: string;
                resolvedPublisherName: string;
                funcao: string;
                status: string;
            }> = [];

            // =====================================================================
            // PASSO 0: Buscar fila de pré-designações de Necessidades Locais
            // =====================================================================
            let localNeedsQueue: Awaited<ReturnType<typeof localNeedsService.getPendingQueue>> = [];
            try {
                localNeedsQueue = await localNeedsService.getPendingQueue();
                console.log(`[Motor] 📋 Fila de Necessidades Locais: ${localNeedsQueue.length} itens`);
            } catch (e) {
                console.warn('[Motor] Não foi possível carregar fila de Necessidades Locais:', e);
            }
            const usedPreassignmentIds = new Set<string>(); // Rastreia IDs já usados nesta execução

            // =====================================================================
            // FASE 1: PRESIDENTES - Prioridade Dinâmica (v6.0)
            // Processa TODOS os presidentes ANTES do loop de outras partes
            // Designa: Sem1→1º da lista, Sem2→2º, etc.
            // =====================================================================
            const grupoPresidentes = getGrupoPresidentes(publishers);
            console.log(`[Motor v6.0] 👔 Grupo Presidentes: ${grupoPresidentes.length} membros`);

            // Coletar todas as partes de Presidente PENDENTES em ordem cronológica
            const presidenteParts = partsNeedingAssignment
                .filter(p => p.tipoParte.toLowerCase().includes('presidente') && p.funcao === 'Titular')
                .sort((a, b) => a.date.localeCompare(b.date));

            console.log(`[Motor v6.0] 👔 ${presidenteParts.length} partes de Presidente a preencher`);

            // Filtrar elegíveis (disponíveis + elegíveis por regras)
            const eligiblePresidentes = grupoPresidentes.filter(p => {
                // Verificar elegibilidade completa (isNotQualified, requestedNoParticipation, etc.)
                const eligResult = checkEligibility(p, EnumModalidade.PRESIDENCIA, EnumFuncao.TITULAR, {});
                if (!eligResult.eligible) {
                    console.log(`[Motor v6.0] 👔 ${p.name} não elegível: ${eligResult.reason}`);
                    return false;
                }

                // Verificar se está disponível em pelo menos uma quinta-feira de presidente
                const avail = p.availability;
                return presidenteParts.some(part => {
                    const thursdayDate = getThursdayFromDate(part.date);
                    if (avail.mode === 'always') {
                        return !avail.exceptionDates.includes(thursdayDate);
                    } else {
                        return avail.availableDates.includes(thursdayDate);
                    }
                });
            });

            // Calcular prioridade e ordenar DESC
            const rankedPresidentes = rankByPriority(
                eligiblePresidentes,
                historyRecords,
                'Presidente da Reunião',
                'Titular',
                inLoopAssignments
            );

            console.log(`[Motor v6.0] 👔 ${rankedPresidentes.length} presidentes elegíveis ordenados por prioridade`);

            // Designar: Sem1→1º, Sem2→2º, etc.
            let presidenteListIndex = 0;
            for (const part of presidenteParts) {
                // Encontrar próximo disponível na data específica
                while (presidenteListIndex < rankedPresidentes.length) {
                    const candidate = rankedPresidentes[presidenteListIndex];
                    const avail = candidate.publisher.availability;

                    // Verificar disponibilidade na quinta-feira específica
                    const thursdayDate = getThursdayFromDate(part.date);
                    let isAvailable = true;
                    if (avail.mode === 'always') {
                        isAvailable = !avail.exceptionDates.includes(thursdayDate);
                    } else {
                        isAvailable = avail.availableDates.includes(thursdayDate);
                    }

                    if (isAvailable) {
                        selectedPublisherByPart.set(part.id, { id: candidate.publisher.id, name: candidate.publisher.name });
                        totalWithPublisher++;

                        // Adicionar ao histórico in-loop
                        inLoopAssignments.push({
                            date: part.date,
                            tipoParte: part.tipoParte,
                            rawPublisherName: '',
                            resolvedPublisherName: candidate.publisher.name,
                            funcao: 'Titular',
                            status: 'PROPOSTA'
                        });

                        console.log(`[Motor v6.0] 👔 Presidente ${part.weekDisplay}: ${candidate.publisher.name} (${candidate.priority}pts)`);
                        presidenteListIndex++;
                        break;
                    }
                    presidenteListIndex++;
                }

                if (presidenteListIndex >= rankedPresidentes.length && !selectedPublisherByPart.has(part.id)) {
                    console.warn(`[Motor v6.0] ⚠️ Nenhum presidente disponível para ${part.weekDisplay}`);
                }
            }

            // Oração Inicial: Automaticamente = Presidente da semana (tratado na Fase 3)

            // =====================================================================
            // FASE 2 e 3: ENSINO e DEMAIS PARTES (loop por semana)
            // =====================================================================
            for (const [_weekId, weekParts] of Object.entries(byWeek)) {
                // Ordenar partes por data para processar em ordem cronológica
                weekParts.sort((a, b) => a.date.localeCompare(b.date));

                // Map para rastrear TODAS as designações por publicador na semana
                // Map<publisherId, Array<{tipoParte: string, funcao: string}>>
                const assignmentsByPublisherInWeek = new Map<string, Array<{ tipoParte: string, funcao: string }>>();

                // =====================================================================
                // FASE 2: ENSINO - Prioridade Dinâmica (v6.0)
                // Partes: Tesouros, Joias, Dirigente EBC, Leitor EBC
                // Processa por TIPO na ordem da apostila
                // =====================================================================
                const grupoEnsino = getGrupoEnsino(publishers);
                const grupoEnsinoExpandido = getGrupoEnsinoExpandido(publishers);

                // Identificar presidente designado para esta semana
                const presidentePart = weekParts.find(p => p.tipoParte.toLowerCase().includes('presidente') && p.funcao === 'Titular');
                const presidenteDaSemana = presidentePart ? selectedPublisherByPart.get(presidentePart.id)?.name : undefined;

                // Partes de Ensino nesta semana (na ordem da apostila)
                const tiposEnsino = ['Discurso Tesouros', 'Joias Espirituais', 'Dirigente EBC', 'Leitor EBC'];
                const namesJaTemEnsinoNaSemana: string[] = [];

                for (const tipoEnsino of tiposEnsino) {
                    const ensinoParts = weekParts.filter(p =>
                        p.tipoParte === tipoEnsino &&
                        p.funcao === 'Titular' &&
                        !selectedPublisherByPart.has(p.id)
                    );

                    if (ensinoParts.length === 0) continue;

                    // Usar grupo expandido para Leitor EBC
                    const grupoAtual = tipoEnsino === 'Leitor EBC' ? grupoEnsinoExpandido : grupoEnsino;

                    // Filtrar elegíveis (exclusões + elegibilidade completa)
                    const eligibleForEnsino = grupoAtual.filter(p => {
                        if (p.name === presidenteDaSemana) return false;
                        if (namesJaTemEnsinoNaSemana.includes(p.name)) return false;

                        // Verificar elegibilidade completa (isNotQualified, requestedNoParticipation, etc.)
                        const firstPart = ensinoParts[0];
                        const eligResult = checkEligibility(p, EnumModalidade.DISCURSO_ENSINO, EnumFuncao.TITULAR, {
                            date: firstPart.date
                        });
                        if (!eligResult.eligible) {
                            return false;
                        }

                        // Verificar disponibilidade na quinta-feira
                        const avail = p.availability;
                        const thursdayDate = getThursdayFromDate(firstPart.date);
                        if (avail.mode === 'always') {
                            if (avail.exceptionDates.includes(thursdayDate)) return false;
                        } else {
                            if (!avail.availableDates.includes(thursdayDate)) return false;
                        }
                        return true;
                    });

                    if (eligibleForEnsino.length === 0) continue;

                    // Calcular prioridade e ordenar
                    const rankedEnsino = rankByPriority(
                        eligibleForEnsino,
                        historyRecords,
                        tipoEnsino,
                        'Titular',
                        inLoopAssignments
                    );

                    // Designar: Parte1→1º, Parte2→2º, etc.
                    let ensinoListIndex = 0;
                    for (const ensinoPart of ensinoParts) {
                        if (ensinoListIndex >= rankedEnsino.length) break;

                        const candidate = rankedEnsino[ensinoListIndex];
                        selectedPublisherByPart.set(ensinoPart.id, { id: candidate.publisher.id, name: candidate.publisher.name });
                        totalWithPublisher++;
                        namesJaTemEnsinoNaSemana.push(candidate.publisher.name);

                        // Adicionar ao histórico in-loop
                        inLoopAssignments.push({
                            date: ensinoPart.date,
                            tipoParte: ensinoPart.tipoParte,
                            rawPublisherName: '',
                            resolvedPublisherName: candidate.publisher.name,
                            funcao: 'Titular',
                            status: 'PROPOSTA'
                        });

                        console.log(`[Motor v6.0] 📚 ${tipoEnsino} (${ensinoPart.weekDisplay}): ${candidate.publisher.name} (${candidate.priority}pts)`);
                        ensinoListIndex++;
                    }
                }

                // =====================================================================
                // FASE 3: ESTUDANTE - Prioridade Dinâmica (v6.0)
                // Partes: Leitura, Demonstrações, Discurso Estudante
                // =====================================================================
                const grupoEstudante = getGrupoEstudante(publishers);
                const tiposEstudante = ['Leitura da Bíblia', 'Iniciando Conversas', 'Cultivando o Interesse', 'Fazendo Discípulos', 'Explicando Suas Crenças', 'Discurso de Estudante'];
                const namesJaTemEstudanteNaSemana: string[] = [];

                for (const tipoEstudante of tiposEstudante) {
                    const estudanteParts = weekParts.filter(p =>
                        p.tipoParte === tipoEstudante &&
                        p.funcao === 'Titular' &&
                        !selectedPublisherByPart.has(p.id)
                    );

                    if (estudanteParts.length === 0) continue;

                    // Filtrar elegíveis (exclusões + elegibilidade completa)
                    const eligibleForEstudante = grupoEstudante.filter(p => {
                        if (p.name === presidenteDaSemana) return false;
                        if (namesJaTemEnsinoNaSemana.includes(p.name)) return false;
                        if (namesJaTemEstudanteNaSemana.includes(p.name)) return false;

                        // Verificar elegibilidade completa (isNotQualified, requestedNoParticipation, gênero para demos, etc.)
                        const firstPart = estudanteParts[0];
                        // Mapear tipoParte para modalidade
                        const modalidade = tipoEstudante === 'Leitura da Bíblia'
                            ? EnumModalidade.LEITURA_ESTUDANTE
                            : EnumModalidade.DEMONSTRACAO;
                        const eligResult = checkEligibility(p, modalidade, EnumFuncao.TITULAR, {
                            date: firstPart.date
                        });
                        if (!eligResult.eligible) {
                            return false;
                        }

                        // Verificar disponibilidade na quinta-feira
                        const avail = p.availability;
                        const thursdayDate = getThursdayFromDate(firstPart.date);
                        if (avail.mode === 'always') {
                            if (avail.exceptionDates.includes(thursdayDate)) return false;
                        } else {
                            if (!avail.availableDates.includes(thursdayDate)) return false;
                        }
                        return true;
                    });

                    if (eligibleForEstudante.length === 0) continue;

                    // Calcular prioridade e ordenar
                    const rankedEstudante = rankByPriority(
                        eligibleForEstudante,
                        historyRecords,
                        tipoEstudante,
                        'Titular',
                        inLoopAssignments
                    );

                    // Designar: Parte1→1º, Parte2→2º, etc.
                    let estudanteListIndex = 0;
                    for (const estudantePart of estudanteParts) {
                        if (estudanteListIndex >= rankedEstudante.length) break;

                        const candidate = rankedEstudante[estudanteListIndex];
                        selectedPublisherByPart.set(estudantePart.id, { id: candidate.publisher.id, name: candidate.publisher.name });
                        totalWithPublisher++;
                        namesJaTemEstudanteNaSemana.push(candidate.publisher.name);

                        // Adicionar ao histórico in-loop
                        inLoopAssignments.push({
                            date: estudantePart.date,
                            tipoParte: estudantePart.tipoParte,
                            rawPublisherName: '',
                            resolvedPublisherName: candidate.publisher.name,
                            funcao: 'Titular',
                            status: 'PROPOSTA'
                        });

                        console.log(`[Motor v6.0] 🎓 ${tipoEstudante} (${estudantePart.weekDisplay}): ${candidate.publisher.name} (${candidate.priority}pts)`);
                        estudanteListIndex++;
                    }
                }

                // =====================================================================
                // FASE 4: DEMAIS PARTES (Ajudantes, Orações, etc.)
                // Oração Inicial = Presidente da semana
                // =====================================================================
                for (const part of weekParts) {
                    // SKIP: Partes já processadas
                    if (selectedPublisherByPart.has(part.id)) {
                        continue;
                    }

                    const modalidade = getModalidade(part);
                    const isOracaoInicial = part.tipoParte.toLowerCase().includes('inicial');

                    // Oração Inicial: Usar presidente da semana
                    if (isOracaoInicial && presidenteDaSemana) {
                        const presidentePub = publishers.find(p => p.name === presidenteDaSemana);
                        if (presidentePub) {
                            selectedPublisherByPart.set(part.id, { id: presidentePub.id, name: presidentePub.name });
                            totalWithPublisher++;
                            console.log(`[Motor v6.0] 🙏 Oração Inicial (${part.weekDisplay}): ${presidentePub.name} (= Presidente)`);
                            continue;
                        }
                    }

                    // Determinar função (Titular ou Ajudante)
                    const funcao = part.funcao === 'Ajudante' ? EnumFuncao.AJUDANTE : EnumFuncao.TITULAR;

                    // =====================================================================
                    // PASSO ESPECIAL: Necessidades Locais usa fila de pré-designações
                    // PRIORIDADE: Eventos Especiais > target_week específico > ordem da fila
                    // Se a parte está CANCELADA (por Evento Especial), NÃO consumir da fila
                    // =====================================================================
                    if (part.tipoParte === 'Necessidades Locais' && funcao === EnumFuncao.TITULAR) {
                        // Verificar se a parte foi cancelada por Evento Especial
                        if (part.status === 'CANCELADA') {
                            console.log(`[Motor] 🚫 NL em ${part.date} está CANCELADA (Evento Especial). Fila de NL preservada.`);
                            continue; // Pular esta parte
                        }

                        // Buscar pré-designação: primeiro por target_week, depois por ordem
                        // 1. Procurar pré-designação específica para esta semana (weekId)
                        const specificPreassignment = localNeedsQueue.find(p => p.targetWeek === part.weekId);

                        // 2. Se não houver específica, usar próxima da fila (sem target_week)
                        const nextFromQueue = localNeedsQueue.find(p =>
                            !p.targetWeek && !usedPreassignmentIds.has(p.id)
                        );

                        const preassignment = specificPreassignment || nextFromQueue;

                        if (preassignment) {
                            console.log(`[Motor] 📋 Usando pré-designação NL${preassignment.targetWeek ? ' (específica)' : ''}: "${preassignment.theme}" → ${preassignment.assigneeName}`);

                            // Usar pré-designação
                            selectedPublisherByPart.set(part.id, {
                                id: 'preassigned',
                                name: preassignment.assigneeName
                            });
                            // Guardar tema e ID da pré-designação para atualizar depois
                            (part as any)._localNeedsTheme = preassignment.theme;
                            (part as any)._preassignmentId = preassignment.id;

                            // Marcar como usado para não reutilizar
                            usedPreassignmentIds.add(preassignment.id);

                            totalWithPublisher++;
                            continue; // Pular motor normal
                        } else {
                            console.warn(`[Motor] ⚠️ Nenhuma pré-designação disponível para Necessidades Locais em ${part.date}`);
                            // Continuar com motor normal como fallback
                        }
                    }

                    // =====================================================================
                    // MOTOR NORMAL para outras partes
                    // =====================================================================

                    // 1. Filtrar publicadores elegíveis (respeita função e seção)
                    const isPast = isPastWeekDate(part.date);

                    // REGRA: Para ajudantes, buscar gênero do titular para garantir mesmo sexo
                    let titularGender: 'brother' | 'sister' | undefined = undefined;
                    if (funcao === EnumFuncao.AJUDANTE) {
                        // Buscar o titular da mesma parte (mesmo week + seq)
                        const titularPart = weekParts.find(p =>
                            p.weekId === part.weekId &&
                            p.seq === part.seq &&
                            p.funcao === 'Titular'
                        );
                        if (titularPart) {
                            // Buscar o publicador designado para o titular
                            const titularPubInfo = selectedPublisherByPart.get(titularPart.id);
                            if (titularPubInfo) {
                                const titularPub = publishers.find(p => p.id === titularPubInfo.id || p.name === titularPubInfo.name);
                                if (titularPub) {
                                    titularGender = titularPub.gender;
                                }
                            }
                        }
                    }

                    const eligiblePublishers = publishers.filter(p => {
                        // Impedir repetição na mesma semana (exceto se a regra permitir - por enquanto bloqueio total)
                        // Verificar Multitarefa (substitui bloqueio total)
                        const existingAssignments = assignmentsByPublisherInWeek.get(p.id) || [];
                        if (existingAssignments.length > 0) {
                            // Regra de Multitarefa:
                            // 1. Limite máximo de 2 designações por semana
                            if (existingAssignments.length >= 2) return false;

                            const newIsPrayer = part.tipoParte.toLowerCase().includes('oração final');
                            const newIsHelper = funcao === EnumFuncao.AJUDANTE;

                            for (const assigned of existingAssignments) {
                                const assignedIsPrayer = assigned.tipoParte.toLowerCase().includes('oração final');
                                const assignedIsHelper = assigned.funcao === EnumFuncao.AJUDANTE;

                                // MATRIZ DE COMPATIBILIDADE

                                // Oração Final combina com tudo (exceto outra oração final, teoricamente)
                                if (newIsPrayer || assignedIsPrayer) {
                                    continue; // Permitido (acumular com Oração Final)
                                }

                                // Ajudante conflita com Partes de Estudante/Ensino (Partes Principais)
                                if (newIsHelper && !assignedIsPrayer) return false; // Ajudante só com Oração Final
                                if (assignedIsHelper && !newIsPrayer) return false; // Se já é Ajudante, só aceita Oração Final

                                // Padrão com Padrão (Leitura + Discurso) -> BLOQUEADO
                                return false;
                            }
                        }

                        const result = checkEligibility(
                            p,
                            modalidade as Parameters<typeof checkEligibility>[1],
                            funcao,
                            { date: part.date, isOracaoInicial, secao: part.section, isPastWeek: isPast, titularGender }
                        );
                        return result.eligible;
                    });

                    // 2. Selecionar melhor candidato via cooldownService
                    let selectedPublisher: Publisher | null = null;

                    if (eligiblePublishers.length > 0) {
                        // Preparar lista de partes futuras já agendadas para penalizar publicadores sobrecarregados
                        // Inclui partes com status PROPOSTA, APROVADA, DESIGNADA (não PENDENTE/REJEITADA/CANCELADA)
                        const futureAssignments = parts
                            .filter(p => {
                                const d = parseDate(p.date);
                                const isActive = ['PROPOSTA', 'APROVADA', 'DESIGNADA'].includes(p.status);
                                return d >= today && isActive;
                            })
                            .map(p => ({
                                date: p.date,
                                tipoParte: p.tipoParte,
                                rawPublisherName: p.rawPublisherName,
                                resolvedPublisherName: p.resolvedPublisherName,
                                funcao: p.funcao,
                                status: p.status
                            }));

                        // COMBINAR futureAssignments do banco + inLoopAssignments desta execução
                        const allFutureAssignments = [...futureAssignments, ...inLoopAssignments];

                        selectedPublisher = selectBestCandidate(
                            eligiblePublishers,
                            historyRecords,
                            part.tipoParte, // Passar tipo específico
                            funcao,         // Passar função
                            today,
                            allFutureAssignments
                        );

                        if (!selectedPublisher) {
                            // Fallback: primeiro elegível
                            selectedPublisher = eligiblePublishers[0];
                        }
                    }

                    // Armazenar publicador selecionado no Map para usar depois
                    if (selectedPublisher) {
                        selectedPublisherByPart.set(part.id, { id: selectedPublisher.id, name: selectedPublisher.name });
                        if (!assignmentsByPublisherInWeek.has(selectedPublisher.id)) {
                            assignmentsByPublisherInWeek.set(selectedPublisher.id, []);
                        }
                        assignmentsByPublisherInWeek.get(selectedPublisher.id)?.push({
                            tipoParte: part.tipoParte,
                            funcao: funcao
                        });
                        totalWithPublisher++;

                        // =====================================================================
                        // ADICIONAR À LISTA DE DESIGNAÇÕES DESTE LOOP
                        // Para que iterações futuras penalizem este publicador
                        // =====================================================================
                        inLoopAssignments.push({
                            date: part.date,
                            tipoParte: part.tipoParte,
                            rawPublisherName: '',
                            resolvedPublisherName: selectedPublisher.name,
                            funcao: part.funcao,
                            status: 'PROPOSTA'
                        });

                        // =====================================================================
                        // ATUALIZAÇÃO DE HISTÓRICO DINÂMICA
                        // Adicionar esta nova designação ao histórico em memória para que o 
                        // Cooldown Service a considere nas próximas semanas deste mesmo loop.
                        // =====================================================================


                        // Importar dinamicamente se necessário, ou usar mapeamento manual simples
                        // Aqui fazemos um mapeamento manual simplificado compatível com HistoryRecord
                        const tempHistoryRecord = {
                            id: part.id,
                            weekId: part.weekId,
                            weekDisplay: part.weekDisplay,
                            date: part.date,
                            section: part.section,
                            tipoParte: part.tipoParte,
                            modalidade: part.modalidade || (TIPO_TO_MODALIDADE[part.tipoParte] || EnumModalidade.DEMONSTRACAO),
                            tituloParte: part.tituloParte,
                            descricaoParte: part.descricaoParte,
                            detalhesParte: part.detalhesParte,
                            seq: part.seq,
                            funcao: part.funcao as 'Titular' | 'Ajudante',
                            duracao: parseInt(part.duracao) || 0,
                            horaInicio: part.horaInicio,
                            horaFim: part.horaFim,
                            rawPublisherName: '',
                            resolvedPublisherName: selectedPublisher.name,
                            status: 'APPROVED' as const, // APPROVED equivale a DESIGNADA no enum HistoryStatus
                            importSource: 'Auto-Generate',
                            importBatchId: '',
                            createdAt: new Date().toISOString(),
                            updatedAt: new Date().toISOString(),
                        };

                        historyRecords.push(tempHistoryRecord as unknown as HistoryRecord);
                    }
                }

                // Atualizar totalCreated baseado nas propostas geradas
                totalCreated += weekParts.length;
            }

            setSuccessMessage(`✅ ${totalCreated} designações processadas (${totalWithPublisher} com publicador selecionado pelo motor).`);

            // Atualizar status das partes para PROPOSTA usando o ciclo de vida
            // Usa proposePublisher para preencher proposedPublisherId/proposedPublisherName
            for (const part of partsNeedingAssignment) {
                const selectedPub = selectedPublisherByPart.get(part.id);

                if (selectedPub) {
                    if (part.status === 'PENDENTE' || part.status === 'PROPOSTA') {
                        // Usar proposePublisher para transição correta no ciclo de vida
                        try {
                            await workbookService.proposePublisher(part.id, selectedPub.name);

                            // =====================================================================
                            // PASSO ESPECIAL: Marcar pré-designação de NL como usada
                            // =====================================================================
                            const preassignmentId = (part as any)._preassignmentId;
                            const localNeedsTheme = (part as any)._localNeedsTheme;

                            if (preassignmentId && localNeedsTheme) {
                                try {
                                    // Marcar pré-designação como atribuída a esta parte
                                    await localNeedsService.assignToPart(preassignmentId, part.id);
                                    console.log(`[Motor] ✅ Pré-designação NL marcada como usada: ${preassignmentId}`);

                                    // Salvar tema na parte (atualiza part_title no banco)
                                    const newTitle = `Necessidades Locais: ${localNeedsTheme}`;
                                    await workbookService.updatePart(part.id, { tituloParte: newTitle });
                                    console.log(`[Motor] 📝 Tema atualizado na parte: "${newTitle}"`);
                                } catch (nlErr) {
                                    console.warn('[Motor] Erro ao marcar pré-designação NL:', nlErr);
                                }
                            }
                        } catch (e) {
                            // Fallback para update direto se proposePublisher falhar
                            await workbookService.updatePart(part.id, {
                                status: 'PROPOSTA',
                                resolvedPublisherName: selectedPub.name
                            });
                        }
                    }
                } else {
                    // SE NÃO HÁ PUBLICADOR: Não mudar para PROPOSTA. Manter PENDENTE.
                    console.warn(`[Motor] Nenhum publicador encontrado para parte ${part.id} (${part.tipoParte}). Mantendo status original.`);
                }
            }

            await loadPartsWithFilters();

        } catch (err) {
            setError(err instanceof Error ? err.message : 'Erro ao gerar designações');
        } finally {
            setLoading(false);
        }
    };

    // Semanas únicas com ano e weekId para dropdown
    const uniqueWeeks = useMemo(() => {
        const weeksMap = new Map<string, { weekId: string; weekDisplay: string; year: number }>();
        parts.forEach(p => {
            if (!weeksMap.has(p.weekId)) {
                weeksMap.set(p.weekId, { weekId: p.weekId, weekDisplay: p.weekDisplay, year: p.year || 0 });
            }
        });
        return Array.from(weeksMap.values()).sort((a, b) => a.weekId.localeCompare(b.weekId));
    }, [parts]);
    const uniqueSections = useMemo(() => [...new Set(parts.map(p => p.section))], [parts]);

    // HIDDEN_TYPES - partes gerenciadas automaticamente pelo Presidente + tipos genéricos indesejados
    const HIDDEN_TYPES = [
        'Comentários Iniciais', 'Comentarios Iniciais',
        'Comentários Finais', 'Comentarios Finais',
        'Cântico Inicial', 'Cântico do Meio', 'Cântico Final', 'Cântico', 'Cantico',
        'Oração Inicial', 'Oracao Inicial',
        'Elogios e Conselhos', 'Elogios e conselhos',
        // Tipos genéricos que não deveriam aparecer
        'Parte', 'Parte Ministério', 'Parte Vida Cristã', 'Parte Vida Crista'
    ];

    // Ordem lógica de uma reunião (para ordenar dropdown)
    const TIPO_ORDER = [
        'Presidente',
        'Tesouros da Palavra de Deus', 'Discurso Tesouros', 'Joias Espirituais',
        'Leitura da Bíblia', 'Leitura da Biblia',
        'Iniciando Conversas', 'Cultivando o Interesse', 'Fazendo Discípulos', 'Explicando Suas Crenças',
        'Discurso de Estudante',
        'Necessidades Locais', 'Necessidades da Congregação',
        'Dirigente EBC', 'Leitor EBC', 'Estudo Bíblico de Congregação',
        'Oração Final', 'Oracao Final'
    ];

    const uniqueTipos = useMemo(() => {
        const tiposSet = [...new Set(parts.map(p => p.tipoParte))].filter(t => !HIDDEN_TYPES.includes(t));
        // Ordenar por sequência lógica da reunião
        return tiposSet.sort((a, b) => {
            const indexA = TIPO_ORDER.indexOf(a);
            const indexB = TIPO_ORDER.indexOf(b);
            // Se não encontrado na ordem, vai pro final (alfabético)
            if (indexA === -1 && indexB === -1) return a.localeCompare(b);
            if (indexA === -1) return 1;
            if (indexB === -1) return -1;
            return indexA - indexB;
        });
    }, [parts]);

    const filteredParts = useMemo(() => {
        return parts.filter(p => {
            // OCULTAR partes secundárias (a menos que showHiddenParts esteja ativo)
            const HIDDEN_TYPES = [
                'Comentários Iniciais', 'Comentarios Iniciais',
                'Comentários Finais', 'Comentarios Finais',
                'Cântico Inicial', 'Cântico do Meio', 'Cântico Final', 'Cântico', 'Cantico',
                'Oração Inicial', 'Oracao Inicial',
                'Elogios e Conselhos', 'Elogios e conselhos'
            ];

            if (!showHiddenParts && HIDDEN_TYPES.includes(p.tipoParte)) {
                return false;
            }

            // Filtro por semana (compara com weekId)
            if (filterWeek && p.weekId !== filterWeek) return false;
            if (filterSection && p.section !== filterSection) return false;
            if (filterTipo && p.tipoParte !== filterTipo) return false;
            if (filterStatus && p.status !== filterStatus) return false;
            if (filterFuncao !== 'all' && p.funcao !== filterFuncao) return false;
            if (searchText) {
                const search = searchText.toLowerCase();
                // Inclui weekId e date no texto pesquisável
                const searchable = `${p.weekId} ${p.date} ${p.weekDisplay} ${p.tituloParte} ${p.descricaoParte} ${p.rawPublisherName} ${p.resolvedPublisherName || ''}`.toLowerCase();
                if (!searchable.includes(search)) return false;
            }
            return true;
        });
    }, [parts, filterWeek, filterSection, filterTipo, filterStatus, filterFuncao, searchText, showHiddenParts]);

    // ========================================================================
    // Estilos inline
    // ========================================================================
    const sectionColors: Record<string, string> = {
        'Início da Reunião': '#E0E7FF',
        'Tesouros da Palavra de Deus': '#D1FAE5',
        'Faça Seu Melhor no Ministério': '#FEF3C7',
        'Nossa Vida Cristã': '#FEE2E2',
        'Final da Reunião': '#E0E7FF',
    };



    // Helper para atualizar publisher do dropdown
    const handlePublisherSelect = async (partId: string, _newId: string, newName: string) => {
        try {
            // Tentar pegar a part atual para checar status
            const part = parts.find(p => p.id === partId);
            if (!part) return;

            // Determinar novos valores e se precisa mudar status
            const isDesignada = part.status === 'DESIGNADA' || part.status === 'CONCLUIDA' || part.status === 'APROVADA';

            // Optimistic Update: Atualizar UI imediatamente
            setParts(prev => prev.map(p => {
                if (p.id !== partId) return p;

                const updated = { ...p };
                updated.resolvedPublisherName = newName;

                // Se não estiver bloqueado (APROVADA/DESIGNADA/CONCLUIDA)
                if (!isDesignada) {
                    // Se tem nome -> PROPOSTA
                    // Se não tem nome -> PENDENTE
                    updated.status = newName ? 'PROPOSTA' : 'PENDENTE';
                }
                return updated;
            }));

            // =====================================================================
            // PASSO ESPECIAL: Se for Necessidades Locais, desvincular pré-designação anterior
            // Isso permite re-designar manualmente uma NL que foi atribuída pelo motor
            // =====================================================================
            if (part.tipoParte === 'Necessidades Locais') {
                try {
                    await localNeedsService.unassignByPartId(partId);
                } catch (unlinkErr) {
                    console.warn('[WorkbookManager] Erro ao desvincular pré-designação NL:', unlinkErr);
                }
            }

            // Chamada ao Backend
            if (!isDesignada) {
                await workbookService.proposePublisher(partId, newName);
            } else {
                await workbookService.updatePart(partId, {
                    resolvedPublisherName: newName
                });
            }
        } catch (e) {
            console.error('Erro ao atualizar publicador:', e);
            const msg = e instanceof Error ? e.message : 'Erro desconhecido';
            setError(msg);
            alert(`Erro ao salvar: ${msg}`);
        }
    };


    // ========================================================================
    // Render
    // ========================================================================

    const handleEditPart = (part: WorkbookPart) => {
        setEditingPart(part);
        setIsEditModalOpen(true);
    };

    const handleSaveEditPart = async (id: string, updates: Partial<WorkbookPart>, applyToWeek?: boolean) => {
        try {
            // =====================================================================
            // REGRA: Se status voltar para PENDENTE, limpar o publicador
            // =====================================================================
            if (updates.status === 'PENDENTE') {
                updates.resolvedPublisherName = ''; // Limpar publicador
            }

            // 1. Atualizar a parte individual (Fluxo normal)
            const updatedPart = await workbookService.updatePart(id, updates);

            // 2. Se a flag applyToWeek estiver ativa, atualizar toda a semana
            if (applyToWeek && updates.status && updatedPart.weekId) {
                console.log(`[WorkbookManager] 🔄 Aplicando status '${updates.status}' para toda a semana ${updatedPart.weekId}`);

                // Se PENDENTE, também limpar publicador de toda a semana
                const clearPublisher = updates.status === 'PENDENTE';
                await workbookService.updateWeekStatus(updatedPart.weekId, updates.status, clearPublisher);

                // Atualizar estado local para TODAS as partes da semana
                setParts(prev => prev.map(p =>
                    p.weekId === updatedPart.weekId
                        ? {
                            ...p,
                            status: updates.status!,
                            // Limpar publicador se voltou para PENDENTE
                            ...(clearPublisher ? { resolvedPublisherName: '' } : {})
                        }
                        : p
                ));
            } else {
                // Atualização Individual Apenas
                setParts(prev => prev.map(p => p.id === id ? updatedPart : p));
            }

            // 3. Se campos de tempo foram alterados, o backend já recalculou (síncrono).
            //    Recarregar para pegar os novos horaInicio/horaFim de TODAS as partes da semana.
            const timeFields = ['duracao', 'horaInicio', 'seq', 'tituloParte', 'tipoParte'];
            const changedTimeFields = Object.keys(updates).some(k => timeFields.includes(k));

            if (changedTimeFields && updatedPart.weekId) {
                console.log(`[WorkbookManager] ⏱️ Recarregando UI após recálculo de horários...`);
                await loadPartsWithFilters(); // Reload limpo - React way
                console.log(`[WorkbookManager] ✅ UI atualizada com novos horários`);
            }

            // Fechar modal é feito no componente modal ao chamar onSave com sucesso
        } catch (error) {
            console.error('Erro ao salvar parte:', error);
            alert('Erro ao salvar alterações: ' + (error instanceof Error ? error.message : String(error)));
            throw error; // Repassar erro para o modal lidar (loading state)
        }
    };

    const handleGenerateReport = async () => {
        setLoading(true);
        try {
            const history = await loadCompletedParticipations();
            const report = generateSessionReport(parts, publishers, history);
            setReportData(report);
            setActiveTab('reports');
        } catch (error) {
            console.error('Erro ao gerar relatório:', error);
            alert('Erro ao gerar relatório');
        } finally {
            setLoading(false);
        }
    };

    return (
        <div style={{ display: 'flex', flexDirection: 'column', height: '100vh', background: 'var(--bg-primary)', color: 'var(--text-primary)', fontFamily: 'Inter, sans-serif' }}>

            {/* Header Tabs */}
            <div style={{ padding: '10px 20px', background: 'white', borderBottom: '1px solid #E5E7EB', display: 'flex', justifyContent: 'space-between', alignItems: 'center', boxShadow: '0 2px 4px rgba(0,0,0,0.05)' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '20px' }}>
                    <h2 style={{ margin: 0, fontSize: '1.2em', fontWeight: '600', color: '#1F2937' }}>RVM Designações</h2>
                    <div style={{ display: 'flex', gap: '8px' }}>
                        <button onClick={() => setActiveTab('planning')} style={{ padding: '8px 16px', borderRadius: '6px', border: 'none', background: activeTab === 'planning' ? '#E0E7FF' : 'transparent', color: activeTab === 'planning' ? '#4338CA' : '#6B7280', fontWeight: '600', cursor: 'pointer', transition: 'all 0.2s' }}>Planejamento</button>
                        <button onClick={handleGenerateReport} style={{ padding: '8px 16px', borderRadius: '6px', border: 'none', background: activeTab === 'reports' ? '#E0E7FF' : 'transparent', color: activeTab === 'reports' ? '#4338CA' : '#6B7280', fontWeight: '600', cursor: 'pointer', transition: 'all 0.2s', display: 'flex', alignItems: 'center', gap: '6px' }}>
                            <span>📊</span> Relatórios
                        </button>
                    </div>
                </div>
                <div style={{ display: 'flex', gap: '8px' }}>
                    {activeTab === 'planning' && (
                        <>
                            <button onClick={() => setIsEventsModalOpen(true)} style={{ padding: '8px 16px', background: '#8B5CF6', color: 'white', border: 'none', borderRadius: '6px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px' }}>
                                📅 Eventos
                            </button>
                            <button onClick={() => setIsLocalNeedsQueueOpen(true)} style={{ padding: '8px 16px', background: '#F59E0B', color: 'white', border: 'none', borderRadius: '6px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px' }}>
                                📋 Fila NL
                            </button>
                            <button onClick={() => setIsS140MultiModalOpen(true)} style={{ padding: '8px 16px', background: '#4F46E5', color: 'white', border: 'none', borderRadius: '6px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px' }}>
                                📦 S-140 Pacote
                            </button>
                        </>
                    )}
                </div>
            </div>

            <div style={{ flex: 1, overflowY: 'auto', position: 'relative' }}>
                {activeTab === 'reports' ? (
                    <ReportsTab data={reportData} />
                ) : (
                    <div style={{ padding: '0 16px 8px', maxWidth: '1600px', margin: '0 auto', minHeight: '100%' }}>


                        {/* Mensagens */}
                        {error && (
                            <div style={{ padding: '12px', background: '#FEE2E2', color: '#B91C1C', borderRadius: '8px', marginBottom: '16px' }}>
                                ❌ {error}
                                <button onClick={() => setError(null)} style={{ float: 'right', border: 'none', background: 'none', cursor: 'pointer' }}>✕</button>
                            </div>
                        )}
                        {successMessage && (
                            <div style={{ padding: '12px', background: '#D1FAE5', color: '#047857', borderRadius: '8px', marginBottom: '16px' }}>
                                {successMessage}
                                <button onClick={() => setSuccessMessage(null)} style={{ float: 'right', border: 'none', background: 'none', cursor: 'pointer' }}>✕</button>
                            </div>
                        )}

                        {/* Header Unificado: Ações e Filtros */}
                        <div style={{
                            marginBottom: '2px',
                            background: '#fff',
                            padding: '4px 8px',
                            borderRadius: '4px',
                            border: '1px solid #E5E7EB',
                            display: 'flex',
                            flexDirection: 'column',
                            gap: '2px',
                            boxShadow: '0 1px 2px rgba(0,0,0,0.05)'
                        }}>
                            {/* Linha Superior: Upload e Ações Principais */}
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '4px' }}>
                                {/* Upload Button Disfarçado */}
                                <div>
                                    <input
                                        type="file"
                                        accept=".xlsx,.xls"
                                        onChange={handleFileUpload}
                                        style={{ display: 'none' }}
                                        id="workbook-excel-upload"
                                    />
                                    <label
                                        htmlFor="workbook-excel-upload"
                                        style={{
                                            cursor: 'pointer',
                                            color: '#4F46E5',
                                            fontWeight: '600',
                                            display: 'flex',
                                            alignItems: 'center',
                                            gap: '4px',
                                            fontSize: '12px',
                                            padding: '4px 8px',
                                            background: '#EEF2FF',
                                            borderRadius: '4px'
                                        }}
                                    >
                                        📊 Carregar Excel
                                    </label>
                                </div>

                                {/* Paginação Central */}
                                {(() => {
                                    const currentFilteredWeeks = [...new Set(filteredParts.map(p => p.weekId))].sort();
                                    const totalPages = currentFilteredWeeks.length || 1;
                                    const safePage = Math.min(Math.max(currentPage, 1), totalPages);

                                    return (
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', background: '#F3F4F6', padding: '2px 8px', borderRadius: '4px' }}>
                                            <button
                                                onClick={() => setCurrentPage(Math.max(1, safePage - 1))}
                                                disabled={safePage === 1}
                                                style={{ border: 'none', background: 'none', cursor: safePage === 1 ? 'not-allowed' : 'pointer', opacity: safePage === 1 ? 0.3 : 1, fontSize: '14px' }}
                                            >
                                                ⬅️
                                            </button>
                                            <span style={{ fontSize: '12px', fontWeight: '600', color: '#374151' }}>
                                                Semana {safePage} de {totalPages}
                                            </span>
                                            <button
                                                onClick={() => setCurrentPage(Math.min(totalPages, safePage + 1))}
                                                disabled={safePage === totalPages}
                                                style={{ border: 'none', background: 'none', cursor: safePage === totalPages ? 'not-allowed' : 'pointer', opacity: safePage === totalPages ? 0.3 : 1, fontSize: '14px' }}
                                            >
                                                ➡️
                                            </button>
                                        </div>
                                    );
                                })()}

                                {/* Botões de Ação */}
                                <div style={{ display: 'flex', gap: '4px' }}>
                                    <button onClick={() => loadPartsWithFilters()} disabled={loading} style={{ padding: '4px 10px', cursor: 'pointer', background: '#3B82F6', color: 'white', border: 'none', borderRadius: '4px', fontSize: '11px', fontWeight: '500' }}>
                                        🔄 Atualizar
                                    </button>
                                    <button onClick={handleGenerateDesignations} disabled={loading} style={{ padding: '4px 10px', cursor: 'pointer', background: '#7C3AED', color: 'white', border: 'none', borderRadius: '4px', fontSize: '11px', fontWeight: '500' }}>
                                        🎯 Gerar
                                    </button>
                                    <button onClick={() => setIsLocalNeedsQueueOpen(true)} disabled={loading} style={{ padding: '4px 10px', cursor: 'pointer', background: '#0891B2', color: 'white', border: 'none', borderRadius: '4px', fontSize: '11px', fontWeight: '500' }}>
                                        📋 Fila NL
                                    </button>
                                    <button onClick={() => setIsEventsModalOpen(true)} disabled={loading} style={{ padding: '4px 10px', cursor: 'pointer', background: '#DC2626', color: 'white', border: 'none', borderRadius: '4px', fontSize: '11px', fontWeight: '500' }}>
                                        📅 Eventos
                                    </button>
                                    <button onClick={() => setIsBulkResetModalOpen(true)} disabled={loading} style={{ padding: '4px 10px', cursor: 'pointer', background: '#F59E0B', color: 'white', border: 'none', borderRadius: '4px', fontSize: '11px', fontWeight: '500' }}>
                                        🔄 Reset Período
                                    </button>
                                    {/* Botões S-140 - Sempre visíveis, usam semana da página em foco */}
                                    {(() => {
                                        // Calcular semana da página atual
                                        const currentFilteredWeeks = [...new Set(filteredParts.map(p => p.weekId))].sort();
                                        const safePage = Math.min(Math.max(currentPage, 1), currentFilteredWeeks.length || 1);
                                        const currentWeekId = currentFilteredWeeks[safePage - 1];
                                        const hasWeek = !!currentWeekId;

                                        return (
                                            <>
                                                <button
                                                    onClick={() => {
                                                        if (currentWeekId) {
                                                            const weekParts = parts.filter(p => p.weekId === currentWeekId);
                                                            downloadS140(weekParts);
                                                        }
                                                    }}
                                                    disabled={loading || !hasWeek}
                                                    style={{ padding: '4px 10px', cursor: hasWeek ? 'pointer' : 'not-allowed', background: '#059669', color: 'white', border: 'none', borderRadius: '4px', fontSize: '11px', fontWeight: '500', opacity: hasWeek ? 1 : 0.5 }}>
                                                    📋 S-140
                                                </button>
                                                <button
                                                    onClick={() => {
                                                        if (currentWeekId) {
                                                            const weekParts = parts.filter(p => p.weekId === currentWeekId);
                                                            downloadS140RoomB(weekParts);
                                                        }
                                                    }}
                                                    disabled={loading || !hasWeek}
                                                    style={{ padding: '4px 10px', cursor: hasWeek ? 'pointer' : 'not-allowed', background: '#0284c7', color: 'white', border: 'none', borderRadius: '4px', fontSize: '11px', fontWeight: '500', opacity: hasWeek ? 1 : 0.5 }}>
                                                    📋 Sala B
                                                </button>
                                                <button
                                                    onClick={() => {
                                                        if (currentWeekId) {
                                                            const weekParts = parts.filter(p => p.weekId === currentWeekId);
                                                            downloadS140RoomBEV(weekParts);
                                                        }
                                                    }}
                                                    disabled={loading || !hasWeek}
                                                    style={{ padding: '4px 10px', cursor: hasWeek ? 'pointer' : 'not-allowed', background: '#7c3aed', color: 'white', border: 'none', borderRadius: '4px', fontSize: '11px', fontWeight: '500', opacity: hasWeek ? 1 : 0.5 }}>
                                                    ⚡ Sala B EV
                                                </button>
                                                <button
                                                    onClick={() => setIsS140MultiModalOpen(true)}
                                                    disabled={loading}
                                                    style={{ padding: '4px 10px', cursor: 'pointer', background: '#0F766E', color: 'white', border: 'none', borderRadius: '4px', fontSize: '11px', fontWeight: '500' }}>
                                                    📦 Pacote
                                                </button>
                                            </>
                                        );
                                    })()}
                                </div>
                            </div>

                            {/* Linha Inferior: Filtros e Busca */}
                            <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap', alignItems: 'center' }}>
                                <input
                                    type="text"
                                    placeholder="🔍 Buscar..."
                                    value={searchText}
                                    onChange={e => setSearchText(e.target.value)}
                                    style={{ padding: '6px 10px', width: '180px', borderRadius: '4px', border: '1px solid #D1D5DB', fontSize: '12px' }}
                                />
                                {/* Navegação de Semanas com setas */}
                                <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                                    <button
                                        onClick={() => {
                                            const idx = uniqueWeeks.findIndex(w => w.weekId === filterWeek);
                                            if (idx > 0) setFilterWeek(uniqueWeeks[idx - 1].weekId);
                                            else if (idx === -1 && uniqueWeeks.length > 0) setFilterWeek(uniqueWeeks[uniqueWeeks.length - 1].weekId);
                                        }}
                                        disabled={uniqueWeeks.length === 0}
                                        style={{ padding: '4px 8px', border: '1px solid #D1D5DB', borderRadius: '4px', background: '#F9FAFB', cursor: 'pointer', fontSize: '14px' }}
                                        title="Semana anterior"
                                    >
                                        ⬅️
                                    </button>
                                    <select value={filterWeek} onChange={e => setFilterWeek(e.target.value)} style={{ padding: '6px', minWidth: '180px', borderRadius: '4px', border: '1px solid #D1D5DB', fontSize: '12px' }}>
                                        <option value="">Todas as semanas</option>
                                        {uniqueWeeks.map(w => {
                                            const cleanDisplay = w.weekDisplay.replace(/\bde\s+/gi, '').replace(/\s+/g, ' ').trim();
                                            return (
                                                <option key={w.weekId} value={w.weekId}>
                                                    {w.year} | {cleanDisplay}
                                                </option>
                                            );
                                        })}
                                    </select>
                                    <button
                                        onClick={() => {
                                            const idx = uniqueWeeks.findIndex(w => w.weekId === filterWeek);
                                            if (idx >= 0 && idx < uniqueWeeks.length - 1) setFilterWeek(uniqueWeeks[idx + 1].weekId);
                                            else if (idx === -1 && uniqueWeeks.length > 0) setFilterWeek(uniqueWeeks[0].weekId);
                                        }}
                                        disabled={uniqueWeeks.length === 0}
                                        style={{ padding: '4px 8px', border: '1px solid #D1D5DB', borderRadius: '4px', background: '#F9FAFB', cursor: 'pointer', fontSize: '14px' }}
                                        title="Próxima semana"
                                    >
                                        ➡️
                                    </button>
                                </div>
                                <select value={filterSection} onChange={e => setFilterSection(e.target.value)} style={{ padding: '6px', borderRadius: '4px', border: '1px solid #D1D5DB', fontSize: '12px' }}>
                                    <option value="">Seção: Todas</option>
                                    {uniqueSections.map(s => <option key={s} value={s}>{s}</option>)}
                                </select>
                                <select value={filterFuncao} onChange={e => setFilterFuncao(e.target.value)} style={{ padding: '6px', borderRadius: '4px', border: '1px solid #D1D5DB', fontSize: '12px' }}>
                                    <option value="">Função: Todas</option>
                                    <option value="Titular">Titular</option>
                                    <option value="Ajudante">Ajudante</option>
                                </select>
                                <select value={filterTipo} onChange={e => setFilterTipo(e.target.value)} style={{ padding: '6px', borderRadius: '4px', border: '1px solid #D1D5DB', fontSize: '12px' }}>
                                    <option value="">Tipo: Todos</option>
                                    {uniqueTipos.map(t => <option key={t} value={t}>{t}</option>)}
                                </select>
                                <select value={filterStatus} onChange={e => setFilterStatus(e.target.value)} style={{ padding: '6px', borderRadius: '4px', border: '1px solid #D1D5DB', fontSize: '12px' }}>
                                    <option value="">Status: Todos</option>
                                    <option value="PENDENTE">Pendente</option>
                                    <option value="PROPOSTA">Proposta</option>
                                    <option value="APROVADA">Aprovada</option>
                                    <option value="DESIGNADA">Designada</option>
                                    <option value="REJEITADA">Rejeitada</option>
                                    <option value="CONCLUIDA">Concluída</option>
                                </select>
                                {/* Toggle para exibir partes ocultas */}
                                <label
                                    style={{
                                        display: 'flex',
                                        alignItems: 'center',
                                        gap: '4px',
                                        fontSize: '11px',
                                        color: '#6B7280',
                                        cursor: 'pointer',
                                        padding: '4px 8px',
                                        background: showHiddenParts ? '#FEF3C7' : '#F3F4F6',
                                        borderRadius: '4px',
                                        border: showHiddenParts ? '1px solid #F59E0B' : '1px solid #D1D5DB'
                                    }}
                                    title="Exibir Cânticos, Comentários Iniciais/Finais, Oração Inicial e Elogios"
                                >
                                    <input
                                        type="checkbox"
                                        checked={showHiddenParts}
                                        onChange={e => setShowHiddenParts(e.target.checked)}
                                        style={{ cursor: 'pointer' }}
                                    />
                                    👁️ Ocultas
                                </label>
                            </div>
                        </div>

                        {/* Tabela */}
                        {/* Tabela com Scroll e Sticky Header */}
                        <div style={{ overflowX: 'auto', maxHeight: '80vh', overflowY: 'auto', border: '1px solid #E5E7EB', borderRadius: '6px' }}>
                            <table style={{ width: '100%', borderCollapse: 'separate', borderSpacing: 0, fontSize: '12px' }}>
                                <thead style={{ position: 'sticky', top: 0, zIndex: 10 }}>
                                    <tr style={{ background: '#4F46E5', color: 'white' }}>
                                        <th style={{ padding: '6px', minWidth: '80px', borderBottom: '1px solid #E5E7EB', position: 'sticky', top: 0, background: '#4F46E5', zIndex: 10 }}>Semana</th>
                                        <th style={{ padding: '6px', minWidth: '60px', borderBottom: '1px solid #E5E7EB', position: 'sticky', top: 0, background: '#4F46E5', zIndex: 10 }}>Seção</th>
                                        <th style={{ padding: '6px', minWidth: '80px', borderBottom: '1px solid #E5E7EB', position: 'sticky', top: 0, background: '#4F46E5', zIndex: 10 }}>TipoParte</th>
                                        <th style={{ padding: '6px', width: '80px', borderBottom: '1px solid #E5E7EB', position: 'sticky', top: 0, background: '#4F46E5', zIndex: 10 }}>Modalidade</th>
                                        <th style={{ padding: '6px', minWidth: '150px', borderBottom: '1px solid #E5E7EB', position: 'sticky', top: 0, background: '#4F46E5', zIndex: 10 }}>TituloParte</th>
                                        <th style={{ padding: '6px', width: '40px', textAlign: 'center', borderBottom: '1px solid #E5E7EB', position: 'sticky', top: 0, background: '#4F46E5', zIndex: 10 }} title="Descrição da Parte">📝</th>
                                        <th style={{ padding: '6px', width: '40px', textAlign: 'center', borderBottom: '1px solid #E5E7EB', position: 'sticky', top: 0, background: '#4F46E5', zIndex: 10 }} title="Detalhes da Parte">ℹ️</th>
                                        <th style={{ padding: '6px', minWidth: '100px', borderBottom: '1px solid #E5E7EB', position: 'sticky', top: 0, background: '#4F46E5', zIndex: 10 }}>Horário</th>
                                        <th style={{ padding: '6px', width: '60px', borderBottom: '1px solid #E5E7EB', position: 'sticky', top: 0, background: '#4F46E5', zIndex: 10 }}>Função</th>
                                        <th style={{ padding: '6px', width: '15%', minWidth: '140px', borderBottom: '1px solid #E5E7EB', position: 'sticky', top: 0, background: '#4F46E5', zIndex: 10 }}>Publicador</th>
                                        <th style={{ padding: '6px', width: '80px', borderBottom: '1px solid #E5E7EB', position: 'sticky', top: 0, background: '#4F46E5', zIndex: 10 }}>Status</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {(() => {
                                        // Lógica de Paginação por Semana
                                        // 1. Identificar semanas presentes nos dados filtrados
                                        const currentFilteredWeeks = [...new Set(filteredParts.map(p => p.weekId))].sort();
                                        const totalPages = currentFilteredWeeks.length || 1;
                                        const safePage = Math.min(Math.max(currentPage, 1), totalPages);

                                        // Se a página mudou devido a filtros, atualizar estado (efeito colateral controlado)
                                        if (currentPage !== safePage && currentPage > 1) {
                                            // Nota: Idealmente isso seria um useEffect, mas para renderização direta funciona se gerenciarmos o display
                                            // Vamos apenas usar o safePage para renderizar
                                        }

                                        const targetWeekId = currentFilteredWeeks[safePage - 1];
                                        const partsToRender = targetWeekId ? filteredParts.filter(p => p.weekId === targetWeekId) : [];

                                        return partsToRender.map(part => {
                                            // SIMPLIFICADO: Usar apenas resolved_publisher_name
                                            const displayRaw = part.resolvedPublisherName || part.rawPublisherName || '';

                                            // Tentar encontrar ID pelo nome
                                            let currentPubId = '';
                                            if (displayRaw) {
                                                const found = publishers.find(p => p.name === displayRaw);
                                                if (found) currentPubId = found.id;
                                            }

                                            // Determinar se é semana passada (restringe ações)
                                            const isPast = isPartInPastWeek(part.date);

                                            return (
                                                <tr
                                                    key={part.id}
                                                    style={{
                                                        background: sectionColors[part.section] || 'white',
                                                        color: '#1f2937',
                                                        borderLeft: isPast ? '3px solid #9CA3AF' : 'none'
                                                    }}
                                                    title={isPast ? '📅 Semana passada' : ''}
                                                >
                                                    <td style={{ padding: '4px', color: '#1f2937', fontWeight: '500' }}>
                                                        <div style={{ fontSize: '10px', color: '#6B7280', marginBottom: '2px' }}>{part.year}</div>
                                                        <div>{part.weekDisplay}</div>
                                                    </td>
                                                    <td style={{ padding: '4px', fontSize: '11px', color: '#374151', fontWeight: '500' }}>{part.section}</td>
                                                    <td style={{ padding: '4px', color: '#1f2937', fontWeight: '500' }}>{part.tipoParte}</td>
                                                    <td style={{ padding: '4px', fontSize: '11px', color: '#6B7280' }}>
                                                        {part.modalidade}
                                                    </td>
                                                    <td style={{ padding: '4px' }}>
                                                        <div style={{ fontWeight: '500', color: '#1f2937', maxWidth: '250px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }} title={part.tituloParte}>{part.tituloParte}</div>
                                                    </td>
                                                    <td style={{ padding: '4px', textAlign: 'center' }}>
                                                        {part.descricaoParte && (
                                                            <Tooltip content={part.descricaoParte}>
                                                                <span style={{ cursor: 'help', fontSize: '14px' }}>📝</span>
                                                            </Tooltip>
                                                        )}
                                                    </td>
                                                    <td style={{ padding: '4px', textAlign: 'center' }}>
                                                        {part.detalhesParte && (
                                                            <Tooltip content={part.detalhesParte}>
                                                                <span style={{ cursor: 'help', fontSize: '14px' }}>ℹ️</span>
                                                            </Tooltip>
                                                        )}
                                                    </td>
                                                    <td style={{ padding: '4px', textAlign: 'center', fontSize: '11px', color: '#6B7280' }}>
                                                        <div>{part.horaInicio} - {part.horaFim}</div>
                                                        <div style={{ fontSize: '10px', color: '#9CA3AF', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '2px' }}>
                                                            ({part.duracao || '?'})
                                                            {(!part.duracao || parseInt(String(part.duracao)) <= 0) && part.funcao === 'Titular' && (
                                                                <Tooltip content="⚠️ Duração não definida para esta parte de Titular">
                                                                    <span style={{ cursor: 'help', color: '#F59E0B', fontSize: '12px' }}>⚠️</span>
                                                                </Tooltip>
                                                            )}
                                                        </div>
                                                    </td>
                                                    <td style={{ padding: '4px', color: '#1f2937', fontWeight: '500' }}>{part.funcao}</td>
                                                    <td style={{ padding: '8px' }}>
                                                        {/* Dropdown Inteligente */}
                                                        <PublisherSelect
                                                            part={part}
                                                            publishers={publishers}
                                                            value={currentPubId}
                                                            displayName={displayRaw}
                                                            onChange={(newId, newName) => handlePublisherSelect(part.id, newId, newName)}
                                                            weekParts={partsToRender}
                                                            allParts={filteredParts}
                                                            style={{ width: '100%', border: '1px solid #E5E7EB', borderRadius: '4px', padding: '4px', fontSize: '13px' }}
                                                        />
                                                    </td>
                                                    <td style={{ padding: '4px', textAlign: 'center' }}>
                                                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', justifyContent: 'center' }}>
                                                            {(() => {
                                                                const config = getStatusConfig(part.status);
                                                                const isCancelled = part.status === 'CANCELADA';
                                                                const hasEventImpact = !!(part as { affectedByEventId?: string }).affectedByEventId;

                                                                const badge = (
                                                                    <span style={{
                                                                        padding: '2px 8px',
                                                                        borderRadius: '12px',
                                                                        fontSize: '11px',
                                                                        background: config.bg,
                                                                        color: config.text,
                                                                        border: `1px solid ${config.border}`,
                                                                        display: 'inline-flex',
                                                                        alignItems: 'center',
                                                                        gap: '4px',
                                                                        fontWeight: '600',
                                                                        cursor: isCancelled && part.cancelReason ? 'help' : 'default',
                                                                    }}>
                                                                        {hasEventImpact && <span title="Afetado por Evento Especial">⚡</span>}
                                                                        {config.icon} {config.label}
                                                                    </span>
                                                                );

                                                                // Wrap with tooltip only if cancelled with reason
                                                                if (isCancelled && part.cancelReason) {
                                                                    return (
                                                                        <Tooltip
                                                                            content={
                                                                                <div style={{ padding: '4px' }}>
                                                                                    <div style={{ fontWeight: 'bold', marginBottom: '4px' }}>🚫 Parte Cancelada</div>
                                                                                    <div style={{ fontSize: '12px' }}>Motivo: {part.cancelReason}</div>
                                                                                </div>
                                                                            }
                                                                        >
                                                                            {badge}
                                                                        </Tooltip>
                                                                    );
                                                                }
                                                                return badge;
                                                            })()}
                                                            <button
                                                                onClick={() => handleEditPart(part)}
                                                                className="text-gray-400 hover:text-blue-600 transition-colors"
                                                                title="Editar Parte"
                                                                style={{ border: 'none', background: 'transparent', cursor: 'pointer' }}
                                                            >
                                                                ✏️
                                                            </button>
                                                        </div>
                                                    </td>
                                                </tr>
                                            );
                                        });
                                    })()}
                                </tbody>
                            </table>
                        </div>

                        <PartEditModal
                            isOpen={isEditModalOpen}
                            part={editingPart}
                            onClose={() => setIsEditModalOpen(false)}
                            onSave={handleSaveEditPart}
                            onNavigate={(direction) => {
                                if (!editingPart) return;
                                const currentIndex = filteredParts.findIndex(p => p.id === editingPart.id);
                                if (currentIndex === -1) return;

                                const newIndex = direction === 'prev' ? currentIndex - 1 : currentIndex + 1;
                                if (newIndex >= 0 && newIndex < filteredParts.length) {
                                    setEditingPart(filteredParts[newIndex]);
                                }
                            }}
                            currentIndex={editingPart ? filteredParts.findIndex(p => p.id === editingPart.id) + 1 : 0}
                            totalCount={filteredParts.length}
                        />

                        <BulkResetModal
                            isOpen={isBulkResetModalOpen}
                            onClose={() => setIsBulkResetModalOpen(false)}
                            onSuccess={() => {
                                // Recarregar partes após reset
                                loadPartsWithFilters();
                            }}
                        />
                        {filteredParts.length === 0 && (
                            <div style={{ textAlign: 'center', padding: '40px', color: '#6B7280' }}>
                                Nenhuma parte encontrada. {parts.length > 0 ? 'Ajuste os filtros.' : 'Faça upload de um arquivo.'}
                            </div>
                        )}
                    </div> // Fecha o container flex-column do modo planning
                )
                } {/* Fecha o condicional do activeTab */}

                {/*Rodapé de contagem (comum ou específico?) - Deixar no planning*/}
                {
                    activeTab === 'planning' && (
                        <div style={{ padding: '10px 20px', borderTop: '1px solid #eee', background: '#fff' }}>
                            <div style={{ marginTop: '0', color: '#6B7280', fontSize: '13px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                                Mostrando {filteredParts.length} de {parts.length} partes
                                <Tooltip content="Partes como Cânticos, Comentários Iniciais/Finais, Oração Inicial e Elogios são ocultadas por serem gerenciadas automaticamente.">
                                    <span
                                        style={{
                                            cursor: 'help',
                                            background: 'rgba(107, 114, 128, 0.2)',
                                            borderRadius: '50%',
                                            width: '18px',
                                            height: '18px',
                                            display: 'inline-flex',
                                            alignItems: 'center',
                                            justifyContent: 'center',
                                            fontSize: '12px'
                                        }}
                                    >
                                        ?
                                    </span>
                                </Tooltip>
                            </div>
                            {/* Modal de Fila de Necessidades Locais */}
                            {isLocalNeedsQueueOpen && (
                                <div style={{
                                    position: 'fixed',
                                    top: 0,
                                    left: 0,
                                    right: 0,
                                    bottom: 0,
                                    background: 'rgba(0,0,0,0.5)',
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    zIndex: 9000
                                }}>
                                    <LocalNeedsQueue
                                        publishers={publishers.map(p => ({ id: p.id, name: p.name, condition: p.condition }))}
                                        availableWeeks={
                                            // Semanas futuras únicas ordenadas
                                            [...new Set(parts
                                                .filter(p => {
                                                    const d = new Date(p.date);
                                                    return d >= new Date();
                                                })
                                                .map(p => p.weekId)
                                            )]
                                                .sort()
                                                .map(weekId => {
                                                    const part = parts.find(p => p.weekId === weekId);
                                                    const year = part ? new Date(part.date).getFullYear() : '';
                                                    return {
                                                        weekId,
                                                        display: part?.weekDisplay ? `${part.weekDisplay} ${year}` : weekId
                                                    };
                                                })
                                        }
                                        onClose={() => setIsLocalNeedsQueueOpen(false)}
                                        onManualAssignment={async (assignment) => {
                                            try {
                                                setLoading(true);
                                                // 1. Encontrar a parte de NL da semana alvo
                                                const targetPart = parts.find(p => p.weekId === assignment.targetWeek && p.tipoParte === 'Necessidades Locais');

                                                if (!targetPart) {
                                                    alert('Parte de Necessidades Locais não encontrada nesta semana!');
                                                    return;
                                                }

                                                if (targetPart.status === 'CANCELADA') {
                                                    alert('A parte de Necessidades Locais desta semana está cancelada (Evento Especial). A pré-designação ficará na fila.');
                                                    return;
                                                }

                                                // 2. Marcar pré-designação como atribuída
                                                await localNeedsService.assignToPart(assignment.id, targetPart.id);

                                                // 3. Atualizar a parte imediatamente
                                                const newTitle = `Necessidades Locais: ${assignment.theme}`;
                                                await workbookService.updatePart(targetPart.id, {
                                                    tituloParte: newTitle,
                                                    resolvedPublisherName: assignment.assigneeName,
                                                    status: 'PROPOSTA'
                                                });

                                                // 4. Atualizar UI
                                                setParts(prev => prev.map(p => {
                                                    if (p.id === targetPart.id) {
                                                        return {
                                                            ...p,
                                                            tituloParte: newTitle,
                                                            resolvedPublisherName: assignment.assigneeName,
                                                            status: 'PROPOSTA'
                                                        };
                                                    }
                                                    return p;
                                                }));

                                                setSuccessMessage(`✅ Atribuído com sucesso: ${newTitle}`);
                                                setIsLocalNeedsQueueOpen(false); // Fechar modal após sucesso

                                            } catch (err) {
                                                alert('Erro ao atribuir: ' + (err instanceof Error ? err.message : 'Erro desconhecido'));
                                            } finally {
                                                setLoading(false);
                                            }
                                        }}
                                    />
                                </div>
                            )}
                            {/* Modal de Eventos Especiais */}
                            {isEventsModalOpen && (
                                <div style={{
                                    position: 'fixed',
                                    top: 0,
                                    left: 0,
                                    right: 0,
                                    bottom: 0,
                                    background: 'rgba(0,0,0,0.5)',
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    zIndex: 9000
                                }}>
                                    <SpecialEventsManager
                                        availableWeeks={
                                            [...new Set(parts.map(p => p.weekId))]
                                                .sort()
                                                .map(weekId => {
                                                    const part = parts.find(p => p.weekId === weekId);
                                                    const year = part ? new Date(part.date).getFullYear() : '';
                                                    return {
                                                        weekId,
                                                        display: part?.weekDisplay ? `${part.weekDisplay} ${year}` : weekId
                                                    };
                                                })
                                        }
                                        onClose={() => setIsEventsModalOpen(false)}
                                        onEventApplied={() => loadPartsWithFilters()}
                                    />
                                </div>
                            )}
                            {/* Modal de S-140 Multi-Semanas */}
                            {isS140MultiModalOpen && (
                                <div style={{
                                    position: 'fixed',
                                    top: 0,
                                    left: 0,
                                    right: 0,
                                    bottom: 0,
                                    background: 'rgba(0,0,0,0.5)',
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    zIndex: 9000
                                }}>
                                    <div style={{
                                        background: 'white',
                                        borderRadius: '12px',
                                        padding: '24px',
                                        maxWidth: '400px',
                                        width: '100%',
                                        boxShadow: '0 4px 20px rgba(0,0,0,0.15)'
                                    }}>
                                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
                                            <h3 style={{ margin: 0, color: '#1F2937' }}>📦 Gerar Pacote S-140</h3>
                                            <button onClick={() => setIsS140MultiModalOpen(false)} style={{ border: 'none', background: 'none', cursor: 'pointer', fontSize: '20px' }}>✕</button>
                                        </div>

                                        <div style={{ marginBottom: '16px' }}>
                                            <label style={{ display: 'block', fontSize: '12px', fontWeight: '600', color: '#374151', marginBottom: '4px' }}>Semana Inicial</label>
                                            <select value={s140StartWeek} onChange={e => setS140StartWeek(e.target.value)} style={{ width: '100%', padding: '8px 12px', borderRadius: '6px', border: '1px solid #D1D5DB', fontSize: '14px' }}>
                                                <option value="">Selecione...</option>
                                                {[...new Set(parts.map(p => p.weekId))].sort().map(weekId => {
                                                    const part = parts.find(p => p.weekId === weekId);
                                                    const year = part ? new Date(part.date).getFullYear() : '';
                                                    const display = part?.weekDisplay ? `${part.weekDisplay} ${year}` : weekId;
                                                    return (
                                                        <option key={weekId} value={weekId}>{display}</option>
                                                    );
                                                })}
                                            </select>
                                        </div>

                                        <div style={{ marginBottom: '20px' }}>
                                            <label style={{ display: 'block', fontSize: '12px', fontWeight: '600', color: '#374151', marginBottom: '4px' }}>Semana Final</label>
                                            <select value={s140EndWeek} onChange={e => setS140EndWeek(e.target.value)} style={{ width: '100%', padding: '8px 12px', borderRadius: '6px', border: '1px solid #D1D5DB', fontSize: '14px' }}>
                                                <option value="">Selecione...</option>
                                                {[...new Set(parts.map(p => p.weekId))].sort().map(weekId => {
                                                    const part = parts.find(p => p.weekId === weekId);
                                                    const year = part ? new Date(part.date).getFullYear() : '';
                                                    const display = part?.weekDisplay ? `${part.weekDisplay} ${year}` : weekId;
                                                    return (
                                                        <option key={weekId} value={weekId}>{display}</option>
                                                    );
                                                })}
                                            </select>
                                        </div>

                                        <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
                                            <button onClick={() => setIsS140MultiModalOpen(false)} style={{ padding: '8px 16px', border: '1px solid #D1D5DB', borderRadius: '6px', background: 'white', cursor: 'pointer' }}>Cancelar</button>
                                            <button
                                                onClick={async () => {
                                                    if (!s140StartWeek || !s140EndWeek) { alert('Selecione semana inicial e final'); return; }
                                                    const allWeeks = [...new Set(parts.map(p => p.weekId))].sort();
                                                    const startIdx = allWeeks.indexOf(s140StartWeek);
                                                    const endIdx = allWeeks.indexOf(s140EndWeek);
                                                    if (startIdx > endIdx) { alert('Semana inicial deve ser anterior ou igual à final'); return; }
                                                    const selectedWeeks = allWeeks.slice(startIdx, endIdx + 1);
                                                    try {
                                                        setLoading(true);
                                                        await downloadS140MultiWeek(parts, selectedWeeks);
                                                        setIsS140MultiModalOpen(false);
                                                        setS140StartWeek('');
                                                        setS140EndWeek('');
                                                    } catch (err) {
                                                        alert('Erro ao gerar pacote: ' + (err instanceof Error ? err.message : 'Erro'));
                                                    } finally {
                                                        setLoading(false);
                                                    }
                                                }}
                                                disabled={loading || !s140StartWeek || !s140EndWeek}
                                                style={{ padding: '8px 16px', border: 'none', borderRadius: '6px', background: '#0F766E', color: 'white', cursor: 'pointer', fontWeight: '500' }}
                                            >
                                                {loading ? 'Gerando...' : '📄 Gerar PDF'}
                                            </button>
                                        </div>
                                        <div style={{ marginTop: '16px', padding: '12px', background: '#F0F9FF', borderRadius: '6px', fontSize: '12px', color: '#0369A1' }}>
                                            💡 O PDF terá uma página por semana, no formato paisagem A4.
                                        </div>
                                    </div>
                                </div>
                            )}
                        </div>
                    )}
            </div>
            {loading && (
                <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.3)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 9999 }}>
                    <div style={{ background: 'white', padding: '24px', borderRadius: '12px' }}>
                        ⏳ Carregando...
                    </div>
                </div>
            )}
        </div>
    );
}

export default WorkbookManager;
