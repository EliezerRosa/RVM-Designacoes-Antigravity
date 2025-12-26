import { useState, useMemo, useCallback, useEffect } from 'react';
import type { Publisher, Participation, HistoryRecord } from '../types';
import { HistoryStatus, ParticipationType, PartModality, MeetingSection } from '../types';
import { parsePdfFile } from '../services/pdfParser';
import { parseExcelFile } from '../services/excelParser';
import { loadHistoryRecords, saveHistoryRecords, subscribeToHistoryChanges, validatePublishersInRecords } from '../services/historyService';
import { injectMandatoryParts } from '../services/injectionService';
import type { OcrProgressCallback } from '../services/pdfParser';

interface Props {
    publishers: Publisher[];
    participations: Participation[];
    onImport: (newParticipations: Participation[]) => void;
}

// Matching de nomes com fuzzy search
function findBestMatch(rawName: string, publishers: Publisher[]): { publisher: Publisher | null; confidence: number } {
    const normalized = rawName.toLowerCase().trim();

    for (const pub of publishers) {
        if (pub.name.toLowerCase() === normalized) {
            return { publisher: pub, confidence: 100 };
        }
        for (const alias of pub.aliases || []) {
            if (alias.toLowerCase() === normalized) {
                return { publisher: pub, confidence: 95 };
            }
        }
    }

    const parts = normalized.split(' ');
    if (parts.length >= 2) {
        const firstLast = `${parts[0]} ${parts[parts.length - 1]}`;
        for (const pub of publishers) {
            const pubParts = pub.name.toLowerCase().split(' ');
            const pubFirstLast = `${pubParts[0]} ${pubParts[pubParts.length - 1]}`;
            if (pubFirstLast === firstLast) {
                return { publisher: pub, confidence: 80 };
            }
        }
    }

    for (const pub of publishers) {
        if (pub.name.toLowerCase().startsWith(parts[0] + ' ')) {
            return { publisher: pub, confidence: 60 };
        }
    }

    return { publisher: null, confidence: 0 };
}

// Aplicar matching de nomes aos registros parseados
function applyNameMatching(records: HistoryRecord[], publishers: Publisher[]): HistoryRecord[] {
    return records.map(r => {
        const match = findBestMatch(r.rawPublisherName, publishers);

        return {
            ...r,
            resolvedPublisherId: match.publisher?.id,
            resolvedPublisherName: match.publisher?.name,
            matchConfidence: match.confidence,
            status: match.confidence >= 80 ? HistoryStatus.VALIDATED : HistoryStatus.PENDING,
        };
    });
}

export default function HistoryImporter({ publishers, onImport }: Props) {
    const [records, setRecords] = useState<HistoryRecord[]>([]);
    const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
    const [filterStatus, setFilterStatus] = useState<HistoryStatus | 'all'>('all');
    const [filterWeek, setFilterWeek] = useState<string>('');
    const [searchTerm, setSearchTerm] = useState('');
    const [editingCell, setEditingCell] = useState<{ id: string; field: string } | null>(null);
    const [isUploading, setIsUploading] = useState(false);
    const [uploadError, setUploadError] = useState<string | null>(null);
    const [ocrProgress, setOcrProgress] = useState<{ status: string; progress: number } | null>(null);

    // Estado para modal "Nova Parte"
    const [showAddPartModal, setShowAddPartModal] = useState(false);
    const [newPartData, setNewPartData] = useState({
        weekDisplay: '',
        section: 'Tesouros da Palavra de Deus',
        tipoParte: '',
        tituloParte: '',
        modalidade: 'Demonstração',
        rawPublisherName: '',
        funcao: 'Titular' as 'Titular' | 'Ajudante'
    });

    // Estado para feedback de save
    const [saveMessage, setSaveMessage] = useState<string | null>(null);

    // Carregar dados do Supabase ao montar componente e validar publicadores
    useEffect(() => {
        const loadData = async () => {
            try {
                const savedRecords = await loadHistoryRecords();
                if (savedRecords.length > 0) {
                    // Validar publicadores cruzando com tabela Supabase
                    const validatedRecords = await validatePublishersInRecords(savedRecords);
                    setRecords(validatedRecords);
                    console.log(`[HistoryImporter] ${validatedRecords.length} registros carregados e validados`);
                }
            } catch (error) {
                console.error('[HistoryImporter] Erro ao carregar dados:', error);
            }
        };
        loadData();
    }, []);

    // Subscription para atualizações em tempo real
    useEffect(() => {
        const unsubscribe = subscribeToHistoryChanges(
            // onInsert
            (newRecord) => {
                setRecords(prev => {
                    // Evitar duplicatas
                    if (prev.some(r => r.id === newRecord.id)) return prev;
                    return [...prev, newRecord];
                });
                setSaveMessage('🔄 Novo registro recebido em tempo real');
                setTimeout(() => setSaveMessage(null), 2000);
            },
            // onUpdate
            (updatedRecord) => {
                setRecords(prev => prev.map(r =>
                    r.id === updatedRecord.id ? updatedRecord : r
                ));
            },
            // onDelete
            (deletedId) => {
                setRecords(prev => prev.filter(r => r.id !== deletedId));
            }
        );

        // Cleanup ao desmontar
        return () => unsubscribe();
    }, []);

    // Estatísticas
    const stats = useMemo(() => {
        const pending = records.filter(r => r.status === HistoryStatus.PENDING).length;
        const validated = records.filter(r => r.status === HistoryStatus.VALIDATED).length;
        const approved = records.filter(r => r.status === HistoryStatus.APPROVED).length;
        const rejected = records.filter(r => r.status === HistoryStatus.REJECTED).length;
        return { total: records.length, pending, validated, approved, rejected };
    }, [records]);

    // Filtrar registros
    const filteredRecords = useMemo(() => {
        return records.filter(r => {
            if (filterStatus !== 'all' && r.status !== filterStatus) return false;
            if (filterWeek && !r.weekDisplay.toLowerCase().includes(filterWeek.toLowerCase())) return false;
            if (searchTerm) {
                const term = searchTerm.toLowerCase();
                return (
                    r.rawPublisherName.toLowerCase().includes(term) ||
                    r.tituloParte.toLowerCase().includes(term) ||
                    r.resolvedPublisherName?.toLowerCase().includes(term)
                );
            }
            return true;
        });
    }, [records, filterStatus, filterWeek, searchTerm]);

    // Semanas únicas para filtro
    const uniqueWeeks = useMemo(() => {
        const weeks = new Set(records.map(r => r.weekDisplay));
        return Array.from(weeks).sort();
    }, [records]);

    // Upload de arquivo PDF ou Excel (parser local, sem backend)
    const handleFileUpload = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;

        const fileName = file.name.toLowerCase();
        const isPdf = fileName.endsWith('.pdf');
        const isExcel = fileName.endsWith('.xlsx') || fileName.endsWith('.xls');

        if (!isPdf && !isExcel) {
            setUploadError('Apenas arquivos PDF (.pdf) ou Excel (.xlsx) são suportados.');
            e.target.value = '';
            return;
        }

        setIsUploading(true);
        setUploadError(null);

        try {
            let matchedRecords: HistoryRecord[] = [];

            if (isPdf) {
                // Callback para progresso do OCR
                const onOcrProgress: OcrProgressCallback = (progress) => {
                    setOcrProgress(progress);
                };

                // Parser local usando PDF.js (funciona no navegador)
                const result = await parsePdfFile(file, onOcrProgress);

                if (!result.success) {
                    throw new Error(result.error || 'Erro ao processar PDF');
                }

                // Aplicar matching de nomes
                matchedRecords = applyNameMatching(result.records, publishers);
            } else {
                // Parser Excel
                const result = await parseExcelFile(file);

                if (!result.success) {
                    throw new Error(result.error || 'Erro ao processar Excel');
                }

                console.log(`[Excel Import] ${result.importedRows}/${result.totalRows} registros importados`);

                // Aplicar matching de nomes onde ainda não tem publicador
                matchedRecords = result.records.map(r => {
                    if (!r.resolvedPublisherName && r.rawPublisherName) {
                        const match = findBestMatch(r.rawPublisherName, publishers);
                        return {
                            ...r,
                            resolvedPublisherId: match.publisher?.id,
                            resolvedPublisherName: match.publisher?.name,
                            matchConfidence: match.confidence
                        };
                    }
                    return r;
                });
            }

            // INJEÇÃO AUTOMÁTICA: Adicionar partes obrigatórias (Cânticos, Elogios)
            const batchId = matchedRecords[0]?.importBatchId || `batch-${Date.now()}`;
            const injectedRecords = injectMandatoryParts(matchedRecords, batchId);

            const injectedCount = injectedRecords.length - matchedRecords.length;
            if (injectedCount > 0) {
                console.log(`[Upload] ${injectedCount} partes injetadas automaticamente`);
            }

            // Atualizar state e salvar no Supabase
            setRecords(prev => {
                // Criar chave única para detecção de duplicatas
                // Usar campos que NÃO mudam após injeção (não usar seq!)
                const buildKey = (r: HistoryRecord) =>
                    `${r.date || r.date}_${r.section || r.section}_${r.tipoParte || r.tituloParte}_${(r.rawPublisherName || r.rawPublisherName || '').toLowerCase()}_${r.modalidade || r.modalidade}_${r.funcao || r.funcao}`;

                const existingKeys = new Set(prev.map(buildKey));

                // Filtrar registros que já existem
                const newUniqueRecords = injectedRecords.filter(r => !existingKeys.has(buildKey(r)));

                const duplicateCount = injectedRecords.length - newUniqueRecords.length;
                if (duplicateCount > 0) {
                    console.log(`[Upload] ${duplicateCount} registros duplicados ignorados`);
                }

                // Só salvar se houver registros novos
                if (newUniqueRecords.length > 0) {
                    saveHistoryRecords(newUniqueRecords).then(result => {
                        if (result.success) {
                            let msg = `✅ ${result.count} registros salvos`;
                            if (injectedCount > 0) msg += ` (${injectedCount} injetados)`;
                            if (duplicateCount > 0) msg += ` | ${duplicateCount} duplicados ignorados`;
                            setSaveMessage(msg);
                            setTimeout(() => setSaveMessage(null), 4000);
                        } else {
                            setSaveMessage(`⚠️ Erro ao salvar: ${result.error}`);
                        }
                    });
                    return [...prev, ...newUniqueRecords];
                } else {
                    setSaveMessage(`⚠️ Todos os ${duplicateCount} registros já existem`);
                    setTimeout(() => setSaveMessage(null), 3000);
                    return prev;
                }
            });
            setUploadError(null);
        } catch (error) {
            console.error('Erro ao fazer upload:', error);
            setUploadError(error instanceof Error ? error.message : 'Erro desconhecido');
        } finally {
            setIsUploading(false);
            setOcrProgress(null);
            e.target.value = '';
        }
    }, [publishers]);

    // Seleção
    const toggleSelect = (id: string) => {
        setSelectedIds(prev => {
            const newSet = new Set(prev);
            if (newSet.has(id)) {
                newSet.delete(id);
            } else {
                newSet.add(id);
            }
            return newSet;
        });
    };

    const selectAll = () => {
        if (selectedIds.size === filteredRecords.length) {
            setSelectedIds(new Set());
        } else {
            setSelectedIds(new Set(filteredRecords.map(r => r.id)));
        }
    };

    // Ações em lote
    const approveSelected = () => {
        const approved: Participation[] = [];

        setRecords(prev => prev.map(r => {
            if (!selectedIds.has(r.id)) return r;
            if (r.status === HistoryStatus.APPROVED) return r;
            if (!r.resolvedPublisherId) return r;

            approved.push({
                id: `part-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
                publisherName: r.resolvedPublisherName || r.rawPublisherName,
                week: r.weekId,
                date: r.date,
                partTitle: r.tituloParte,
                type: r.tituloParte as ParticipationType,
                source: 'import',
                createdAt: new Date().toISOString(),
            });

            return {
                ...r,
                status: HistoryStatus.APPROVED,
                approvedAt: new Date().toISOString(),
            };
        }));

        if (approved.length > 0) {
            onImport(approved);
        }
        setSelectedIds(new Set());
    };

    const rejectSelected = () => {
        setRecords(prev => prev.map(r =>
            selectedIds.has(r.id) ? { ...r, status: HistoryStatus.REJECTED } : r
        ));
        setSelectedIds(new Set());
    };

    const deleteSelected = () => {
        if (!confirm(`Remover ${selectedIds.size} registros?`)) return;
        setRecords(prev => prev.filter(r => !selectedIds.has(r.id)));
        setSelectedIds(new Set());
    };

    // Resolver publicador manualmente
    const resolvePublisher = (recordId: string, publisherId: string) => {
        const publisher = publishers.find(p => p.id === publisherId);
        if (!publisher) return;

        setRecords(prev => prev.map(r =>
            r.id === recordId ? {
                ...r,
                resolvedPublisherId: publisher.id,
                resolvedPublisherName: publisher.name,
                matchConfidence: 100,
                status: HistoryStatus.VALIDATED,
                updatedAt: new Date().toISOString(),
            } : r
        ));
        setEditingCell(null);
    };

    // Atualizar campo genérico de um registro
    const updateField = (recordId: string, field: keyof HistoryRecord, value: string) => {
        setRecords(prev => prev.map(r =>
            r.id === recordId ? { ...r, [field]: value, updatedAt: new Date().toISOString() } : r
        ));
        setEditingCell(null);
    };

    // Adicionar nova parte manualmente
    const handleAddNewPart = () => {
        if (!newPartData.weekDisplay || !newPartData.tituloParte) {
            return; // Validação básica
        }

        // Encontrar próximo sequence baseado na semana
        const existingSeqs = records
            .filter(r => r.weekDisplay === newPartData.weekDisplay)
            .map(r => r.seq);
        const nextSeq = existingSeqs.length > 0 ? Math.max(...existingSeqs) + 1 : 1;

        // Fazer matching do nome
        const match = findBestMatch(newPartData.rawPublisherName, publishers);

        const newRecord: HistoryRecord = {
            id: `manual-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
            weekId: newPartData.weekDisplay.substring(0, 7) || 'manual',
            weekDisplay: newPartData.weekDisplay,
            date: new Date().toISOString().split('T')[0],
            // 5 CAMPOS CANÔNICOS
            section: newPartData.section,
            tipoParte: newPartData.tipoParte || newPartData.tituloParte,
            modalidade: newPartData.modalidade,
            tituloParte: newPartData.tituloParte,
            descricaoParte: '',
            detalhesParte: '',
            // Sequência e função
            seq: nextSeq,
            funcao: newPartData.funcao,
            duracao: 0,
            horaInicio: '',
            horaFim: '',
            rawPublisherName: newPartData.rawPublisherName,
            status: HistoryStatus.PENDING,
            resolvedPublisherId: match.publisher?.id || undefined,
            resolvedPublisherName: match.publisher?.name || undefined,
            matchConfidence: match.confidence,
            importSource: 'Manual',
            importBatchId: `manual-${Date.now()}`,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString()
        };

        setRecords(prev => [...prev, newRecord]);
        setShowAddPartModal(false);
        // Reset form
        setNewPartData({
            weekDisplay: uniqueWeeks[0] || '',
            section: 'Tesouros da Palavra de Deus',
            tipoParte: '',
            tituloParte: '',
            modalidade: 'Demonstração',
            rawPublisherName: '',
            funcao: 'Titular'
        });
    };

    // Estilo comum para células editáveis
    const editableCellStyle = {
        cursor: 'pointer',
        padding: '2px 4px',
        borderRadius: '4px',
        transition: 'background 0.15s',
    };

    // Estilo para inputs/selects em modo edição
    const editInputStyle = {
        padding: '6px',
        borderRadius: '4px',
        border: '1px solid var(--primary-500)',
        background: 'var(--bg-secondary)',
        color: 'var(--text-primary)',
        width: '100%',
        fontSize: '0.9em',
    };

    // Célula editável de texto
    const EditableTextCell = ({ record, field, value }: { record: HistoryRecord; field: keyof HistoryRecord; value: string }) => {
        const isEditing = editingCell?.id === record.id && editingCell?.field === field;

        if (isEditing) {
            return (
                <input
                    type="text"
                    autoFocus
                    defaultValue={value}
                    onBlur={(e) => updateField(record.id, field, e.target.value)}
                    onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                            updateField(record.id, field, (e.target as HTMLInputElement).value);
                        } else if (e.key === 'Escape') {
                            setEditingCell(null);
                        }
                    }}
                    style={editInputStyle}
                />
            );
        }

        return (
            <div
                onClick={() => record.status !== HistoryStatus.APPROVED && setEditingCell({ id: record.id, field })}
                style={{ ...editableCellStyle }}
                title="Clique para editar"
            >
                {value || <span style={{ color: 'var(--text-muted)' }}>-</span>}
            </div>
        );
    };

    // Célula editável de seleção (dropdown)
    const EditableSelectCell = ({ record, field, value, options }: { record: HistoryRecord; field: keyof HistoryRecord; value: string; options: string[] }) => {
        const isEditing = editingCell?.id === record.id && editingCell?.field === field;

        // Ordenar opções alfabeticamente e garantir que valor atual esteja na lista
        const sortedOptions = [...options].sort((a, b) => a.localeCompare(b, 'pt-BR'));
        const finalOptions = value && !sortedOptions.includes(value)
            ? [value, ...sortedOptions]
            : sortedOptions;

        if (isEditing) {
            return (
                <select
                    autoFocus
                    defaultValue={value}
                    onChange={(e) => updateField(record.id, field, e.target.value)}
                    onBlur={() => setEditingCell(null)}
                    onKeyDown={(e) => e.key === 'Escape' && setEditingCell(null)}
                    style={editInputStyle}
                >
                    {finalOptions.map(opt => (
                        <option key={opt} value={opt}>{opt}</option>
                    ))}
                </select>
            );
        }

        return (
            <div
                onClick={() => record.status !== HistoryStatus.APPROVED && setEditingCell({ id: record.id, field })}
                style={{ ...editableCellStyle }}
                title="Clique para editar"
            >
                {value}
            </div>
        );
    };

    // Célula editável de semana (combobox com semanas existentes, ordenadas)
    const EditableWeekCell = ({ record }: { record: HistoryRecord }) => {
        const isEditing = editingCell?.id === record.id && editingCell?.field === 'weekDisplay';
        const listId = `weeks-${record.id}`;

        // Ordenar semanas cronologicamente (por data)
        const sortedWeeks = [...uniqueWeeks].sort();
        // Garantir que semana atual esteja na lista
        const finalWeeks = record.weekDisplay && !sortedWeeks.includes(record.weekDisplay)
            ? [record.weekDisplay, ...sortedWeeks]
            : sortedWeeks;

        if (isEditing) {
            return (
                <>
                    <input
                        type="text"
                        autoFocus
                        list={listId}
                        defaultValue={record.weekDisplay}
                        onBlur={(e) => updateField(record.id, 'weekDisplay', e.target.value)}
                        onKeyDown={(e) => {
                            if (e.key === 'Enter') {
                                updateField(record.id, 'weekDisplay', (e.target as HTMLInputElement).value);
                            } else if (e.key === 'Escape') {
                                setEditingCell(null);
                            }
                        }}
                        style={editInputStyle}
                        placeholder="Digite ou selecione..."
                    />
                    <datalist id={listId}>
                        {finalWeeks.map(w => (
                            <option key={w} value={w} />
                        ))}
                    </datalist>
                </>
            );
        }

        return (
            <div
                onClick={() => record.status !== HistoryStatus.APPROVED && setEditingCell({ id: record.id, field: 'weekDisplay' })}
                style={{ ...editableCellStyle }}
                title="Clique para editar"
            >
                <div>{record.weekDisplay}</div>
                <div style={{ fontSize: '0.8em', color: 'var(--text-muted)' }}>{record.date}</div>
            </div>
        );
    };

    // Lista de partes padrão do S-140
    const STANDARD_PARTS = [
        'Presidente',
        'Discurso 1 - Tesouros',
        'Joias Espirituais',
        'Leitura da Bíblia',
        'Iniciando Conversas',
        'Cultivando o Interesse',
        'Fazendo Discípulos',
        'Explicando Suas Crenças',
        'Discurso de Estudante',
        'Necessidades Locais',
        'Estudo Bíblico de Congregação',
        'Leitura no EBC',
        'Oração Final',
    ];

    // Célula editável com combobox (texto + sugestões)
    const EditableComboCell = ({ record, field, value, suggestions }: { record: HistoryRecord; field: keyof HistoryRecord; value: string; suggestions: string[] }) => {
        const isEditing = editingCell?.id === record.id && editingCell?.field === field;
        const listId = `suggestions-${record.id}-${field}`;

        if (isEditing) {
            return (
                <>
                    <input
                        type="text"
                        autoFocus
                        list={listId}
                        defaultValue={value}
                        onBlur={(e) => updateField(record.id, field, e.target.value)}
                        onKeyDown={(e) => {
                            if (e.key === 'Enter') {
                                updateField(record.id, field, (e.target as HTMLInputElement).value);
                            } else if (e.key === 'Escape') {
                                setEditingCell(null);
                            }
                        }}
                        style={editInputStyle}
                        placeholder="Digite ou selecione..."
                    />
                    <datalist id={listId}>
                        {suggestions.map(s => (
                            <option key={s} value={s} />
                        ))}
                    </datalist>
                </>
            );
        }

        return (
            <div
                onClick={() => record.status !== HistoryStatus.APPROVED && setEditingCell({ id: record.id, field })}
                style={{ ...editableCellStyle }}
                title="Clique para editar (texto livre ou seleção)"
            >
                {value || <span style={{ color: 'var(--text-muted)' }}>-</span>}
            </div>
        );
    };

    // Options para os dropdowns
    const sectionOptions = Object.values(MeetingSection);
    const modalityOptions = Object.values(PartModality);
    const roleOptions = ['Titular', 'Ajudante'];

    // Badge de status
    const StatusBadge = ({ status }: { status: HistoryStatus }) => {
        const config = {
            [HistoryStatus.PENDING]: { bg: 'rgba(245,158,11,0.2)', color: '#f59e0b', label: '⏳ Pendente' },
            [HistoryStatus.VALIDATED]: { bg: 'rgba(59,130,246,0.2)', color: '#3b82f6', label: '✓ Validado' },
            [HistoryStatus.APPROVED]: { bg: 'rgba(34,197,94,0.2)', color: '#22c55e', label: '✅ Aprovado' },
            [HistoryStatus.REJECTED]: { bg: 'rgba(239,68,68,0.2)', color: '#ef4444', label: '❌ Rejeitado' },
        };
        const { bg, color, label } = config[status];
        return (
            <span style={{ padding: '4px 10px', borderRadius: '12px', background: bg, color, fontSize: '0.8em' }}>
                {label}
            </span>
        );
    };

    return (
        <div style={{ padding: 'var(--spacing-lg)' }}>
            <h2 style={{ marginBottom: 'var(--spacing-xl)' }}>📜 Importação de Histórico</h2>

            {/* Upload PDF ou Excel */}
            <div className="card" style={{ padding: 'var(--spacing-lg)', marginBottom: 'var(--spacing-xl)' }}>
                <h3 style={{ marginBottom: 'var(--spacing-md)' }}>📥 Importar Arquivo</h3>
                <div style={{ display: 'flex', gap: 'var(--spacing-md)', alignItems: 'center' }}>
                    <input
                        type="file"
                        accept=".pdf,.xlsx,.xls"
                        onChange={handleFileUpload}
                        disabled={isUploading}
                        style={{ flex: 1 }}
                    />
                    <span style={{ color: 'var(--text-muted)', fontSize: '0.85em' }}>
                        Formatos: PDF (S-140), Excel (Consolidado RVM)
                    </span>
                    {isUploading && (
                        <div style={{
                            display: 'flex',
                            flexDirection: 'column',
                            gap: '4px',
                            color: 'var(--primary-400)'
                        }}>
                            <span>
                                ⏳ {ocrProgress ? ocrProgress.status : 'Processando PDF...'}
                            </span>
                            {ocrProgress && (
                                <div style={{
                                    width: '200px',
                                    height: '6px',
                                    background: 'rgba(255,255,255,0.1)',
                                    borderRadius: '3px',
                                    overflow: 'hidden'
                                }}>
                                    <div style={{
                                        height: '100%',
                                        width: `${Math.round(ocrProgress.progress * 100)}%`,
                                        background: 'var(--primary-500)',
                                        transition: 'width 0.3s ease'
                                    }} />
                                </div>
                            )}
                        </div>
                    )}
                    <span style={{ color: 'var(--text-muted)', fontSize: '0.85em' }}>
                        Formatos: Pauta S-140, Apostila RVM
                    </span>
                </div>
                {uploadError && (
                    <div style={{
                        marginTop: 'var(--spacing-md)',
                        padding: 'var(--spacing-sm) var(--spacing-md)',
                        background: 'rgba(239,68,68,0.1)',
                        border: '1px solid rgba(239,68,68,0.3)',
                        borderRadius: '6px',
                        color: '#ef4444'
                    }}>
                        ❌ {uploadError}
                    </div>
                )}
                {saveMessage && (
                    <div style={{
                        marginTop: 'var(--spacing-md)',
                        padding: 'var(--spacing-sm) var(--spacing-md)',
                        background: saveMessage.startsWith('✅')
                            ? 'rgba(34,197,94,0.1)'
                            : 'rgba(234,179,8,0.1)',
                        border: `1px solid ${saveMessage.startsWith('✅')
                            ? 'rgba(34,197,94,0.3)'
                            : 'rgba(234,179,8,0.3)'}`,
                        borderRadius: '6px',
                        color: saveMessage.startsWith('✅') ? '#22c55e' : '#eab308'
                    }}>
                        {saveMessage}
                    </div>
                )}
            </div>

            {/* Estatísticas */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 'var(--spacing-md)', marginBottom: 'var(--spacing-xl)' }}>
                <div className="card" style={{ padding: 'var(--spacing-md)', textAlign: 'center' }}>
                    <div style={{ fontSize: '1.5rem', fontWeight: 'bold' }}>{stats.total}</div>
                    <div style={{ fontSize: '0.85em', color: 'var(--text-muted)' }}>Total</div>
                </div>
                <div className="card" style={{ padding: 'var(--spacing-md)', textAlign: 'center', borderLeft: '3px solid #f59e0b' }}>
                    <div style={{ fontSize: '1.5rem', fontWeight: 'bold', color: '#f59e0b' }}>{stats.pending}</div>
                    <div style={{ fontSize: '0.85em', color: 'var(--text-muted)' }}>Pendentes</div>
                </div>
                <div className="card" style={{ padding: 'var(--spacing-md)', textAlign: 'center', borderLeft: '3px solid #3b82f6' }}>
                    <div style={{ fontSize: '1.5rem', fontWeight: 'bold', color: '#3b82f6' }}>{stats.validated}</div>
                    <div style={{ fontSize: '0.85em', color: 'var(--text-muted)' }}>Validados</div>
                </div>
                <div className="card" style={{ padding: 'var(--spacing-md)', textAlign: 'center', borderLeft: '3px solid #22c55e' }}>
                    <div style={{ fontSize: '1.5rem', fontWeight: 'bold', color: '#22c55e' }}>{stats.approved}</div>
                    <div style={{ fontSize: '0.85em', color: 'var(--text-muted)' }}>Aprovados</div>
                </div>
                <div className="card" style={{ padding: 'var(--spacing-md)', textAlign: 'center', borderLeft: '3px solid #ef4444' }}>
                    <div style={{ fontSize: '1.5rem', fontWeight: 'bold', color: '#ef4444' }}>{stats.rejected}</div>
                    <div style={{ fontSize: '0.85em', color: 'var(--text-muted)' }}>Rejeitados</div>
                </div>
            </div>

            {/* Filtros e Ações */}
            <div className="card" style={{ padding: 'var(--spacing-lg)', marginBottom: 'var(--spacing-md)' }}>
                <div style={{ display: 'flex', gap: 'var(--spacing-md)', flexWrap: 'wrap', alignItems: 'center' }}>
                    {/* Pesquisa */}
                    <input
                        type="text"
                        placeholder="🔍 Pesquisar nome ou parte..."
                        value={searchTerm}
                        onChange={e => setSearchTerm(e.target.value)}
                        style={{
                            padding: '8px 12px',
                            borderRadius: '6px',
                            border: '1px solid var(--border-color)',
                            background: 'var(--bg-secondary)',
                            color: 'var(--text-primary)',
                            minWidth: '200px'
                        }}
                    />

                    {/* Filtro Status */}
                    <select
                        value={filterStatus}
                        onChange={e => setFilterStatus(e.target.value as HistoryStatus | 'all')}
                        style={{
                            padding: '8px 12px',
                            borderRadius: '6px',
                            border: '1px solid var(--border-color)',
                            background: 'var(--bg-secondary)',
                            color: 'var(--text-primary)'
                        }}
                    >
                        <option value="all">Todos os status</option>
                        <option value={HistoryStatus.PENDING}>⏳ Pendentes</option>
                        <option value={HistoryStatus.VALIDATED}>✓ Validados</option>
                        <option value={HistoryStatus.APPROVED}>✅ Aprovados</option>
                        <option value={HistoryStatus.REJECTED}>❌ Rejeitados</option>
                    </select>

                    {/* Filtro Semana */}
                    <select
                        value={filterWeek}
                        onChange={e => setFilterWeek(e.target.value)}
                        style={{
                            padding: '8px 12px',
                            borderRadius: '6px',
                            border: '1px solid var(--border-color)',
                            background: 'var(--bg-secondary)',
                            color: 'var(--text-primary)'
                        }}
                    >
                        <option value="">Todas as semanas</option>
                        {uniqueWeeks.map(w => (
                            <option key={w} value={w}>{w}</option>
                        ))}
                    </select>

                    {/* Botão Nova Parte */}
                    <button
                        onClick={() => setShowAddPartModal(true)}
                        style={{
                            padding: '8px 16px',
                            borderRadius: '6px',
                            border: 'none',
                            background: 'var(--primary-500)',
                            color: 'white',
                            cursor: 'pointer',
                            fontWeight: '500',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '6px'
                        }}
                    >
                        ➕ Nova Parte
                    </button>

                    <div style={{ flex: 1 }} />

                    {/* Ações em lote */}
                    {selectedIds.size > 0 && (
                        <>
                            <span style={{ color: 'var(--text-muted)' }}>
                                {selectedIds.size} selecionados
                            </span>
                            <button
                                onClick={approveSelected}
                                style={{
                                    padding: '8px 16px',
                                    borderRadius: '6px',
                                    border: 'none',
                                    background: '#22c55e',
                                    color: '#fff',
                                    cursor: 'pointer'
                                }}
                            >
                                ✅ Aprovar
                            </button>
                            <button
                                onClick={rejectSelected}
                                style={{
                                    padding: '8px 16px',
                                    borderRadius: '6px',
                                    border: 'none',
                                    background: '#ef4444',
                                    color: '#fff',
                                    cursor: 'pointer'
                                }}
                            >
                                ❌ Rejeitar
                            </button>
                            <button
                                onClick={deleteSelected}
                                style={{
                                    padding: '8px 16px',
                                    borderRadius: '6px',
                                    border: '1px solid var(--border-color)',
                                    background: 'transparent',
                                    color: 'var(--text-primary)',
                                    cursor: 'pointer'
                                }}
                            >
                                🗑️ Remover
                            </button>
                        </>
                    )}
                </div>
            </div>

            {/* Tabela */}
            <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                    <thead>
                        <tr style={{ background: 'var(--bg-tertiary)', borderBottom: '2px solid var(--border-color)' }}>
                            <th style={{ padding: '12px 8px', textAlign: 'center', width: '40px' }}>
                                <input
                                    type="checkbox"
                                    checked={selectedIds.size === filteredRecords.length && filteredRecords.length > 0}
                                    onChange={selectAll}
                                />
                            </th>
                            <th style={{ padding: '12px 8px', textAlign: 'left' }}>Semana</th>
                            <th style={{ padding: '12px 8px', textAlign: 'center', width: '50px' }}>Seq</th>
                            <th style={{ padding: '12px 8px', textAlign: 'left' }}>Seção</th>
                            <th style={{ padding: '12px 8px', textAlign: 'left' }}>TituloParte</th>
                            <th style={{ padding: '12px 8px', textAlign: 'left', minWidth: '150px' }}>DescricaoParte</th>
                            <th style={{ padding: '12px 8px', textAlign: 'center' }}>Modalidade</th>
                            <th style={{ padding: '12px 8px', textAlign: 'center', width: '60px' }}>Ini</th>
                            <th style={{ padding: '12px 8px', textAlign: 'center', width: '60px' }}>Fim</th>
                            <th style={{ padding: '12px 8px', textAlign: 'center', width: '50px' }}>Dur</th>
                            <th style={{ padding: '12px 8px', textAlign: 'left' }}>Nome Original</th>
                            <th style={{ padding: '12px 8px', textAlign: 'center' }}>Função</th>
                            <th style={{ padding: '12px 8px', textAlign: 'left' }}>Publicador</th>
                            <th style={{ padding: '12px 8px', textAlign: 'center' }}>Status</th>
                        </tr>
                    </thead>
                    <tbody>
                        {filteredRecords.length === 0 ? (
                            <tr>
                                <td colSpan={14} style={{ padding: '40px', textAlign: 'center', color: 'var(--text-muted)' }}>
                                    {records.length === 0
                                        ? 'Nenhum registro importado. Faça upload de um arquivo para começar.'
                                        : 'Nenhum registro encontrado com os filtros aplicados.'}
                                </td>
                            </tr>
                        ) : (
                            filteredRecords.map(record => (
                                <tr key={record.id} style={{ borderBottom: '1px solid var(--border-color)' }}>
                                    <td style={{ padding: '12px 8px', textAlign: 'center' }}>
                                        <input
                                            type="checkbox"
                                            checked={selectedIds.has(record.id)}
                                            onChange={() => toggleSelect(record.id)}
                                        />
                                    </td>
                                    {/* Semana - Editable Week Dropdown */}
                                    <td style={{ padding: '12px 8px' }}>
                                        <EditableWeekCell record={record} />
                                    </td>
                                    {/* Seq - Read-only */}
                                    <td style={{ padding: '12px 8px', textAlign: 'center', fontWeight: 'bold', color: 'var(--text-muted)' }}>
                                        {record.seq}
                                    </td>
                                    {/* Seção - Editable Dropdown */}
                                    <td style={{ padding: '12px 8px' }}>
                                        <EditableSelectCell
                                            record={record}
                                            field="section"
                                            value={record.section}
                                            options={sectionOptions}
                                        />
                                    </td>
                                    {/* Parte - Editable Combo (texto + sugestões) */}
                                    <td style={{ padding: '12px 8px' }}>
                                        <EditableComboCell
                                            record={record}
                                            field="tituloParte"
                                            value={record.tituloParte}
                                            suggestions={STANDARD_PARTS}
                                        />
                                    </td>
                                    {/* DescricaoParte/Tema - Read-only (unified nomenclature with fallbacks) */}
                                    <td style={{ padding: '12px 8px', fontSize: '0.85em', color: 'var(--text-muted)' }}>
                                        {record.descricaoParte || record.descricaoParte || record.descricaoParte || '-'}
                                    </td>
                                    {/* Modalidade - Editable Dropdown */}
                                    <td style={{ padding: '12px 8px', textAlign: 'center' }}>
                                        <EditableSelectCell
                                            record={record}
                                            field="modalidade"
                                            value={record.modalidade}
                                            options={modalityOptions}
                                        />
                                    </td>
                                    {/* Horário Inicial - Read-only */}
                                    <td style={{ padding: '12px 8px', textAlign: 'center', fontSize: '0.85em', color: 'var(--text-muted)' }}>
                                        {record.horaInicio || '-'}
                                    </td>
                                    {/* Horário Final - Read-only */}
                                    <td style={{ padding: '12px 8px', textAlign: 'center', fontSize: '0.85em', color: 'var(--text-muted)' }}>
                                        {record.horaFim || '-'}
                                    </td>
                                    {/* Duração - Read-only */}
                                    <td style={{ padding: '12px 8px', textAlign: 'center', fontSize: '0.85em', fontWeight: '500' }}>
                                        {record.duracao ? `${record.duracao}'` : '-'}
                                    </td>
                                    {/* Nome Original - Editable Text */}
                                    <td style={{ padding: '12px 8px' }}>
                                        <EditableTextCell
                                            record={record}
                                            field="rawPublisherName"
                                            value={record.rawPublisherName}
                                        />
                                    </td>
                                    {/* Função - Editable Dropdown */}
                                    <td style={{ padding: '12px 8px', textAlign: 'center' }}>
                                        <EditableSelectCell
                                            record={record}
                                            field="funcao"
                                            value={record.funcao}
                                            options={roleOptions}
                                        />
                                    </td>
                                    {/* Publicador - Publisher Dropdown */}
                                    <td style={{ padding: '12px 8px' }}>
                                        {editingCell?.id === record.id && editingCell?.field === 'publisher' ? (
                                            <select
                                                autoFocus
                                                onChange={e => resolvePublisher(record.id, e.target.value)}
                                                onBlur={() => setEditingCell(null)}
                                                style={editInputStyle}
                                            >
                                                <option value="">Selecione...</option>
                                                {publishers.map(p => (
                                                    <option key={p.id} value={p.id}>{p.name}</option>
                                                ))}
                                            </select>
                                        ) : (
                                            <div
                                                onClick={() => record.status !== HistoryStatus.APPROVED && setEditingCell({ id: record.id, field: 'publisher' })}
                                                style={{
                                                    cursor: record.status !== HistoryStatus.APPROVED ? 'pointer' : 'default',
                                                    display: 'flex',
                                                    alignItems: 'center',
                                                    gap: '8px'
                                                }}
                                            >
                                                {record.resolvedPublisherName ? (
                                                    <>
                                                        <span style={{ color: 'var(--success-400)' }}>✓</span>
                                                        {record.resolvedPublisherName}
                                                        {record.matchConfidence && record.matchConfidence < 100 && (
                                                            <span style={{ fontSize: '0.75em', color: 'var(--text-muted)' }}>
                                                                ({record.matchConfidence}%)
                                                            </span>
                                                        )}
                                                    </>
                                                ) : (
                                                    <span style={{ color: 'var(--warning-400)' }}>
                                                        ⚠️ Clique para resolver
                                                    </span>
                                                )}
                                            </div>
                                        )}
                                    </td>
                                    {/* Status - Read-only */}
                                    <td style={{ padding: '12px 8px', textAlign: 'center' }}>
                                        <StatusBadge status={record.status} />
                                    </td>
                                </tr>
                            ))
                        )}
                    </tbody>
                </table>
            </div>

            {/* Modal Nova Parte */}
            {showAddPartModal && (
                <div style={{
                    position: 'fixed',
                    top: 0,
                    left: 0,
                    right: 0,
                    bottom: 0,
                    background: 'rgba(0,0,0,0.7)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    zIndex: 1000
                }}>
                    <div className="card" style={{
                        padding: 'var(--spacing-xl)',
                        width: '500px',
                        maxHeight: '90vh',
                        overflow: 'auto'
                    }}>
                        <h3 style={{ marginBottom: 'var(--spacing-lg)' }}>➕ Nova Parte</h3>

                        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--spacing-md)' }}>
                            {/* Semana */}
                            <label>
                                <span style={{ color: 'var(--text-muted)', fontSize: '0.85em' }}>Semana</span>
                                <select
                                    value={newPartData.weekDisplay}
                                    onChange={e => setNewPartData(prev => ({ ...prev, weekDisplay: e.target.value }))}
                                    style={{
                                        width: '100%',
                                        padding: '8px 12px',
                                        borderRadius: '6px',
                                        border: '1px solid var(--border-color)',
                                        background: 'var(--bg-secondary)',
                                        color: 'var(--text-primary)',
                                        marginTop: '4px'
                                    }}
                                >
                                    <option value="">Selecione...</option>
                                    {uniqueWeeks.map(w => (
                                        <option key={w} value={w}>{w}</option>
                                    ))}
                                </select>
                            </label>

                            {/* Seção */}
                            <label>
                                <span style={{ color: 'var(--text-muted)', fontSize: '0.85em' }}>Seção</span>
                                <select
                                    value={newPartData.section}
                                    onChange={e => setNewPartData(prev => ({ ...prev, section: e.target.value as MeetingSection }))}
                                    style={{
                                        width: '100%',
                                        padding: '8px 12px',
                                        borderRadius: '6px',
                                        border: '1px solid var(--border-color)',
                                        background: 'var(--bg-secondary)',
                                        color: 'var(--text-primary)',
                                        marginTop: '4px'
                                    }}
                                >
                                    <option value="Tesouros da Palavra de Deus">Tesouros da Palavra de Deus</option>
                                    <option value="Faça Seu Melhor no Ministério">Faça Seu Melhor no Ministério</option>
                                    <option value="Nossa Vida Cristã">Nossa Vida Cristã</option>
                                    <option value="Final da Reunião">Final da Reunião</option>
                                </select>
                            </label>

                            {/* Parte */}
                            <label>
                                <span style={{ color: 'var(--text-muted)', fontSize: '0.85em' }}>Parte</span>
                                <input
                                    type="text"
                                    value={newPartData.tituloParte}
                                    onChange={e => setNewPartData(prev => ({ ...prev, partTitle: e.target.value }))}
                                    placeholder="Ex: Joias Espirituais, Estudo Bíblico de Congregação..."
                                    style={{
                                        width: '100%',
                                        padding: '8px 12px',
                                        borderRadius: '6px',
                                        border: '1px solid var(--border-color)',
                                        background: 'var(--bg-secondary)',
                                        color: 'var(--text-primary)',
                                        marginTop: '4px'
                                    }}
                                />
                            </label>

                            {/* Modalidade */}
                            <label>
                                <span style={{ color: 'var(--text-muted)', fontSize: '0.85em' }}>Modalidade</span>
                                <select
                                    value={newPartData.modalidade}
                                    onChange={e => setNewPartData(prev => ({ ...prev, modality: e.target.value as PartModality }))}
                                    style={{
                                        width: '100%',
                                        padding: '8px 12px',
                                        borderRadius: '6px',
                                        border: '1px solid var(--border-color)',
                                        background: 'var(--bg-secondary)',
                                        color: 'var(--text-primary)',
                                        marginTop: '4px'
                                    }}
                                >
                                    <option value="Discurso de Ensino">Discurso de Ensino</option>
                                    <option value="Demonstração">Demonstração</option>
                                    <option value="Leitura de Estudante">Leitura de Estudante</option>
                                    <option value="Dirigente de EBC">Dirigente de EBC</option>
                                    <option value="Leitor de EBC">Leitor de EBC</option>
                                    <option value="Oração">Oração</option>
                                </select>
                            </label>

                            {/* Nome */}
                            <label>
                                <span style={{ color: 'var(--text-muted)', fontSize: '0.85em' }}>Nome do Participante</span>
                                <input
                                    type="text"
                                    value={newPartData.rawPublisherName}
                                    onChange={e => setNewPartData(prev => ({ ...prev, rawPublisherName: e.target.value }))}
                                    placeholder="Nome completo..."
                                    style={{
                                        width: '100%',
                                        padding: '8px 12px',
                                        borderRadius: '6px',
                                        border: '1px solid var(--border-color)',
                                        background: 'var(--bg-secondary)',
                                        color: 'var(--text-primary)',
                                        marginTop: '4px'
                                    }}
                                />
                            </label>

                            {/* Função */}
                            <label>
                                <span style={{ color: 'var(--text-muted)', fontSize: '0.85em' }}>Função</span>
                                <select
                                    value={newPartData.funcao}
                                    onChange={e => setNewPartData(prev => ({
                                        ...prev,
                                        role: e.target.value as 'Titular' | 'Ajudante'
                                    }))}
                                    style={{
                                        width: '100%',
                                        padding: '8px 12px',
                                        borderRadius: '6px',
                                        border: '1px solid var(--border-color)',
                                        background: 'var(--bg-secondary)',
                                        color: 'var(--text-primary)',
                                        marginTop: '4px'
                                    }}
                                >
                                    <option value="Titular">Titular</option>
                                    <option value="Ajudante">Ajudante</option>
                                </select>
                            </label>
                        </div>

                        {/* Botões */}
                        <div style={{
                            display: 'flex',
                            gap: 'var(--spacing-md)',
                            justifyContent: 'flex-end',
                            marginTop: 'var(--spacing-xl)'
                        }}>
                            <button
                                onClick={() => setShowAddPartModal(false)}
                                style={{
                                    padding: '8px 16px',
                                    borderRadius: '6px',
                                    border: '1px solid var(--border-color)',
                                    background: 'transparent',
                                    color: 'var(--text-primary)',
                                    cursor: 'pointer'
                                }}
                            >
                                Cancelar
                            </button>
                            <button
                                onClick={handleAddNewPart}
                                disabled={!newPartData.weekDisplay || !newPartData.tituloParte}
                                style={{
                                    padding: '8px 16px',
                                    borderRadius: '6px',
                                    border: 'none',
                                    background: newPartData.weekDisplay && newPartData.tituloParte
                                        ? 'var(--primary-500)'
                                        : 'var(--text-muted)',
                                    color: 'white',
                                    cursor: newPartData.weekDisplay && newPartData.tituloParte
                                        ? 'pointer'
                                        : 'not-allowed',
                                    fontWeight: '500'
                                }}
                            >
                                Adicionar
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
