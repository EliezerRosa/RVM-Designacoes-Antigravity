/**
 * WorkbookManager - Gerenciador de Apostila
 * Componente principal para upload, CRUD e promoção de partes
 */

import { useState, useEffect, useMemo } from 'react';
import * as XLSX from 'xlsx';
import type { WorkbookPart, Publisher, HistoryRecord } from '../types';

import { workbookService, type WorkbookExcelRow } from '../services/workbookService';
import { generationService } from '../services/generationService';
import { undoService } from '../services/undoService';


import { loadCompletedParticipations } from '../services/historyAdapter';
import { localNeedsService } from '../services/localNeedsService';

import { SpecialEventsManager } from './SpecialEventsManager';
import { LocalNeedsQueue } from './LocalNeedsQueue';

import { TIPO_ORDER, HIDDEN_VIEW_TYPES } from '../constants/mappings';
import { Tooltip } from './Tooltip';
import { S140MultiModal } from './S140MultiModal';
import { WorkbookToolbar } from './WorkbookToolbar';
import { WorkbookTable } from './WorkbookTable';
import { PartEditModal } from './PartEditModal';
import { BulkResetModal } from './BulkResetModal';
import { GenerationModal, type GenerationConfig, type GenerationResult } from './GenerationModal';



import { ReportsTab } from './ReportsTab';
import { ParticipationAnalytics } from './ParticipationAnalytics';
import { generateSessionReport, type AnalyticsSummary } from '../services/analyticsService';




interface Props {
    publishers: Publisher[];
    isActive?: boolean;
    initialPartId?: string;
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



export function WorkbookManager({ publishers, isActive, initialPartId }: Props) {
    // ========================================================================
    // Estado
    // ========================================================================

    const [parts, setParts] = useState<WorkbookPart[]>([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [successMessage, setSuccessMessage] = useState<string | null>(null);
    const [historyRecords, setHistoryRecords] = useState<HistoryRecord[]>([]);

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

    // Undo State
    const [canUndo, setCanUndo] = useState(false);
    const [undoDescription, setUndoDescription] = useState<string | undefined>(undefined);

    useEffect(() => {
        // Subscribe to UndoService
        const unsubscribe = undoService.subscribe((hasUndo, desc) => {
            setCanUndo(hasUndo);
            setUndoDescription(desc);
        });
        return unsubscribe;
    }, []);

    // Estado para Relatórios
    const [reportData, setReportData] = useState<AnalyticsSummary | null>(null);
    const [activeTab, setActiveTab] = useState<'planning' | 'reports' | 'analytics'>('planning');

    // Estado do Modal de Reset em Lote
    const [isBulkResetModalOpen, setIsBulkResetModalOpen] = useState(false);

    // Estado do Modal de Geração
    const [isGenerationModalOpen, setIsGenerationModalOpen] = useState(false);

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


    // ========================================================================
    // Auto-Refresh when Tab becomes Active (Sync with Agent/Other Tabs)
    // ========================================================================
    useEffect(() => {
        if (isActive) {
            loadPartsWithFilters();
        }
    }, [isActive]);

    useEffect(() => {
        // Carregar histórico completo para cooldown (12 meses) — apenas no mount
        loadCompletedParticipations().then(setHistoryRecords);
    }, []);

    // NEW: Handle initialPartId from URL action links
    useEffect(() => {
        if (initialPartId && parts.length > 0) {
            // Find the part in the loaded list
            const part = parts.find(p => p.id === initialPartId);
            if (part) {
                console.log(`[WorkbookManager] Auto-opening modal for initialPartId: ${initialPartId}`);
                handleEditPart(part);

                // Optional: Scroll to it if it's in the list
                // (Modal opens over the list, so it's already "focused")
            } else {
                console.log(`[WorkbookManager] initialPartId ${initialPartId} not found in current loaded parts (${parts.length})`);
                // If not found, maybe it's very old or the ID is wrong
            }
        }
    }, [initialPartId, parts.length > 0]); // Only trigger when initialPartId is present and parts are loaded

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
    const handleGenerateDesignations = async (config?: GenerationConfig): Promise<GenerationResult> => {
        try {
            setLoading(true);
            setError(null);

            // =================================================================
            // UNDO: Capture state BEFORE generation
            // =================================================================
            // Filtrar apenas o que potencialmente vai mudar para o snapshot (simplificado: tudo pendente)
            const partsNeedingAssignment = parts.filter(p => !p.resolvedPublisherName || p.status === 'PENDENTE');
            if (partsNeedingAssignment.length > 0) {
                undoService.captureBatch(partsNeedingAssignment, `Geração Automática Clean`);
            }

            // =================================================================
            // DELEGATE TO UNIFIED BRAIN (generationService)
            // =================================================================
            const result = await generationService.generateDesignations(parts, publishers, config);

            // Refresh UI if needed
            if (result.success && !result.dryRun) {
                // Pequeno delay para garantir propagação no Supabase (opcional)
                // await new Promise(r => setTimeout(r, 500)); 
                await loadPartsWithFilters();
            }

            return result;

        } catch (err) {
            console.error('[WorkbookManager] ❌ Erro na geração:', err);
            const msg = err instanceof Error ? err.message : 'Erro ao processar';
            setError(msg);
            return {
                success: false,
                partsGenerated: 0,
                warnings: [],
                errors: [msg],
                dryRun: config?.isDryRun ?? false
            };
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

    // HIDDEN_VIEW_TYPES - partes gerenciadas automaticamente pelo Presidente + tipos genéricos indesejados
    // Importado de @/constants/mappings

    const uniqueTipos = useMemo(() => {
        const tiposSet = [...new Set(parts.map(p => p.tipoParte))].filter(t => !HIDDEN_VIEW_TYPES.includes(t));
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
            if (!showHiddenParts && HIDDEN_VIEW_TYPES.includes(p.tipoParte)) {
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




    // Helper para atualizar publisher do dropdown
    const handlePublisherSelect = async (partId: string, _newId: string, newName: string) => {
        try {
            // Tentar pegar a part atual para checar status
            const part = parts.find(p => p.id === partId);
            if (!part) return;

            // Determinar novos valores e se precisa mudar status
            const isDesignada = part.status === 'DESIGNADA' || part.status === 'CONCLUIDA' || part.status === 'APROVADA';

            // UNDO: Capture state BEFORE update
            undoService.captureSingle(part, `Alteração Manual: ${part.tituloParte}`);

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

            // Chamada ao Backend via Unified Action Service (The Hand)
            // Import dinâmico para evitar ciclo (embora WorkbookManager seja componente)
            const { unifiedActionService } = await import('../services/unifiedActionService');

            let result;
            if (newName) {
                // Designar
                result = await unifiedActionService.executeDesignation(
                    partId,
                    newName,
                    'MANUAL',
                    'Seleção via Dropdown'
                );
            } else {
                // Reverter/Limpar
                result = await unifiedActionService.revertDesignation(
                    partId,
                    'MANUAL',
                    'Limpeza via Dropdown'
                );
            }

            if (!result.success) {
                throw new Error(result.error);
            }
        } catch (e) {
            console.error('Erro ao atualizar publicador:', e);
            const msg = e instanceof Error ? e.message : 'Erro desconhecido';

            if (msg.includes('Failed to fetch dynamically imported module')) {
                console.warn('[WorkbookManager] Refreshing page to load new app version...');
                window.location.reload();
                return;
            }

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
        <div style={{ display: 'flex', flexDirection: 'column', height: '100vh', background: 'var(--bg-primary)', color: 'var(--text-primary)', fontFamily: 'Inter, sans-serif', minWidth: 0 }}>

            {/* Header Tabs */}
            <div style={{ padding: '10px 20px', background: 'white', borderBottom: '1px solid #E5E7EB', display: 'flex', flexWrap: 'wrap', gap: '10px', justifyContent: 'space-between', alignItems: 'center', boxShadow: '0 2px 4px rgba(0,0,0,0.05)' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '20px', flexWrap: 'wrap' }}>
                    <h2 className="hide-on-mobile-strict" style={{ margin: 0, fontSize: '1.2em', fontWeight: '600', color: '#1F2937' }}>RVM Designações</h2>
                    <div style={{ display: 'flex', gap: '8px' }}>
                        <button onClick={() => setActiveTab('planning')} style={{ padding: '8px 16px', borderRadius: '6px', border: 'none', background: activeTab === 'planning' ? '#E0E7FF' : 'transparent', color: activeTab === 'planning' ? '#4338CA' : '#6B7280', fontWeight: '600', cursor: 'pointer', transition: 'all 0.2s' }}>Planejamento</button>
                        <button onClick={handleGenerateReport} style={{ padding: '8px 16px', borderRadius: '6px', border: 'none', background: activeTab === 'reports' ? '#E0E7FF' : 'transparent', color: activeTab === 'reports' ? '#4338CA' : '#6B7280', fontWeight: '600', cursor: 'pointer', transition: 'all 0.2s', display: 'flex', alignItems: 'center', gap: '6px' }}>
                            <span>📊</span> Relatórios
                        </button>
                        <button onClick={() => setActiveTab('analytics')} style={{ padding: '8px 16px', borderRadius: '6px', border: 'none', background: activeTab === 'analytics' ? '#E0E7FF' : 'transparent', color: activeTab === 'analytics' ? '#4338CA' : '#6B7280', fontWeight: '600', cursor: 'pointer', transition: 'all 0.2s', display: 'flex', alignItems: 'center', gap: '6px' }}>
                            <span>📈</span> Análises
                        </button>
                    </div>
                </div>
                <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
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

            <div style={{ flex: 1, overflowY: 'auto', position: 'relative', minWidth: 0 }}>
                {activeTab === 'reports' ? (
                    <ReportsTab data={reportData} />
                ) : activeTab === 'analytics' ? (
                    <ParticipationAnalytics />
                ) : (
                    <div style={{ padding: '0 16px 8px', maxWidth: '1600px', width: '100%', margin: '0 auto', minHeight: '100%' }}>


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
                        <WorkbookToolbar
                            loading={loading}
                            canUndo={canUndo}
                            undoDescription={undoDescription}
                            showHiddenParts={showHiddenParts}
                            searchText={searchText}
                            filterWeek={filterWeek}
                            filterSection={filterSection}
                            filterFuncao={filterFuncao}
                            filterTipo={filterTipo}
                            filterStatus={filterStatus}
                            filteredParts={filteredParts}
                            parts={parts}
                            currentPage={currentPage}
                            uniqueWeeks={uniqueWeeks}
                            uniqueSections={uniqueSections}
                            uniqueTipos={uniqueTipos}
                            onSearchTextChange={setSearchText}
                            onFilterWeekChange={setFilterWeek}
                            onFilterSectionChange={setFilterSection}
                            onFilterFuncaoChange={setFilterFuncao}
                            onFilterTipoChange={setFilterTipo}
                            onFilterStatusChange={setFilterStatus}
                            onShowHiddenPartsChange={setShowHiddenParts}
                            onCurrentPageChange={setCurrentPage}
                            onFileUpload={handleFileUpload}
                            onRefresh={() => loadPartsWithFilters()}
                            onOpenGeneration={() => setIsGenerationModalOpen(true)}
                            onOpenLocalNeeds={() => setIsLocalNeedsQueueOpen(true)}
                            onOpenEvents={() => setIsEventsModalOpen(true)}
                            onOpenBulkReset={() => setIsBulkResetModalOpen(true)}
                            onOpenS140Multi={() => setIsS140MultiModalOpen(true)}
                            setLoading={setLoading}
                            setSuccessMessage={setSuccessMessage}
                        />

                        {/* Tabela */}
                        <WorkbookTable
                            filteredParts={filteredParts}
                            publishers={publishers}
                            historyRecords={historyRecords}
                            currentPage={currentPage}
                            onPublisherSelect={handlePublisherSelect}
                            onEditPart={handleEditPart}
                        />

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
                                        onManualAssignment={async (assignment: any) => {
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
                                        workbookParts={parts}
                                        onClose={() => setIsEventsModalOpen(false)}
                                        onEventApplied={() => loadPartsWithFilters()}
                                    />
                                </div>
                            )}
                            {/* Modal de S-140 Multi-Semanas */}
                            <S140MultiModal
                                isOpen={isS140MultiModalOpen}
                                parts={parts}
                                onClose={() => setIsS140MultiModalOpen(false)}
                            />
                        </div>
                    )}
            </div>

            {/* Modal de Geração Inteligente */}
            <GenerationModal
                isOpen={isGenerationModalOpen}
                onClose={() => setIsGenerationModalOpen(false)}
                onGenerate={handleGenerateDesignations}
                parts={parts}
                publishers={publishers}
                onNavigateToPart={(partId) => {
                    // Encontrar a parte e navegar para sua semana
                    const targetPart = parts.find(p => p.id === partId);
                    if (targetPart) {
                        // 1. Navegar para a aba Apostila (planning)
                        setActiveTab('planning');

                        // 2. Limpar filtros e definir filtro de semana
                        setFilterSection('');
                        setFilterFuncao('');
                        setFilterTipo('');
                        setFilterStatus('');
                        setFilterWeek(targetPart.weekId);

                        // 3. Destacar a parte visualmente (usar setTimeout para esperar renderização)
                        setTimeout(() => {
                            const row = document.querySelector(`tr[data-part-id="${partId}"]`);
                            if (row) {
                                row.scrollIntoView({ behavior: 'smooth', block: 'center' });
                                (row as HTMLElement).style.animation = 'highlight-flash 2s ease-out';
                            }
                        }, 300);

                        console.log(`[GenerationModal] Navegando para parte: ${targetPart.tituloParte} (${targetPart.weekDisplay})`);
                    }
                }}
            />

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
