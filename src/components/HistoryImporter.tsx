import { useState, useMemo, useCallback } from 'react';
import type { Publisher, Participation, HistoryRecord } from '../types';
import { HistoryStatus, ParticipationType, PartModality } from '../types';
import { parsePdfFile } from '../services/pdfParser';

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
                    r.partTitle.toLowerCase().includes(term) ||
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

    // Upload de arquivo PDF (parser local, sem backend)
    const handleFileUpload = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;

        if (!file.name.toLowerCase().endsWith('.pdf')) {
            setUploadError('Apenas arquivos PDF são suportados.');
            e.target.value = '';
            return;
        }

        setIsUploading(true);
        setUploadError(null);

        try {
            // Parser local usando PDF.js (funciona no navegador)
            const result = await parsePdfFile(file);

            if (!result.success) {
                throw new Error(result.error || 'Erro ao processar PDF');
            }

            // Aplicar matching de nomes
            const matchedRecords = applyNameMatching(result.records, publishers);

            setRecords(prev => [...prev, ...matchedRecords]);
            setUploadError(null);
        } catch (error) {
            console.error('Erro ao fazer upload:', error);
            setUploadError(error instanceof Error ? error.message : 'Erro desconhecido');
        } finally {
            setIsUploading(false);
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
                partTitle: r.partTitle,
                type: r.partType as ParticipationType,
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
    const sectionOptions = ['Tesouros', 'Ministério', 'Vida Cristã'];
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

            {/* Upload PDF */}
            <div className="card" style={{ padding: 'var(--spacing-lg)', marginBottom: 'var(--spacing-xl)' }}>
                <h3 style={{ marginBottom: 'var(--spacing-md)' }}>📥 Importar PDF (S-140)</h3>
                <div style={{ display: 'flex', gap: 'var(--spacing-md)', alignItems: 'center' }}>
                    <input
                        type="file"
                        accept=".pdf"
                        onChange={handleFileUpload}
                        disabled={isUploading}
                        style={{ flex: 1 }}
                    />
                    {isUploading && (
                        <span style={{ color: 'var(--primary-400)' }}>
                            ⏳ Processando PDF...
                        </span>
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
                            <th style={{ padding: '12px 8px', textAlign: 'left' }}>Seção</th>
                            <th style={{ padding: '12px 8px', textAlign: 'left' }}>Parte</th>
                            <th style={{ padding: '12px 8px', textAlign: 'center' }}>Modalidade</th>
                            <th style={{ padding: '12px 8px', textAlign: 'left' }}>Nome Original</th>
                            <th style={{ padding: '12px 8px', textAlign: 'center' }}>Função</th>
                            <th style={{ padding: '12px 8px', textAlign: 'left' }}>Publicador</th>
                            <th style={{ padding: '12px 8px', textAlign: 'center' }}>Status</th>
                        </tr>
                    </thead>
                    <tbody>
                        {filteredRecords.length === 0 ? (
                            <tr>
                                <td colSpan={9} style={{ padding: '40px', textAlign: 'center', color: 'var(--text-muted)' }}>
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
                                            field="partTitle"
                                            value={record.partTitle}
                                            suggestions={STANDARD_PARTS}
                                        />
                                    </td>
                                    {/* Modalidade - Editable Dropdown */}
                                    <td style={{ padding: '12px 8px', textAlign: 'center' }}>
                                        <EditableSelectCell
                                            record={record}
                                            field="modality"
                                            value={record.modality}
                                            options={modalityOptions}
                                        />
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
                                            field="participationRole"
                                            value={record.participationRole}
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
        </div>
    );
}
