import { useState, useMemo, useCallback } from 'react';
import type { Publisher, Participation, HistoryRecord } from '../types';
import { HistoryStatus, ParticipationType } from '../types';

interface Props {
    publishers: Publisher[];
    participations: Participation[];
    onImport: (newParticipations: Participation[]) => void;
}

// Matching de nomes com fuzzy search
function findBestMatch(rawName: string, publishers: Publisher[]): { publisher: Publisher | null; confidence: number } {
    const normalized = rawName.toLowerCase().trim();

    for (const pub of publishers) {
        // Match exato
        if (pub.name.toLowerCase() === normalized) {
            return { publisher: pub, confidence: 100 };
        }
        // Match por alias
        for (const alias of pub.aliases || []) {
            if (alias.toLowerCase() === normalized) {
                return { publisher: pub, confidence: 95 };
            }
        }
    }

    // Match parcial (primeiro + último nome)
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

    // Match por primeiro nome
    for (const pub of publishers) {
        if (pub.name.toLowerCase().startsWith(parts[0] + ' ')) {
            return { publisher: pub, confidence: 60 };
        }
    }

    return { publisher: null, confidence: 0 };
}

// Parser de JSON
function parseJsonImport(content: string, publishers: Publisher[]): HistoryRecord[] {
    const data = JSON.parse(content);
    const records: HistoryRecord[] = [];
    const batchId = `batch-${Date.now()}`;

    const items = Array.isArray(data) ? data : [data];

    for (const item of items) {
        const match = findBestMatch(item.publisherName || item.student || '', publishers);
        const helperMatch = item.helperName || item.assistant
            ? findBestMatch(item.helperName || item.assistant, publishers)
            : null;

        records.push({
            id: `hr-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
            weekId: item.week || item.weekId || '',
            weekDisplay: item.weekDisplay || item.week || '',
            date: item.date || new Date().toISOString().split('T')[0],
            partTitle: item.partTitle || item.title || '',
            partType: item.type || item.partType || 'Ministério',
            rawPublisherName: item.publisherName || item.student || '',
            rawHelperName: item.helperName || item.assistant,
            resolvedPublisherId: match.publisher?.id,
            resolvedPublisherName: match.publisher?.name,
            resolvedHelperId: helperMatch?.publisher?.id,
            resolvedHelperName: helperMatch?.publisher?.name,
            matchConfidence: match.confidence,
            status: match.confidence >= 80 ? HistoryStatus.VALIDATED : HistoryStatus.PENDING,
            importSource: 'JSON',
            importBatchId: batchId,
            createdAt: new Date().toISOString(),
        });
    }

    return records;
}

export default function HistoryImporter({ publishers, onImport }: Props) {
    const [records, setRecords] = useState<HistoryRecord[]>([]);
    const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
    const [filterStatus, setFilterStatus] = useState<HistoryStatus | 'all'>('all');
    const [filterWeek, setFilterWeek] = useState<string>('');
    const [searchTerm, setSearchTerm] = useState('');
    const [editingId, setEditingId] = useState<string | null>(null);

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

    // Upload de arquivo
    const handleFileUpload = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;

        const reader = new FileReader();
        reader.onload = (event) => {
            try {
                const content = event.target?.result as string;
                let newRecords: HistoryRecord[] = [];

                if (file.name.endsWith('.json')) {
                    newRecords = parseJsonImport(content, publishers);
                } else {
                    alert('Formato não suportado. Use JSON.');
                    return;
                }

                setRecords(prev => [...prev, ...newRecords]);
            } catch (error) {
                alert('Erro ao processar arquivo: ' + error);
            }
        };
        reader.readAsText(file);
        e.target.value = '';
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
        setEditingId(null);
    };

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

            {/* Upload */}
            <div className="card" style={{ padding: 'var(--spacing-lg)', marginBottom: 'var(--spacing-xl)' }}>
                <h3 style={{ marginBottom: 'var(--spacing-md)' }}>📥 Importar Arquivo</h3>
                <div style={{ display: 'flex', gap: 'var(--spacing-md)', alignItems: 'center' }}>
                    <input
                        type="file"
                        accept=".json"
                        onChange={handleFileUpload}
                        style={{ flex: 1 }}
                    />
                    <span style={{ color: 'var(--text-muted)', fontSize: '0.85em' }}>
                        Formatos: JSON
                    </span>
                </div>
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
                            <th style={{ padding: '12px 8px', textAlign: 'left' }}>Parte</th>
                            <th style={{ padding: '12px 8px', textAlign: 'left' }}>Nome Original</th>
                            <th style={{ padding: '12px 8px', textAlign: 'left' }}>Publicador</th>
                            <th style={{ padding: '12px 8px', textAlign: 'center' }}>Status</th>
                        </tr>
                    </thead>
                    <tbody>
                        {filteredRecords.length === 0 ? (
                            <tr>
                                <td colSpan={6} style={{ padding: '40px', textAlign: 'center', color: 'var(--text-muted)' }}>
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
                                    <td style={{ padding: '12px 8px' }}>
                                        <div>{record.weekDisplay}</div>
                                        <div style={{ fontSize: '0.8em', color: 'var(--text-muted)' }}>{record.date}</div>
                                    </td>
                                    <td style={{ padding: '12px 8px' }}>
                                        <div>{record.partTitle}</div>
                                        <div style={{ fontSize: '0.8em', color: 'var(--text-muted)' }}>{record.partType}</div>
                                    </td>
                                    <td style={{ padding: '12px 8px' }}>
                                        {record.rawPublisherName}
                                        {record.rawHelperName && (
                                            <div style={{ fontSize: '0.8em', color: 'var(--text-muted)' }}>
                                                + {record.rawHelperName}
                                            </div>
                                        )}
                                    </td>
                                    <td style={{ padding: '12px 8px' }}>
                                        {editingId === record.id ? (
                                            <select
                                                autoFocus
                                                onChange={e => resolvePublisher(record.id, e.target.value)}
                                                onBlur={() => setEditingId(null)}
                                                style={{
                                                    padding: '6px',
                                                    borderRadius: '4px',
                                                    border: '1px solid var(--primary-500)',
                                                    background: 'var(--bg-secondary)',
                                                    color: 'var(--text-primary)',
                                                    width: '100%'
                                                }}
                                            >
                                                <option value="">Selecione...</option>
                                                {publishers.map(p => (
                                                    <option key={p.id} value={p.id}>{p.name}</option>
                                                ))}
                                            </select>
                                        ) : (
                                            <div
                                                onClick={() => record.status !== HistoryStatus.APPROVED && setEditingId(record.id)}
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
