import { useState, useMemo } from 'react';
import type { Publisher } from '../types';

interface Props {
    publishers: Publisher[];
    onDelete: (id: string) => void;
    onClose: () => void;
}

// Levenshtein distance algorithm
function levenshtein(a: string, b: string): number {
    if (a.length === 0) return b.length;
    if (b.length === 0) return a.length;

    const matrix: number[][] = [];

    for (let i = 0; i <= b.length; i++) {
        matrix[i] = [i];
    }
    for (let j = 0; j <= a.length; j++) {
        matrix[0][j] = j;
    }

    for (let i = 1; i <= b.length; i++) {
        for (let j = 1; j <= a.length; j++) {
            if (b.charAt(i - 1) === a.charAt(j - 1)) {
                matrix[i][j] = matrix[i - 1][j - 1];
            } else {
                matrix[i][j] = Math.min(
                    matrix[i - 1][j - 1] + 1,
                    matrix[i][j - 1] + 1,
                    matrix[i - 1][j] + 1
                );
            }
        }
    }

    return matrix[b.length][a.length];
}

// Normalize name for comparison
function normalizeName(name: string): string {
    return name
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '') // Remove accents
        .replace(/[^a-z\s]/g, '') // Remove non-letters
        .trim();
}

// Check if two names are probably duplicates
function areProbablyDuplicates(name1: string, name2: string): boolean {
    const norm1 = normalizeName(name1);
    const norm2 = normalizeName(name2);

    // Exact match after normalization
    if (norm1 === norm2) return true;

    // Levenshtein distance <= 2 for similar names
    if (levenshtein(norm1, norm2) <= 2) return true;

    // One name contains the other (substring match)
    if (norm1.includes(norm2) || norm2.includes(norm1)) return true;

    // First name match
    const parts1 = norm1.split(' ');
    const parts2 = norm2.split(' ');
    if (parts1[0] === parts2[0] && parts1[0].length >= 3) {
        // Same first name, check if last names are similar
        const last1 = parts1[parts1.length - 1];
        const last2 = parts2[parts2.length - 1];
        if (levenshtein(last1, last2) <= 2) return true;
    }

    return false;
}

interface DuplicateGroup {
    basePublisher: Publisher;
    duplicates: Publisher[];
}

export default function PublisherDuplicateChecker({ publishers, onDelete, onClose }: Props) {
    const [deletedIds, setDeletedIds] = useState<Set<string>>(new Set());
    const [confirmDelete, setConfirmDelete] = useState<string | null>(null);

    // Find duplicate groups
    const duplicateGroups = useMemo((): DuplicateGroup[] => {
        const sorted = [...publishers]
            .filter(p => !deletedIds.has(p.id))
            .sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'));

        const groups: DuplicateGroup[] = [];
        const usedIds = new Set<string>();

        for (let i = 0; i < sorted.length; i++) {
            if (usedIds.has(sorted[i].id)) continue;

            const duplicates: Publisher[] = [];

            for (let j = i + 1; j < sorted.length; j++) {
                if (usedIds.has(sorted[j].id)) continue;

                if (areProbablyDuplicates(sorted[i].name, sorted[j].name)) {
                    duplicates.push(sorted[j]);
                    usedIds.add(sorted[j].id);
                }
            }

            if (duplicates.length > 0) {
                usedIds.add(sorted[i].id);
                groups.push({
                    basePublisher: sorted[i],
                    duplicates
                });
            }
        }

        return groups;
    }, [publishers, deletedIds]);

    const handleDelete = async (id: string) => {
        setDeletedIds(prev => new Set([...prev, id]));
        setConfirmDelete(null);
        onDelete(id);
    };

    const totalDuplicates = duplicateGroups.reduce((sum, g) => sum + g.duplicates.length, 0);

    return (
        <div style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            background: 'rgba(0,0,0,0.8)',
            zIndex: 1000,
            display: 'flex',
            justifyContent: 'center',
            alignItems: 'center',
            padding: '20px'
        }}>
            <div style={{
                background: '#1a1a2e',
                borderRadius: '12px',
                width: '100%',
                maxWidth: '800px',
                maxHeight: '90vh',
                overflow: 'hidden',
                display: 'flex',
                flexDirection: 'column'
            }}>
                {/* Header */}
                <div style={{
                    padding: '20px',
                    borderBottom: '1px solid #333',
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center'
                }}>
                    <div>
                        <h2 style={{ margin: 0, color: '#fff' }}>🔍 Verificar Duplicatas de Publicadores</h2>
                        <p style={{ margin: '8px 0 0', color: '#888', fontSize: '0.9em' }}>
                            {duplicateGroups.length > 0
                                ? `Encontrados ${duplicateGroups.length} grupos com ${totalDuplicates} prováveis duplicatas`
                                : 'Nenhuma duplicata provável encontrada! ✅'
                            }
                        </p>
                    </div>
                    <button
                        onClick={onClose}
                        style={{
                            background: 'none',
                            border: 'none',
                            color: '#fff',
                            fontSize: '24px',
                            cursor: 'pointer',
                            padding: '8px'
                        }}
                    >
                        ✕
                    </button>
                </div>

                {/* Content */}
                <div style={{
                    overflowY: 'auto',
                    padding: '20px',
                    flex: 1
                }}>
                    {duplicateGroups.length === 0 ? (
                        <div style={{
                            textAlign: 'center',
                            padding: '60px 20px',
                            color: '#4ade80'
                        }}>
                            <div style={{ fontSize: '48px', marginBottom: '16px' }}>✅</div>
                            <p>Todos os publicadores parecem ser únicos!</p>
                            <p style={{ color: '#888', fontSize: '0.9em' }}>
                                Total de publicadores: {publishers.length}
                            </p>
                        </div>
                    ) : (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                            {duplicateGroups.map((group, idx) => (
                                <div key={idx} style={{
                                    background: '#2a2a3e',
                                    borderRadius: '8px',
                                    padding: '16px',
                                    border: '1px solid #f59e0b33'
                                }}>
                                    <div style={{
                                        color: '#f59e0b',
                                        fontSize: '0.8em',
                                        marginBottom: '12px',
                                        display: 'flex',
                                        alignItems: 'center',
                                        gap: '8px'
                                    }}>
                                        ⚠️ Grupo de possíveis duplicatas
                                    </div>

                                    {/* Base publisher */}
                                    <PublisherRow
                                        publisher={group.basePublisher}
                                        isBase={true}
                                        onDeleteClick={() => setConfirmDelete(group.basePublisher.id)}
                                        confirmDelete={confirmDelete === group.basePublisher.id}
                                        onConfirmDelete={() => handleDelete(group.basePublisher.id)}
                                        onCancelDelete={() => setConfirmDelete(null)}
                                    />

                                    {/* Duplicates */}
                                    {group.duplicates.map(dup => (
                                        <PublisherRow
                                            key={dup.id}
                                            publisher={dup}
                                            isBase={false}
                                            onDeleteClick={() => setConfirmDelete(dup.id)}
                                            confirmDelete={confirmDelete === dup.id}
                                            onConfirmDelete={() => handleDelete(dup.id)}
                                            onCancelDelete={() => setConfirmDelete(null)}
                                        />
                                    ))}
                                </div>
                            ))}
                        </div>
                    )}
                </div>

                {/* Footer */}
                <div style={{
                    padding: '16px 20px',
                    borderTop: '1px solid #333',
                    display: 'flex',
                    justifyContent: 'flex-end'
                }}>
                    <button
                        onClick={onClose}
                        style={{
                            padding: '10px 24px',
                            background: '#3b82f6',
                            border: 'none',
                            borderRadius: '6px',
                            color: '#fff',
                            cursor: 'pointer'
                        }}
                    >
                        Fechar
                    </button>
                </div>
            </div>
        </div>
    );
}

// Individual publisher row component
function PublisherRow({
    publisher,
    isBase,
    onDeleteClick,
    confirmDelete,
    onConfirmDelete,
    onCancelDelete
}: {
    publisher: Publisher;
    isBase: boolean;
    onDeleteClick: () => void;
    confirmDelete: boolean;
    onConfirmDelete: () => void;
    onCancelDelete: () => void;
}) {
    return (
        <div style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '12px',
            background: isBase ? '#1a1a2e' : '#252538',
            borderRadius: '6px',
            marginTop: isBase ? 0 : '8px'
        }}>
            <div style={{ flex: 1 }}>
                <div style={{
                    color: '#fff',
                    fontWeight: isBase ? 600 : 400,
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px'
                }}>
                    {publisher.name}
                    {isBase && <span style={{
                        fontSize: '0.7em',
                        background: '#3b82f6',
                        padding: '2px 6px',
                        borderRadius: '4px'
                    }}>Principal</span>}
                    {publisher.source === 'import' && <span style={{
                        fontSize: '0.7em',
                        background: '#8b5cf6',
                        padding: '2px 6px',
                        borderRadius: '4px'
                    }}>Import</span>}
                </div>
                <div style={{
                    color: '#888',
                    fontSize: '0.8em',
                    marginTop: '4px'
                }}>
                    ID: {publisher.id} | {publisher.gender === 'brother' ? 'Irmão' : 'Irmã'} | {publisher.condition}
                    {publisher.aliases?.length > 0 && publisher.aliases[0] !== publisher.name && (
                        <span style={{ color: '#f59e0b' }}> | Alias: {publisher.aliases.join(', ')}</span>
                    )}
                </div>
            </div>

            <div>
                {confirmDelete ? (
                    <div style={{ display: 'flex', gap: '8px' }}>
                        <button
                            onClick={onConfirmDelete}
                            style={{
                                padding: '6px 12px',
                                background: '#dc2626',
                                border: 'none',
                                borderRadius: '4px',
                                color: '#fff',
                                cursor: 'pointer',
                                fontSize: '0.85em'
                            }}
                        >
                            Confirmar
                        </button>
                        <button
                            onClick={onCancelDelete}
                            style={{
                                padding: '6px 12px',
                                background: '#444',
                                border: 'none',
                                borderRadius: '4px',
                                color: '#fff',
                                cursor: 'pointer',
                                fontSize: '0.85em'
                            }}
                        >
                            Cancelar
                        </button>
                    </div>
                ) : (
                    <button
                        onClick={onDeleteClick}
                        style={{
                            width: '32px',
                            height: '32px',
                            background: '#dc262633',
                            border: '1px solid #dc262666',
                            borderRadius: '6px',
                            color: '#f87171',
                            cursor: 'pointer',
                            fontSize: '16px',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center'
                        }}
                        title="Excluir duplicata"
                    >
                        ✕
                    </button>
                )}
            </div>
        </div>
    );
}
