/**
 * WorkbookManager - Gerenciador de Apostila
 * Componente principal para upload, CRUD e promoção de partes
 */

import { useState, useEffect, useMemo } from 'react';
import * as XLSX from 'xlsx';
import type { WorkbookPart, WorkbookBatch, Publisher, TeachingCategory, ParticipationType, HistoryRecord } from '../types';
import { EnumModalidade, EnumFuncao } from '../types';
import { workbookService, type WorkbookExcelRow } from '../services/workbookService';
import { pdfExtractionService } from '../services/pdfExtractionService';
import { assignmentService } from '../services/assignmentService';
import { checkEligibility } from '../services/eligibilityService';
import { selectBestCandidate } from '../services/cooldownService';
import { loadHistoryRecords } from '../services/historyService';


interface Props {
    publishers: Publisher[];
}

// Colunas esperadas no Excel da apostila
const EXPECTED_COLUMNS = [
    'id', 'weekId', 'weekDisplay', 'date', 'section', 'tipoParte',
    'tituloParte', 'descricao', 'seq', 'funcao', 'duracao',
    'horaInicio', 'horaFim', 'rawPublisherName', 'status'
];

export function WorkbookManager({ publishers }: Props) {
    // ========================================================================
    // Estado
    // ========================================================================
    const [batches, setBatches] = useState<WorkbookBatch[]>([]);
    const [activeBatch, setActiveBatch] = useState<WorkbookBatch | null>(null);
    const [parts, setParts] = useState<WorkbookPart[]>([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [successMessage, setSuccessMessage] = useState<string | null>(null);

    // Seleção
    const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

    // Filtros
    const [filterWeek, setFilterWeek] = useState<string>('');
    const [filterSection, setFilterSection] = useState<string>('');
    const [filterTipo, setFilterTipo] = useState<string>('');
    const [filterStatus, setFilterStatus] = useState<string>('');
    const [filterFuncao, setFilterFuncao] = useState<string>('');
    const [searchText, setSearchText] = useState<string>('');

    // PDF Extraction State
    const [extractedParts, setExtractedParts] = useState<WorkbookExcelRow[]>([]);
    const [showExtractPreview, setShowExtractPreview] = useState(false);
    const [extractionInfo, setExtractionInfo] = useState<{ year: number; totalWeeks: number } | null>(null);
    const [extracting, setExtracting] = useState(false);

    // ========================================================================
    // Carregar dados iniciais
    // ========================================================================
    useEffect(() => {
        loadBatches();
    }, []);

    useEffect(() => {
        if (activeBatch) {
            loadParts(activeBatch.id);
            // Inscrever para mudanças em tempo real
            const channel = workbookService.subscribeToChanges(activeBatch.id, (payload) => {
                if (payload.eventType === 'INSERT' && payload.new) {
                    setParts(prev => [...prev, payload.new!]);
                } else if (payload.eventType === 'UPDATE' && payload.new) {
                    setParts(prev => prev.map(p => p.id === payload.new!.id ? payload.new! : p));
                } else if (payload.eventType === 'DELETE' && payload.old) {
                    setParts(prev => prev.filter(p => p.id !== payload.old!.id));
                }
            });
            return () => workbookService.unsubscribe(channel);
        }
    }, [activeBatch]);

    const loadBatches = async () => {
        try {
            setLoading(true);
            const data = await workbookService.getBatches();
            setBatches(data);
            // Selecionar batch ativo automaticamente
            const active = data.find(b => b.isActive);
            if (active) setActiveBatch(active);
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Erro ao carregar batches');
        } finally {
            setLoading(false);
        }
    };

    const loadParts = async (batchId: string) => {
        try {
            setLoading(true);
            const data = await workbookService.getPartsByBatch(batchId);
            setParts(data);
            setSelectedIds(new Set());
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Erro ao carregar partes');
        } finally {
            setLoading(false);
        }
    };

    // ========================================================================
    // Upload de Excel
    // ========================================================================
    const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
        const file = event.target.files?.[0];
        if (!file) return;

        try {
            setLoading(true);
            setError(null);

            const arrayBuffer = await file.arrayBuffer();
            const workbook = XLSX.read(arrayBuffer, { type: 'array' });
            const sheetName = workbook.SheetNames[0];
            const worksheet = workbook.Sheets[sheetName];
            const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(worksheet);

            if (rows.length === 0) {
                throw new Error('Planilha vazia');
            }

            // Validar colunas
            const firstRow = rows[0];
            const missingColumns = EXPECTED_COLUMNS.filter(col => !(col in firstRow));
            if (missingColumns.length > 0) {
                console.warn('Colunas ausentes:', missingColumns);
            }

            // Converter para WorkbookExcelRow
            const excelRows: WorkbookExcelRow[] = rows.map(row => ({
                id: row.id as string,
                weekId: row.weekId as string || '',
                weekDisplay: row.weekDisplay as string || '',
                date: row.date as string || '',
                section: row.section as string || '',
                tipoParte: row.tipoParte as string || '',
                partTitle: row.tituloParte as string || '',
                descricao: row.descricaoParte as string || '',
                seq: (row.seq as number) || 0,
                funcao: (row.funcao as 'Titular' | 'Ajudante') || 'Titular',
                duracao: row.duracao as string || '',
                horaInicio: row.horaInicio as string || '',
                horaFim: row.horaFim as string || '',
                rawPublisherName: row.rawPublisherName as string || '',
                status: row.status as string || 'DRAFT',
            }));

            // Criar batch
            const batch = await workbookService.createBatch(file.name, excelRows);
            setSuccessMessage(`✅ Importadas ${excelRows.length} partes de "${file.name}"`);

            // Recarregar
            await loadBatches();
            setActiveBatch(batch);

        } catch (err) {
            setError(err instanceof Error ? err.message : 'Erro ao processar arquivo');
        } finally {
            setLoading(false);
            event.target.value = '';
        }
    };

    // ========================================================================
    // PDF Extraction
    // ========================================================================
    const handleExtractPDF = async (event: React.ChangeEvent<HTMLInputElement>) => {
        const file = event.target.files?.[0];
        if (!file) return;

        try {
            setExtracting(true);
            setError(null);

            const result = await pdfExtractionService.extractWorkbookParts(file);

            if (!result.success) {
                throw new Error(result.error || 'Extração falhou');
            }

            setExtractedParts(result.records);
            setExtractionInfo({ year: result.year, totalWeeks: result.totalWeeks });
            setShowExtractPreview(true);

        } catch (err) {
            console.error('Erro detalhado:', err);
            setError(err instanceof Error ? err.message : 'Erro ao extrair PDF');
        } finally {
            setExtracting(false);
            event.target.value = '';
        }
    };

    const handleDownloadExcel = () => {
        if (extractedParts.length === 0) return;

        try {
            const ws = XLSX.utils.json_to_sheet(extractedParts);
            const wb = XLSX.utils.book_new();
            XLSX.utils.book_append_sheet(wb, ws, "Extração");
            XLSX.writeFile(wb, `Extracao_Apostila_${extractionInfo?.year || new Date().getFullYear()}.xlsx`);
        } catch (err) {
            setError('Erro ao gerar Excel: ' + (err as Error).message);
        }
    };

    const handleConfirmExtraction = async () => {
        if (extractedParts.length === 0) return;

        try {
            setLoading(true);
            setError(null);

            // Criar batch com as partes extraídas
            const batch = await workbookService.createBatch('PDF Extraction', extractedParts);

            setSuccessMessage(`✅ Importadas ${extractedParts.length} partes do PDF`);
            setShowExtractPreview(false);
            setExtractedParts([]);
            setExtractionInfo(null);

            // Recarregar
            await loadBatches();
            setActiveBatch(batch);

        } catch (err) {
            setError(err instanceof Error ? err.message : 'Erro ao salvar partes');
        } finally {
            setLoading(false);
        }
    };

    // ========================================================================
    // Ações
    // ========================================================================
    const handleUpdatePart = async (id: string, field: keyof WorkbookPart, value: string | number) => {
        try {
            await workbookService.updatePart(id, { [field]: value });
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Erro ao atualizar');
        }
    };

    const handleDeleteSelected = async () => {
        if (selectedIds.size === 0) return;
        if (!confirm(`Deletar ${selectedIds.size} partes selecionadas?`)) return;

        try {
            setLoading(true);
            for (const id of selectedIds) {
                await workbookService.deletePart(id);
            }
            setSelectedIds(new Set());
            if (activeBatch) await loadParts(activeBatch.id);
            setSuccessMessage(`✅ ${selectedIds.size} partes deletadas`);
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Erro ao deletar');
        } finally {
            setLoading(false);
        }
    };

    // ========================================================================
    // Gerar Designações (Motor Completo)
    // ========================================================================
    const handleGenerateDesignations = async () => {
        if (!activeBatch) return;

        // Filtrar partes que precisam de designação (função Titular, não promovidas)
        const partsNeedingAssignment = parts.filter(p =>
            p.funcao === 'Titular' &&
            p.status !== 'PROMOTED'
        );

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

            // Carregar histórico para cooldown
            let historyRecords: HistoryRecord[] = [];
            try {
                historyRecords = await loadHistoryRecords();
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

            // Mapear tipoParte/modalidade para category
            const getCategoryFromModalidade = (modalidade: string): string => {
                if (modalidade === EnumModalidade.LEITURA_ESTUDANTE ||
                    modalidade === EnumModalidade.DISCURSO_ESTUDANTE ||
                    modalidade === EnumModalidade.DEMONSTRACAO) return 'STUDENT';
                return 'TEACHING';
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

            for (const [weekId, weekParts] of Object.entries(byWeek)) {
                const assignments = [];

                for (const part of weekParts) {
                    const modalidade = getModalidade(part);
                    const partType = getPartTypeFromSection(part.section);
                    const isOracaoInicial = part.tipoParte.toLowerCase().includes('inicial');

                    // 1. Filtrar publicadores elegíveis
                    const eligiblePublishers = publishers.filter(p => {
                        const result = checkEligibility(
                            p,
                            modalidade as Parameters<typeof checkEligibility>[1],
                            EnumFuncao.TITULAR,
                            { date: part.date, isOracaoInicial }
                        );
                        return result.eligible;
                    });

                    // 2. Selecionar melhor candidato via cooldownService
                    let selectedPublisher: Publisher | null = null;
                    let selectionReason = '';

                    if (eligiblePublishers.length > 0) {
                        selectedPublisher = selectBestCandidate(
                            eligiblePublishers,
                            historyRecords,
                            partType
                        );

                        if (selectedPublisher) {
                            totalWithPublisher++;
                            selectionReason = `Motor: ${eligiblePublishers.length} elegíveis, selecionado por rotação`;
                        } else {
                            selectionReason = `${eligiblePublishers.length} elegíveis, sem histórico para ranking`;
                            // Fallback: primeiro elegível
                            selectedPublisher = eligiblePublishers[0];
                        }
                    } else {
                        selectionReason = `Nenhum publicador elegível para ${modalidade}`;
                    }

                    assignments.push({
                        weekId: weekId,
                        partId: part.id,
                        partTitle: part.tituloParte || part.tituloParte || part.tipoParte,
                        partType: partType as ParticipationType,
                        teachingCategory: getCategoryFromModalidade(modalidade) as TeachingCategory,
                        principalPublisherId: selectedPublisher?.id || '',
                        principalPublisherName: selectedPublisher?.name || 'A designar',
                        secondaryPublisherId: undefined,
                        secondaryPublisherName: undefined,
                        date: part.date,
                        startTime: part.horaInicio || undefined,
                        endTime: part.horaFim || undefined,
                        durationMin: parseInt(part.duracao) || 0,
                        status: 'PENDING_APPROVAL' as const,
                        selectionReason: selectionReason,
                        score: 0,
                        room: undefined,
                    });
                }

                // Criar em batch
                await assignmentService.createBatch(assignments);
                totalCreated += assignments.length;
            }

            setSuccessMessage(`✅ ${totalCreated} designações criadas (${totalWithPublisher} com publicador selecionado pelo motor)! Vá para a aba "Aprovações" para revisar.`);

            // Marcar partes como REFINED
            for (const part of partsNeedingAssignment) {
                await workbookService.updatePart(part.id, { status: 'REFINED' });
            }

            await loadParts(activeBatch.id);

        } catch (err) {
            setError(err instanceof Error ? err.message : 'Erro ao gerar designações');
        } finally {
            setLoading(false);
        }
    };

    // ========================================================================
    // Filtros
    // ========================================================================
    const uniqueWeeks = useMemo(() => [...new Set(parts.map(p => p.weekDisplay))].sort(), [parts]);
    const uniqueSections = useMemo(() => [...new Set(parts.map(p => p.section))], [parts]);
    const uniqueTipos = useMemo(() => [...new Set(parts.map(p => p.tipoParte))], [parts]);

    const filteredParts = useMemo(() => {
        return parts.filter(p => {
            if (filterWeek && p.weekDisplay !== filterWeek) return false;
            if (filterSection && p.section !== filterSection) return false;
            if (filterTipo && p.tipoParte !== filterTipo) return false;
            if (filterStatus && p.status !== filterStatus) return false;
            if (filterFuncao && p.funcao !== filterFuncao) return false;
            if (searchText) {
                const search = searchText.toLowerCase();
                const searchable = `${p.tituloParte} ${p.descricaoParte} ${p.rawPublisherName} ${p.resolvedPublisherName || ''}`.toLowerCase();
                if (!searchable.includes(search)) return false;
            }
            return true;
        });
    }, [parts, filterWeek, filterSection, filterTipo, filterStatus, filterFuncao, searchText]);

    // ========================================================================
    // Seleção
    // ========================================================================
    const toggleSelect = (id: string) => {
        setSelectedIds(prev => {
            const next = new Set(prev);
            if (next.has(id)) next.delete(id);
            else next.add(id);
            return next;
        });
    };

    const selectAll = () => {
        if (selectedIds.size === filteredParts.length) {
            setSelectedIds(new Set());
        } else {
            setSelectedIds(new Set(filteredParts.map(p => p.id)));
        }
    };

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

    const statusColors: Record<string, string> = {
        'DRAFT': '#9CA3AF',
        'REFINED': '#3B82F6',
        'PROMOTED': '#10B981',
    };

    // ========================================================================
    // Render
    // ========================================================================
    return (
        <div style={{ padding: '20px', fontFamily: 'system-ui, sans-serif' }}>
            <h2 style={{ marginBottom: '20px' }}>📖 Gerenciador de Apostila</h2>

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

            {/* Upload Options */}
            <div style={{ marginBottom: '20px', display: 'flex', gap: '16px', flexWrap: 'wrap' }}>
                {/* Excel Upload */}
                <div style={{ flex: 1, padding: '20px', border: '2px dashed #CBD5E1', borderRadius: '12px', textAlign: 'center', minWidth: '200px' }}>
                    <input
                        type="file"
                        accept=".xlsx,.xls"
                        onChange={handleFileUpload}
                        style={{ display: 'none' }}
                        id="excel-upload"
                    />
                    <label htmlFor="excel-upload" style={{ cursor: 'pointer', color: '#4F46E5', fontWeight: 'bold' }}>
                        📊 Carregar Planilha Excel
                    </label>
                </div>

                {/* PDF Extraction */}
                <div style={{ flex: 1, padding: '20px', border: '2px dashed #10B981', borderRadius: '12px', textAlign: 'center', minWidth: '200px' }}>
                    <input
                        type="file"
                        accept=".pdf"
                        onChange={handleExtractPDF}
                        style={{ display: 'none' }}
                        id="pdf-extract"
                        disabled={extracting}
                    />
                    <label htmlFor="pdf-extract" style={{ cursor: extracting ? 'wait' : 'pointer', color: '#10B981', fontWeight: 'bold' }}>
                        {extracting ? '⏳ Extraindo...' : '📄 Extrair de PDF Apostila'}
                    </label>
                </div>
            </div>

            {/* PDF Extraction Preview Modal */}
            {showExtractPreview && (
                <div style={{
                    position: 'fixed',
                    top: 0,
                    left: 0,
                    right: 0,
                    bottom: 0,
                    background: 'rgba(0,0,0,0.5)',
                    zIndex: 1000,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                }}>
                    <div style={{
                        background: 'white',
                        borderRadius: '12px',
                        padding: '24px',
                        maxWidth: '90vw',
                        maxHeight: '90vh',
                        overflow: 'auto',
                        boxShadow: '0 25px 50px -12px rgba(0,0,0,0.25)',
                    }}>
                        <h2 style={{ margin: '0 0 16px 0' }}>
                            📄 Preview da Extração
                        </h2>

                        {extractionInfo && (
                            <div style={{ marginBottom: '16px', padding: '12px', background: '#F0FDF4', borderRadius: '8px' }}>
                                <strong>Ano:</strong> {extractionInfo.year} |
                                <strong> Semanas:</strong> {extractionInfo.totalWeeks} |
                                <strong> Total Partes:</strong> {extractedParts.length}
                            </div>
                        )}

                        {/* Preview Table (first 10 rows) */}
                        <div style={{ maxHeight: '400px', overflow: 'auto', marginBottom: '16px' }}>
                            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px' }}>
                                <thead>
                                    <tr style={{ background: '#10B981', color: 'white' }}>
                                        <th style={{ padding: '8px' }}>Ano</th>
                                        <th style={{ padding: '8px' }}>Semana</th>
                                        <th style={{ padding: '8px' }}>Seq</th>
                                        <th style={{ padding: '8px' }}>Seção</th>
                                        <th style={{ padding: '8px' }}>TipoParte</th>
                                        <th style={{ padding: '8px' }}>TituloParte</th>
                                        <th style={{ padding: '8px' }}>Função</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {extractedParts.slice(0, 15).map((part, idx) => (
                                        <tr key={idx} style={{ borderBottom: '1px solid #E5E7EB' }}>
                                            <td style={{ padding: '8px', textAlign: 'center' }}>{part.year}</td>
                                            <td style={{ padding: '8px' }}>{part.weekDisplay}</td>
                                            <td style={{ padding: '8px', textAlign: 'center' }}>{part.seq}</td>
                                            <td style={{ padding: '8px', fontSize: '11px' }}>{part.section}</td>
                                            <td style={{ padding: '8px' }}>{part.tipoParte}</td>
                                            <td style={{ padding: '8px' }}>{part.tituloParte?.substring(0, 40)}...</td>
                                            <td style={{ padding: '8px' }}>{part.funcao}</td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                            {extractedParts.length > 15 && (
                                <div style={{ textAlign: 'center', color: '#6B7280', padding: '8px' }}>
                                    ... e mais {extractedParts.length - 15} registros
                                </div>
                            )}
                        </div>

                        {/* Actions */}
                        <div style={{ display: 'flex', gap: '12px', justifyContent: 'flex-end' }}>
                            <button
                                onClick={() => {
                                    setShowExtractPreview(false);
                                    setExtractedParts([]);
                                    setExtractionInfo(null);
                                }}
                                style={{
                                    padding: '10px 20px',
                                    borderRadius: '8px',
                                    border: '1px solid #E5E7EB',
                                    background: 'white',
                                    cursor: 'pointer',
                                }}
                            >
                                ❌ Cancelar
                            </button>
                            <button
                                onClick={handleDownloadExcel}
                                style={{
                                    padding: '10px 20px',
                                    borderRadius: '8px',
                                    border: '1px solid #3B82F6',
                                    background: 'white',
                                    color: '#3B82F6',
                                    fontWeight: 'bold',
                                    cursor: 'pointer',
                                }}
                            >
                                ⬇️ Baixar Excel
                            </button>
                            <button
                                onClick={handleConfirmExtraction}
                                disabled={loading}
                                style={{
                                    padding: '10px 20px',
                                    borderRadius: '8px',
                                    border: 'none',
                                    background: '#10B981',
                                    color: 'white',
                                    fontWeight: 'bold',
                                    cursor: loading ? 'wait' : 'pointer',
                                }}
                            >
                                {loading ? '⏳ Salvando...' : '✅ Confirmar e Importar'}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Batches */}
            <div style={{ marginBottom: '20px' }}>
                <h3>📦 Batches de Importação</h3>
                <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
                    {batches.map(batch => (
                        <div
                            key={batch.id}
                            onClick={() => setActiveBatch(batch)}
                            style={{
                                padding: '12px',
                                border: activeBatch?.id === batch.id ? '2px solid #4F46E5' : '1px solid #E5E7EB',
                                borderRadius: '8px',
                                cursor: 'pointer',
                                background: activeBatch?.id === batch.id ? '#EEF2FF' : 'white',
                                minWidth: '200px',
                            }}
                        >
                            <div style={{ fontWeight: 'bold' }}>{batch.fileName}</div>
                            <div style={{ fontSize: '12px', color: '#6B7280' }}>{batch.weekRange}</div>
                            <div style={{ fontSize: '12px', marginTop: '4px' }}>
                                <span style={{ color: '#9CA3AF' }}>Draft: {batch.draftCount}</span>
                                {' | '}
                                <span style={{ color: '#3B82F6' }}>Refined: {batch.refinedCount}</span>
                                {' | '}
                                <span style={{ color: '#10B981' }}>Promoted: {batch.promotedCount}</span>
                            </div>
                        </div>
                    ))}
                </div>
            </div>

            {/* Ações e Filtros */}
            {activeBatch && (
                <>
                    <div style={{ marginBottom: '16px', display: 'flex', gap: '8px', flexWrap: 'wrap', alignItems: 'center' }}>
                        <button onClick={handleGenerateDesignations} disabled={loading} style={{ padding: '8px 16px', cursor: 'pointer', background: '#7C3AED', color: 'white', border: 'none', borderRadius: '4px' }}>
                            🎯 Gerar Designações (Motor)
                        </button>
                        <button onClick={handleDeleteSelected} disabled={loading || selectedIds.size === 0} style={{ padding: '8px 16px', cursor: 'pointer', background: '#EF4444', color: 'white', border: 'none', borderRadius: '4px' }}>
                            🗑️ Deletar ({selectedIds.size})
                        </button>
                    </div>

                    {/* Filtros */}
                    <div style={{ marginBottom: '16px', display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                        <input
                            type="text"
                            placeholder="🔍 Buscar..."
                            value={searchText}
                            onChange={e => setSearchText(e.target.value)}
                            style={{ padding: '8px', width: '200px' }}
                        />
                        <select value={filterWeek} onChange={e => setFilterWeek(e.target.value)} style={{ padding: '8px' }}>
                            <option value="">Todas as semanas</option>
                            {uniqueWeeks.map(w => <option key={w} value={w}>{w}</option>)}
                        </select>
                        <select value={filterSection} onChange={e => setFilterSection(e.target.value)} style={{ padding: '8px' }}>
                            <option value="">Todas as seções</option>
                            {uniqueSections.map(s => <option key={s} value={s}>{s}</option>)}
                        </select>
                        <select value={filterTipo} onChange={e => setFilterTipo(e.target.value)} style={{ padding: '8px' }}>
                            <option value="">Todos os tipos</option>
                            {uniqueTipos.map(t => <option key={t} value={t}>{t}</option>)}
                        </select>
                        <select value={filterStatus} onChange={e => setFilterStatus(e.target.value)} style={{ padding: '8px' }}>
                            <option value="">Todos os status</option>
                            <option value="DRAFT">Draft</option>
                            <option value="REFINED">Refined</option>
                            <option value="PROMOTED">Promoted</option>
                        </select>
                        <select value={filterFuncao} onChange={e => setFilterFuncao(e.target.value)} style={{ padding: '8px' }}>
                            <option value="">Todas as funções</option>
                            <option value="Titular">Titular</option>
                            <option value="Ajudante">Ajudante</option>
                        </select>
                    </div>

                    {/* Tabela */}
                    <div style={{ overflowX: 'auto' }}>
                        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
                            <thead>
                                <tr style={{ background: '#4F46E5', color: 'white' }}>
                                    <th style={{ padding: '8px' }}>
                                        <input type="checkbox" checked={selectedIds.size === filteredParts.length && filteredParts.length > 0} onChange={selectAll} />
                                    </th>
                                    <th style={{ padding: '8px' }}>Ano</th>
                                    <th style={{ padding: '8px' }}>Semana</th>
                                    <th style={{ padding: '8px' }}>Seq</th>
                                    <th style={{ padding: '8px' }}>Seção</th>
                                    <th style={{ padding: '8px' }}>TipoParte</th>
                                    <th style={{ padding: '8px' }}>Modalidade</th>
                                    <th style={{ padding: '8px' }}>TituloParte</th>
                                    <th style={{ padding: '8px' }}>DescricaoParte</th>
                                    <th style={{ padding: '8px' }}>DetalhesParte</th>
                                    <th style={{ padding: '8px' }}>Dur</th>
                                    <th style={{ padding: '8px' }}>Ini</th>
                                    <th style={{ padding: '8px' }}>Fim</th>
                                    <th style={{ padding: '8px' }}>Função</th>
                                    <th style={{ padding: '8px' }}>Publicador</th>
                                    <th style={{ padding: '8px' }}>Status</th>
                                </tr>
                            </thead>
                            <tbody>
                                {filteredParts.map(part => (
                                    <tr key={part.id} style={{ background: sectionColors[part.section] || 'white', color: '#1f2937' }}>
                                        <td style={{ padding: '8px', textAlign: 'center' }}>
                                            <input type="checkbox" checked={selectedIds.has(part.id)} onChange={() => toggleSelect(part.id)} />
                                        </td>
                                        <td style={{ padding: '8px', textAlign: 'center' }}>{part.year}</td>
                                        <td style={{ padding: '8px', color: '#1f2937', fontWeight: '500' }}>{part.weekDisplay}</td>
                                        <td style={{ padding: '8px', textAlign: 'center', color: '#1f2937', fontWeight: '500' }}>{part.seq}</td>
                                        <td style={{ padding: '8px', fontSize: '11px', color: '#374151', fontWeight: '500' }}>{part.section}</td>
                                        <td style={{ padding: '8px', color: '#1f2937', fontWeight: '500' }}>{part.tipoParte}</td>
                                        <td style={{ padding: '8px', fontSize: '11px', color: '#6B7280' }}>{part.modalidade}</td>
                                        <td style={{ padding: '8px' }}>
                                            <input
                                                type="text"
                                                value={part.tituloParte}
                                                onChange={e => handleUpdatePart(part.id, 'tituloParte', e.target.value)}
                                                style={{ width: '100%', border: 'none', background: 'transparent', color: '#1f2937' }}
                                            />
                                        </td>
                                        <td style={{ padding: '8px', fontSize: '11px', color: '#6B7280', maxWidth: '150px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={part.descricaoParte}>{part.descricaoParte}</td>
                                        <td style={{ padding: '8px', fontSize: '10px', color: '#9CA3AF', maxWidth: '100px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={part.detalhesParte}>{part.detalhesParte}</td>
                                        <td style={{ padding: '8px', textAlign: 'center', fontSize: '11px', color: '#6B7280' }}>{part.duracao}</td>
                                        <td style={{ padding: '8px', textAlign: 'center', fontSize: '11px', color: '#6B7280' }}>{part.horaInicio}</td>
                                        <td style={{ padding: '8px', textAlign: 'center', fontSize: '11px', color: '#6B7280' }}>{part.horaFim}</td>
                                        <td style={{ padding: '8px', color: '#1f2937', fontWeight: '500' }}>{part.funcao}</td>
                                        <td style={{ padding: '8px' }}>
                                            <input
                                                type="text"
                                                value={part.resolvedPublisherName || part.rawPublisherName}
                                                onChange={e => handleUpdatePart(part.id, 'rawPublisherName', e.target.value)}
                                                style={{ width: '100%', border: 'none', background: 'transparent', color: '#1f2937' }}
                                            />
                                            {part.matchConfidence && (
                                                <span style={{ fontSize: '10px', color: '#6B7280' }}> ({part.matchConfidence}%)</span>
                                            )}
                                        </td>
                                        <td style={{ padding: '8px', textAlign: 'center' }}>
                                            <span style={{
                                                padding: '2px 8px',
                                                borderRadius: '12px',
                                                fontSize: '11px',
                                                background: statusColors[part.status] || '#9CA3AF',
                                                color: 'white',
                                            }}>
                                                {part.status}
                                            </span>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>

                    {filteredParts.length === 0 && (
                        <div style={{ textAlign: 'center', padding: '40px', color: '#6B7280' }}>
                            Nenhuma parte encontrada. {parts.length > 0 ? 'Ajuste os filtros.' : 'Faça upload de um arquivo.'}
                        </div>
                    )}

                    <div style={{ marginTop: '16px', color: '#6B7280', fontSize: '13px' }}>
                        Mostrando {filteredParts.length} de {parts.length} partes
                    </div>
                </>
            )}

            {loading && (
                <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.3)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <div style={{ background: 'white', padding: '24px', borderRadius: '12px' }}>
                        ⏳ Carregando...
                    </div>
                </div>
            )}
        </div>
    );
}

export default WorkbookManager;
