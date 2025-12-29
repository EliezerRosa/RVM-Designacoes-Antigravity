/**
 * WorkbookManager - Gerenciador de Apostila
 * Componente principal para upload, CRUD e promoção de partes
 */

import { useState, useEffect, useMemo } from 'react';
import * as XLSX from 'xlsx';
import type { WorkbookPart, WorkbookBatch, Publisher, HistoryRecord } from '../types';
import { EnumModalidade, EnumFuncao } from '../types';
import { workbookService, type WorkbookExcelRow } from '../services/workbookService';
import { pdfExtractionService } from '../services/pdfExtractionService';
import { checkEligibility } from '../services/eligibilityService';
import { selectBestCandidate } from '../services/cooldownService';
import { loadCompletedParticipations } from '../services/historyAdapter';
import { PublisherSelect } from './PublisherSelect';

interface Props {
    publishers: Publisher[];
}

// Colunas esperadas no Excel da apostila (deve corresponder ao extract_detailed_parts.py)
const EXPECTED_COLUMNS = [
    'id', 'weekId', 'weekDisplay', 'date', 'section', 'tipoParte',
    'modalidade', 'tituloParte', 'descricaoParte', 'detalhesParte',
    'seq', 'funcao', 'duracao', 'horaInicio', 'horaFim', 'rawPublisherName', 'status'
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

    // Filtros - carregar do localStorage para persistência
    const [filterWeek, setFilterWeek] = useState<string>(() => localStorage.getItem('wm_filterWeek') || '');
    const [filterSection, setFilterSection] = useState<string>(() => localStorage.getItem('wm_filterSection') || '');
    const [filterTipo, setFilterTipo] = useState<string>(() => localStorage.getItem('wm_filterTipo') || '');
    const [filterStatus, setFilterStatus] = useState<string>(() => localStorage.getItem('wm_filterStatus') || '');
    const [filterFuncao, setFilterFuncao] = useState<string>(() => localStorage.getItem('wm_filterFuncao') || '');
    const [searchText, setSearchText] = useState<string>(() => localStorage.getItem('wm_searchText') || '');

    // PDF Extraction State
    const [extractedParts, setExtractedParts] = useState<WorkbookExcelRow[]>([]);
    const [showExtractPreview, setShowExtractPreview] = useState(false);
    const [extractionInfo, setExtractionInfo] = useState<{ year: number; totalWeeks: number } | null>(null);
    const [extracting, setExtracting] = useState(false);

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
    }, [filterWeek, filterSection, filterTipo, filterStatus, filterFuncao, searchText]);

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

            // Recarregar batches e partes
            console.log('[WorkbookManager] 🔄 Recarregando batches e partes...');
            await loadBatches();

            // IMPORTANTE: Definir o batch ativo E forçar reload das partes
            setActiveBatch(batch);
            await loadParts(batch.id);

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
                            await workbookService.proposePublisher(part.id, selectedPub.id, selectedPub.name);
                        } catch (e) {
                            // Fallback para update direto se proposePublisher falhar
                            await workbookService.updatePart(part.id, {
                                status: 'PROPOSTA',
                                proposedPublisherId: selectedPub.id,
                                proposedPublisherName: selectedPub.name
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
                    // Se estava PROPOSTA (mas vazia?) deve voltar pra PENDENTE?
                    // Por segurança, se não achamos ninguem, não mexemos.
                }
            }

            await loadParts(activeBatch.id);

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
            if (filterFuncao && p.funcao !== filterFuncao) return false;
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
        'PENDENTE': '#9CA3AF',
        'PROPOSTA': '#F59E0B',
        'APROVADA': '#3B82F6',
        'DESIGNADA': '#10B981',
        'REJEITADA': '#EF4444',
        'CONCLUIDA': '#6B7280',
    };

    // Helper para atualizar publisher do dropdown
    const handlePublisherSelect = async (partId: string, newId: string, newName: string) => {
        try {
            // Tentar pegar a part atual para checar status
            const part = parts.find(p => p.id === partId);
            if (!part) return;

            // Determinar novos valores e se precisa mudar status
            const isDesignada = part.status === 'DESIGNADA' || part.status === 'CONCLUIDA' || part.status === 'APROVADA';
            const shouldChangeStatus = !isDesignada && part.status === 'PENDENTE';

            // Optimistic Update: Atualizar UI imediatamente
            setParts(prev => prev.map(p => {
                if (p.id !== partId) return p;

                const updated = { ...p };
                if (isDesignada) {
                    updated.resolvedPublisherId = newId;
                    updated.resolvedPublisherName = newName;
                } else {
                    updated.proposedPublisherId = newId;
                    updated.proposedPublisherName = newName;
                    if (shouldChangeStatus) {
                        updated.status = 'PROPOSTA';
                    }
                }
                return updated;
            }));

            // Chamada ao Backend
            if (!isDesignada) {
                await workbookService.proposePublisher(partId, newId, newName);
            } else {
                await workbookService.updatePart(partId, {
                    resolvedPublisherId: newId,
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
                        id="workbook-excel-upload"
                    />
                    <label htmlFor="workbook-excel-upload" style={{ cursor: 'pointer', color: '#4F46E5', fontWeight: 'bold' }}>
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
                        id="workbook-pdf-extract"
                        disabled={extracting}
                    />
                    <label htmlFor="workbook-pdf-extract" style={{ cursor: extracting ? 'wait' : 'pointer', color: '#10B981', fontWeight: 'bold' }}>
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
                    {batches.map(batch => {
                        // Extrair ano(s) do weekRange (ex: "8-14 de Janeiro - 26-1 de Fevereiro-Março")
                        // O ano está implícito mas vamos derivar de weekId das partes ou usar o atual
                        const yearMatch = batch.weekRange?.match(/\b(202\d)\b/);
                        const year = yearMatch ? yearMatch[1] : (parts.length > 0 && activeBatch?.id === batch.id
                            ? parts[0]?.weekId?.substring(0, 4)
                            : new Date().getFullYear().toString());

                        return (
                            <div
                                key={batch.id}
                                onClick={() => setActiveBatch(batch)}
                                style={{
                                    padding: '12px',
                                    border: activeBatch?.id === batch.id ? '2px solid #4F46E5' : '1px solid #E5E7EB',
                                    borderRadius: '8px',
                                    cursor: 'pointer',
                                    background: activeBatch?.id === batch.id ? '#EEF2FF' : 'white',
                                    width: '220px',
                                    maxWidth: '220px',
                                    minWidth: '220px',
                                    position: 'relative',
                                    flexShrink: 0,
                                }}
                            >
                                {/* Badge do Ano */}
                                <span style={{
                                    position: 'absolute',
                                    top: '-8px',
                                    right: '8px',
                                    background: '#4F46E5',
                                    color: 'white',
                                    fontSize: '11px',
                                    fontWeight: 'bold',
                                    padding: '2px 8px',
                                    borderRadius: '10px',
                                }}>
                                    {year}
                                </span>
                                <div style={{ fontWeight: 'bold', paddingRight: '40px' }}>{batch.fileName}</div>
                                <div style={{ fontSize: '12px', color: '#6B7280' }}>{batch.weekRange}</div>

                                {/* Lista de semanas (apenas para batch ativo e quando não está carregando) */}
                                {activeBatch?.id === batch.id && !loading && uniqueWeeks.length > 0 && (
                                    <div style={{ fontSize: '11px', color: '#4B5563', marginTop: '6px', maxHeight: '80px', overflowY: 'auto' }}>
                                        <strong>Semanas ({uniqueWeeks.length}):</strong>
                                        <ul style={{ margin: '4px 0', paddingLeft: '16px', listStyle: 'disc' }}>
                                            {uniqueWeeks.slice(0, 8).map(w => (
                                                <li key={w.weekId} style={{ marginBottom: '2px' }}>{w.weekDisplay}</li>
                                            ))}
                                            {uniqueWeeks.length > 8 && <li>... +{uniqueWeeks.length - 8} mais</li>}
                                        </ul>
                                    </div>
                                )}
                                {activeBatch?.id === batch.id && loading && (
                                    <div style={{ fontSize: '11px', color: '#9CA3AF', marginTop: '6px' }}>⏳ Carregando...</div>
                                )}

                                <div style={{ fontSize: '12px', marginTop: '4px' }}>
                                    <span style={{ color: '#9CA3AF' }}>Pendente: {batch.draftCount}</span>
                                    {' | '}
                                    <span style={{ color: '#F59E0B' }}>Proposta: {batch.refinedCount}</span>
                                    {' | '}
                                    <span style={{ color: '#10B981' }}>Designada: {batch.promotedCount}</span>
                                </div>
                            </div>
                        );
                    })}
                </div>
            </div>

            {/* Ações e Filtros */}
            {activeBatch && (
                <>
                    <div style={{ marginBottom: '16px', display: 'flex', gap: '8px', flexWrap: 'wrap', alignItems: 'center' }}>
                        <button onClick={() => activeBatch && loadParts(activeBatch.id)} disabled={loading} style={{ padding: '8px 16px', cursor: 'pointer', background: '#3B82F6', color: 'white', border: 'none', borderRadius: '4px' }}>
                            🔄 Atualizar Dados
                        </button>
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
                        <select value={filterWeek} onChange={e => setFilterWeek(e.target.value)} style={{ padding: '8px', minWidth: '280px' }}>
                            <option value="">Todas as semanas</option>
                            {uniqueWeeks.map(w => (
                                <option key={w.weekId} value={w.weekId}>
                                    {w.year} | {w.weekId} | {w.weekDisplay}
                                </option>
                            ))}
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
                            <option value="PENDENTE">Pendente</option>
                            <option value="PROPOSTA">Proposta</option>
                            <option value="APROVADA">Aprovada</option>
                            <option value="DESIGNADA">Designada</option>
                            <option value="REJEITADA">Rejeitada</option>
                            <option value="CONCLUIDA">Concluída</option>
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
                                {filteredParts.map(part => {
                                    // SIMPLIFICADO: Usar apenas resolved_publisher_name
                                    const displayRaw = part.resolvedPublisherName || part.rawPublisherName || '';

                                    // Tentar encontrar ID pelo nome
                                    let currentPubId = '';
                                    if (displayRaw) {
                                        const found = publishers.find(p => p.name === displayRaw);
                                        if (found) currentPubId = found.id;
                                    }

                                    return (
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
                                                {/* Dropdown Inteligente */}
                                                <PublisherSelect
                                                    part={part}
                                                    publishers={publishers}
                                                    value={currentPubId}
                                                    displayName={displayRaw}
                                                    onChange={(newId, newName) => handlePublisherSelect(part.id, newId, newName)}
                                                    style={{ width: '100%', border: '1px solid #E5E7EB', borderRadius: '4px', padding: '4px', fontSize: '13px' }}
                                                />
                                                {/* Se não tiver ID correspondente, mostrar o nome raw como fallback visual ou alerta? 
                                                    O PublisherSelect mostra "Selecione..." se vazio. 
                                                    Se temos um rawName que não match com ID, ele vai ficar vazio.
                                                    Podemos colocar um input fallback?
                                                */}
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
                                    );
                                })}
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
