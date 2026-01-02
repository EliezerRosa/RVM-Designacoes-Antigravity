/**
 * WorkbookManager - Gerenciador de Apostila
 * Componente principal para upload, CRUD e promoção de partes
 */

import { useState, useEffect, useMemo } from 'react';
import * as XLSX from 'xlsx';
import type { WorkbookPart, Publisher, HistoryRecord } from '../types';
import { EnumModalidade, EnumFuncao } from '../types';
import { workbookService, type WorkbookExcelRow } from '../services/workbookService';
import { checkEligibility } from '../services/eligibilityService';
import { selectBestCandidate } from '../services/cooldownService';
import { loadCompletedParticipations } from '../services/historyAdapter';
import { PublisherSelect } from './PublisherSelect';
import { SpecialEventManager } from './SpecialEventManager';
import { getStatusConfig } from '../constants/status';
import { downloadS140 } from '../services/s140Generator';
import { PartEditModal } from './PartEditModal';
import { Tooltip } from './Tooltip';

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

    // Paginação
    const [currentPage, setCurrentPage] = useState(1);


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

            // Mapear section para partType
            const getPartTypeFromSection = (section: string): string => {
                const lower = section.toLowerCase();
                if (lower.includes('tesouros')) return 'tesouros';
                if (lower.includes('ministério') || lower.includes('ministerio')) return 'ministerio';
                if (lower.includes('vida')) return 'vida_crista';
                return 'ministerio';
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


            for (const [_weekId, weekParts] of Object.entries(byWeek)) {
                for (const part of weekParts) {
                    const modalidade = getModalidade(part);
                    const partType = getPartTypeFromSection(part.section);
                    const isOracaoInicial = part.tipoParte.toLowerCase().includes('inicial');

                    // Determinar função (Titular ou Ajudante)
                    const funcao = part.funcao === 'Ajudante' ? EnumFuncao.AJUDANTE : EnumFuncao.TITULAR;

                    // 1. Filtrar publicadores elegíveis (respeita função e seção)
                    const eligiblePublishers = publishers.filter(p => {
                        const result = checkEligibility(
                            p,
                            modalidade as Parameters<typeof checkEligibility>[1],
                            funcao,
                            { date: part.date, isOracaoInicial, secao: part.section }
                        );
                        return result.eligible;
                    });

                    // 2. Selecionar melhor candidato via cooldownService
                    let selectedPublisher: Publisher | null = null;

                    if (eligiblePublishers.length > 0) {
                        selectedPublisher = selectBestCandidate(
                            eligiblePublishers,
                            historyRecords,
                            partType
                        );

                        if (selectedPublisher) {
                            // found
                        } else {
                            // Fallback: primeiro elegível
                            selectedPublisher = eligiblePublishers[0];
                        }
                    }

                    // Armazenar publicador selecionado no Map para usar depois
                    if (selectedPublisher) {
                        selectedPublisherByPart.set(part.id, { id: selectedPublisher.id, name: selectedPublisher.name });
                        totalWithPublisher++;
                    }
                }

                // Atualizar totalCreated baseado nas propostas geradas
                totalCreated += partsNeedingAssignment.length;
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
                    // Isso evita registros "Proposta" em branco.
                    console.warn(`[Motor] Nenhum publicador encontrado para parte ${part.id} (${part.tipoParte}). Mantendo status original.`);
                    // Opcional: Se quiser explicitar que falhou, poderia ter um status 'PENDENTE' mas com log de erro? 
                    // Melhor deixar 'PENDENTE' para que possa ser tentado de novo ou preenchido manualmente.

                    // Se por acaso estava em outro status e resetou? Aqui só pegamos o que não era DESIGNADA/CONCLUIDA.
                    // Se estava PROPOSTA (but empty?) deve voltar pra PENDENTE?
                    // Por segurança, se não achamos ninguem, não mexemos.
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
            // OCULTAR IMEDIATAMENTE partes secundárias do Presidente (Comentários Iniciais/Finais)
            // Elas são gerenciadas automaticamente pela parte "Presidente"
            // OCULTAR IMEDIATAMENTE partes secundárias do Presidente
            const HIDDEN_TYPES = [
                'Comentários Iniciais', 'Comentarios Iniciais',
                'Comentários Finais', 'Comentarios Finais',
                'Cântico Inicial', 'Cântico do Meio', 'Cântico Final', 'Cântico', 'Cantico',
                'Oração Inicial', 'Oracao Inicial',
                'Elogios e Conselhos', 'Elogios e conselhos'
            ];

            if (HIDDEN_TYPES.includes(p.tipoParte)) {
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
    }, [parts, filterWeek, filterSection, filterTipo, filterStatus, filterFuncao, searchText]);

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
            // Recarregar partes para desfazer optimistic update errado
            // (Se eu tivesse acesso ao fetchParts, chamaria aqui. Mas ele está dentro do hook loadParts?
            //  Na verdade handleGenerate chama setParts. 
            //  O ideal para garantir consistência seria forçar um reload.)
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
            // 1. Atualizar a parte individual (Fluxo normal)
            const updatedPart = await workbookService.updatePart(id, updates);

            // 2. Se a flag applyToWeek estiver ativa, atualizar toda a semana
            if (applyToWeek && updates.status && updatedPart.weekId) {
                console.log(`[WorkbookManager] 🔄 Aplicando status '${updates.status}' para toda a semana ${updatedPart.weekId}`);
                await workbookService.updateWeekStatus(updatedPart.weekId, updates.status);

                // Atualizar estado local para TODAS as partes da semana
                setParts(prev => prev.map(p =>
                    p.weekId === updatedPart.weekId
                        ? { ...p, status: updates.status! } // ! seguro pois verificamos if updates.status
                        : p
                ));

                // Atualizar também a parte atual no loop (já que o updatePart retorna ela atualizada, mas aqui ajustamos tudo)
                // O map acima já cuida disso se a parte atual tiver o mesmo weekId (dã, tem)
            } else {
                // Atualização Individual Apenas
                setParts(prev => prev.map(p => p.id === id ? updatedPart : p));
            }

            // Fechar modal é feito no componente modal ao chamar onSave com sucesso
        } catch (error) {
            console.error('Erro ao salvar parte:', error);
            alert('Erro ao salvar alterações: ' + (error instanceof Error ? error.message : String(error)));
            throw error; // Repassar erro para o modal lidar (loading state)
        }
    };

    return (
        <div style={{ padding: '0 16px 8px', maxWidth: '1600px', margin: '0 auto', fontFamily: 'Inter, sans-serif' }}>


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
                        {filterWeek && (
                            <button
                                onClick={() => {
                                    const weekParts = parts.filter(p => p.weekId === filterWeek);
                                    downloadS140(weekParts);
                                }}
                                disabled={loading || !filterWeek}
                                style={{ padding: '6px 12px', cursor: 'pointer', background: '#059669', color: 'white', border: 'none', borderRadius: '4px', fontSize: '12px', fontWeight: '500' }}>
                                📋 S-140
                            </button>
                        )}
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
                    <select value={filterWeek} onChange={e => setFilterWeek(e.target.value)} style={{ padding: '6px', minWidth: '180px', borderRadius: '4px', border: '1px solid #D1D5DB', fontSize: '12px' }}>
                        <option value="">Todas as semanas</option>
                        {uniqueWeeks.map(w => {
                            // FORMATO COMPACTO: YYYY | dd-dd MMMMM-MMMMM
                            // Input: w.weekDisplay = "29-4 de Janeiro-Fevereiro" (assumido do parser) ou similar
                            const cleanDisplay = w.weekDisplay.replace(/\bde\s+/gi, '').replace(/\s+/g, ' ').trim();
                            return (
                                <option key={w.weekId} value={w.weekId}>
                                    {w.year} | {cleanDisplay}
                                </option>
                            );
                        })}
                    </select>
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
                </div>
            </div>

            {/* Eventos Especiais - aparece quando filtrar por semana */}
            {filterWeek && (
                <SpecialEventManager
                    weekId={filterWeek}
                    weekDisplay={uniqueWeeks.find(w => w.weekId === filterWeek)?.weekDisplay || ''}
                    publishers={publishers}
                    onEventChange={() => loadPartsWithFilters()}
                />
            )}

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
                                            <div style={{ fontSize: '10px', color: '#9CA3AF' }}>({part.duracao})</div>
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
                                                style={{ width: '100%', border: '1px solid #E5E7EB', borderRadius: '4px', padding: '4px', fontSize: '13px' }}
                                            />
                                        </td>
                                        <td style={{ padding: '4px', textAlign: 'center' }}>
                                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', justifyContent: 'center' }}>
                                                {(() => {
                                                    const config = getStatusConfig(part.status);
                                                    return (
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
                                                        }}>
                                                            {config.icon} {config.label}
                                                        </span>
                                                    );
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

            {filteredParts.length === 0 && (
                <div style={{ textAlign: 'center', padding: '40px', color: '#6B7280' }}>
                    Nenhuma parte encontrada. {parts.length > 0 ? 'Ajuste os filtros.' : 'Faça upload de um arquivo.'}
                </div>
            )}

            <div style={{ marginTop: '16px', color: '#6B7280', fontSize: '13px', display: 'flex', alignItems: 'center', gap: '6px' }}>
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
