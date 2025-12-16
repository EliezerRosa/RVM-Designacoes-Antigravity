import { useState, useMemo, useEffect } from 'react';
import type { Publisher, Participation } from '../types';
import { ParticipationType } from '../types';
import { importedHistory } from '../data/importedHistory';
import { api } from '../services/api';

interface Props {
    publishers: Publisher[];
    participations: Participation[];  // Add this to check already imported
    onImport: (newPublishers: Publisher[], updatedPublishers: Publisher[], newParticipations: Participation[]) => void;
    onCancel: () => void;
}

interface Resolution {
    type: 'map' | 'create' | 'ignore';
    targetId?: string; // If map
    newPublisherData?: Partial<Publisher>; // If create
    updateExistingName?: boolean; // If map, update name in registry
}

const PART_MAPPING: Record<string, ParticipationType> = {
    'Presidente/Oração Inicial': ParticipationType.PRESIDENTE,
    'Oração Final': ParticipationType.ORACAO_FINAL,
    'Leitura da Bíblia (Estudante)': ParticipationType.TESOUROS, // Approximate
    'Parte Tesouros (Salão Principal)': ParticipationType.TESOUROS,
    'Parte Nossa Vida Cristã (Orador)': ParticipationType.VIDA_CRISTA,
    'Dirigente': ParticipationType.DIRIGENTE,
    'Leitor': ParticipationType.LEITOR,
    'Faça Seu Melhor (Estudantes/Ajudantes)': ParticipationType.MINISTERIO,
    'Leitor/Orador Final': ParticipationType.LEITOR, // Or generic
    'Dirigente/Oração Final': ParticipationType.DIRIGENTE,
};

// Parse week text like "SEMANA 4 -10 DE NOVEMBRO | ..." into ISO date
function parseWeekDate(weekText: string): string {
    const months: Record<string, number> = {
        'JANEIRO': 0, 'FEVEREIRO': 1, 'MARÇO': 2, 'ABRIL': 3,
        'MAIO': 4, 'JUNHO': 5, 'JULHO': 6, 'AGOSTO': 7,
        'SETEMBRO': 8, 'OUTUBRO': 9, 'NOVEMBRO': 10, 'DEZEMBRO': 11
    };

    // Try to extract day and month: "SEMANA 4 -10 DE NOVEMBRO"
    const match = weekText.match(/(\d+)\s*[-–]\s*(\d+)\s+DE\s+(\w+)/i);
    if (match) {
        const endDay = parseInt(match[2]);
        const monthName = match[3].toUpperCase();
        const month = months[monthName];

        if (month !== undefined) {
            // Assume current year or previous year if date is in future
            const now = new Date();
            let year = now.getFullYear();
            const testDate = new Date(year, month, endDay);
            if (testDate > now) {
                year -= 1; // Assume it's from last year
            }
            return new Date(year, month, endDay).toISOString();
        }
    }

    // Fallback: return empty string or current date
    return '';
}

export default function HistoryImporter({ publishers, participations, onImport, onCancel }: Props) {
    const [resolutions, setResolutions] = useState<Record<string, Resolution>>({});
    const [selectedName, setSelectedName] = useState<string | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [cleanupStatus, setCleanupStatus] = useState<string | null>(null);
    const [currentStep, setCurrentStep] = useState<1 | 2 | 3>(1);

    // Load saved resolutions from Supabase on mount
    useEffect(() => {
        async function loadResolutions() {
            try {
                const saved = await api.getSetting<Record<string, Resolution>>('historyResolutions', {});
                setResolutions(saved);
            } catch (e) {
                console.warn('Failed to load saved resolutions', e);
            } finally {
                setIsLoading(false);
            }
        }
        loadResolutions();
    }, []);

    // Filter state - 'all' | 'resolved' | 'imported' | 'pending'
    const [statusFilter, setStatusFilter] = useState<'all' | 'resolved' | 'imported' | 'pending'>('all');

    // Build a map of names to their actual participation count from database
    const participationCounts = useMemo(() => {
        const counts: Record<string, number> = {};
        participations.forEach(p => {
            const normalizedName = p.publisherName.toLowerCase().trim();
            counts[normalizedName] = (counts[normalizedName] || 0) + 1;
        });
        return counts;
    }, [participations]);

    // Build a set of names that already have participations in the database
    const importedNames = useMemo(() => {
        const names = new Set<string>();
        participations.forEach(p => {
            // Normalize name for comparison
            names.add(p.publisherName.toLowerCase().trim());
        });
        return names;
    }, [participations]);

    // Get actual count from database for a name
    const getActualCount = (name: string): number => {
        const normalizedName = name.toLowerCase().trim();
        // Direct match
        if (participationCounts[normalizedName]) {
            return participationCounts[normalizedName];
        }
        // Fuzzy match
        for (const [key, count] of Object.entries(participationCounts)) {
            if (key.includes(normalizedName) || normalizedName.includes(key)) {
                return count;
            }
        }
        return 0;
    };

    // Group unknown names from imported history
    const unknownNames = useMemo(() => {
        const counts: Record<string, { count: number, best_guess: string | null }> = {};
        importedHistory.unknown_names.forEach(u => {
            counts[u.name] = { count: u.count, best_guess: u.best_guess };
        });

        // Also ensure any unmapped participations not in unknown_names list are caught? 
        // Actually importedHistory.unknown_names is likely the source of truth for the script analysis.
        // Let's use importedHistory.unknown_names directly.
        return importedHistory.unknown_names.sort((a, b) => b.count - a.count);
    }, []);

    const handleResolve = async (name: string, resolution: Resolution) => {
        const newResolutions = { ...resolutions, [name]: resolution };
        setResolutions(newResolutions);

        // Persist to Supabase
        try {
            await api.setSetting('historyResolutions', newResolutions);
        } catch (e) {
            console.warn('Failed to save resolution', e);
        }
    };

    // Check if a name has been processed (either has resolution or has participations)
    const getStatus = (name: string): 'resolved' | 'imported' | 'pending' => {
        // Check if already has participations in database (approximately)
        const normalizedName = name.toLowerCase().trim();
        const hasParticipations = importedNames.has(normalizedName) ||
            Array.from(importedNames).some(n => n.includes(normalizedName) || normalizedName.includes(n));

        if (resolutions[name]) return 'resolved';
        if (hasParticipations) return 'imported';
        return 'pending';
    };

    // Get icon for status
    const getStatusIcon = (status: 'resolved' | 'imported' | 'pending') => {
        if (status === 'resolved') return '✅';
        if (status === 'imported') return '📥';
        return '⚠️';
    };

    // Filter the list based on status
    const filteredNames = useMemo(() => {
        if (statusFilter === 'all') return unknownNames;
        return unknownNames.filter(item => getStatus(item.name) === statusFilter);
    }, [unknownNames, statusFilter, resolutions, importedNames]);

    // Count by status
    const counts = useMemo(() => ({
        resolved: unknownNames.filter(item => getStatus(item.name) === 'resolved').length,
        imported: unknownNames.filter(item => getStatus(item.name) === 'imported').length,
        pending: unknownNames.filter(item => getStatus(item.name) === 'pending').length,
    }), [unknownNames, resolutions, importedNames]);

    const resolvedCount = counts.resolved + counts.imported;

    const currentResolution = selectedName ? resolutions[selectedName] : null;

    const handleImport = () => {
        const newPublishers: Publisher[] = [];
        const updatedPublishers: Publisher[] = [];
        const newParticipations: Participation[] = [];
        const usedIds = new Set(publishers.map(p => p.id));

        // Helper to get name from ID (existing or new)
        const getName = (id: string): string | undefined => {
            const existing = publishers.find(p => p.id === id);
            // Check if this existing publisher is being updated
            const updated = updatedPublishers.find(up => up.id === id);
            if (updated) return updated.name;

            if (existing) return existing.name;
            const newPub = newPublishers.find(p => p.id === id);
            return newPub?.name;
        };

        // 1. Process resolutions (Create & Update)
        Object.entries(resolutions).forEach(([name, res]) => {
            if (res.type === 'create' && res.newPublisherData) {
                // Generate new ID
                let newId = (publishers.length + newPublishers.length + 1).toString();
                while (usedIds.has(newId)) {
                    newId = (parseInt(newId) + 1).toString();
                }
                usedIds.add(newId);

                const pub: Publisher = {
                    id: newId,
                    name: res.newPublisherData.name || name,
                    gender: res.newPublisherData.gender || 'brother',
                    condition: 'Publicador', // Default
                    phone: '',
                    isBaptized: true,
                    isServing: true,
                    ageGroup: 'Adulto',
                    parentIds: [],
                    isHelperOnly: false,
                    canPairWithNonParent: false,
                    privileges: {
                        canGiveTalks: false,
                        canConductCBS: false,
                        canReadCBS: false,
                        canPray: false,
                        canPreside: false,
                    },
                    privilegesBySection: {
                        canParticipateInTreasures: false,
                        canParticipateInMinistry: true,
                        canParticipateInLife: false,
                    },
                    availability: { mode: "always", exceptionDates: [], availableDates: [] },
                    aliases: [name],
                    source: 'import',
                    createdAt: new Date().toISOString(),
                };
                newPublishers.push(pub);
            } else if (res.type === 'map' && res.targetId && res.updateExistingName) {
                // Update existing publisher name
                const existing = publishers.find(p => p.id === res.targetId);
                if (existing) {
                    // Check if already in updated list
                    const alreadyUpdated = updatedPublishers.find(up => up.id === res.targetId);
                    const base = alreadyUpdated || existing;

                    updatedPublishers.push({
                        ...base,
                        name: name, // Set name to the one from history (which is the key)
                        // Add alias if not present?
                        aliases: base.aliases.includes(base.name) ? base.aliases : [...base.aliases, base.name]
                    });
                }
            }
        });

        // 2. Map particpations
        // Helper to find ID
        const findId = (rawName: string, matchedId: string | null) => {
            if (matchedId) return matchedId;
            const res = resolutions[rawName];
            if (!res) return null;
            if (res.type === 'ignore') return null;
            if (res.type === 'map') return res.targetId;
            if (res.type === 'create') {
                // Find the new publisher we just created
                const p = newPublishers.find(np => np.aliases?.includes(rawName));
                return p?.id;
            }
            return null;
        };

        let importedCount = 0;
        importedHistory.participations.forEach(p => {
            const pubId = findId(p.raw_name, p.matched_publisher_id || null);
            if (pubId) {
                const pubName = getName(pubId);
                if (!pubName) return;

                let type: ParticipationType | undefined = PART_MAPPING[p.part];

                if (!type) {
                    // Try fuzzy match on part name
                    if (p.part.includes('Leitura')) type = ParticipationType.TESOUROS;
                    else if (p.part.includes('Oração')) type = ParticipationType.ORACAO_FINAL;
                    else if (p.part.includes('Tesouros')) type = ParticipationType.TESOUROS;
                    else if (p.part.includes('Vida')) type = ParticipationType.VIDA_CRISTA;
                    else if (p.part.includes('Melhor')) type = ParticipationType.MINISTERIO;
                    else if (p.part.includes('Dirigente')) type = ParticipationType.DIRIGENTE;
                    else if (p.part.includes('Leitor')) type = ParticipationType.LEITOR;
                }

                if (type) {
                    newParticipations.push({
                        id: crypto.randomUUID(),
                        publisherName: pubName,
                        week: p.week,
                        date: parseWeekDate(p.week), // Parse week text into ISO date
                        partTitle: p.part,
                        type: type,
                        source: 'import',
                        createdAt: new Date().toISOString(),
                    });
                    importedCount++;
                }
            }
        });

        console.log(`Importing ${newPublishers.length} new, ${updatedPublishers.length} updated, and ${importedCount} participations`);
        onImport(newPublishers, updatedPublishers, newParticipations);
    };

    return (
        <div className="history-importer" style={{ padding: '20px', color: '#fff' }}>
            <h2>Importar Histórico</h2>

            {/* Step Indicator */}
            <div style={{ display: 'flex', gap: '8px', marginBottom: '20px', alignItems: 'center' }}>
                <div
                    onClick={() => setCurrentStep(1)}
                    style={{
                        padding: '8px 16px',
                        borderRadius: '20px',
                        background: currentStep >= 1 ? '#3b82f6' : '#444',
                        color: '#fff',
                        fontWeight: currentStep === 1 ? 'bold' : 'normal',
                        cursor: 'pointer'
                    }}
                >
                    1. Publicadores {currentStep > 1 && '✓'}
                </div>
                <div style={{ color: '#666' }}>→</div>
                <div
                    onClick={() => counts.pending === 0 && setCurrentStep(2)}
                    style={{
                        padding: '8px 16px',
                        borderRadius: '20px',
                        background: currentStep >= 2 ? '#3b82f6' : '#444',
                        color: '#fff',
                        fontWeight: currentStep === 2 ? 'bold' : 'normal',
                        cursor: counts.pending === 0 ? 'pointer' : 'not-allowed',
                        opacity: counts.pending > 0 && currentStep === 1 ? 0.5 : 1
                    }}
                >
                    2. Revisar {currentStep > 2 && '✓'}
                </div>
                <div style={{ color: '#666' }}>→</div>
                <div
                    onClick={() => counts.pending === 0 && currentStep >= 2 && setCurrentStep(3)}
                    style={{
                        padding: '8px 16px',
                        borderRadius: '20px',
                        background: currentStep >= 3 ? '#22c55e' : '#444',
                        color: '#fff',
                        fontWeight: currentStep === 3 ? 'bold' : 'normal',
                        cursor: currentStep >= 2 ? 'pointer' : 'not-allowed',
                        opacity: currentStep < 2 ? 0.5 : 1
                    }}
                >
                    3. Importar
                </div>
            </div>

            {isLoading ? (
                <div style={{ textAlign: 'center', padding: '40px' }}>
                    <div className="spinner" style={{ margin: '0 auto' }}></div>
                    <p>Carregando resoluções salvas...</p>
                </div>
            ) : (
                <div style={{ display: 'flex', gap: '20px', height: '600px' }}>
                    {/* List */}
                    <div style={{ width: '350px', overflowY: 'auto', borderRight: '1px solid #444' }}>
                        <div style={{ padding: '8px', borderBottom: '1px solid #444' }}>
                            <div style={{ fontSize: '0.85em', color: '#888', marginBottom: '8px' }}>
                                Processado: {resolvedCount} / {unknownNames.length}
                            </div>
                            <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap' }}>
                                <button
                                    onClick={() => setStatusFilter('all')}
                                    style={{
                                        padding: '4px 8px',
                                        fontSize: '0.75em',
                                        cursor: 'pointer',
                                        background: statusFilter === 'all' ? '#007bff' : '#444',
                                        color: '#fff',
                                        border: 'none',
                                        borderRadius: '4px'
                                    }}
                                >
                                    Todos ({unknownNames.length})
                                </button>
                                <button
                                    onClick={() => setStatusFilter('resolved')}
                                    style={{
                                        padding: '4px 8px',
                                        fontSize: '0.75em',
                                        cursor: 'pointer',
                                        background: statusFilter === 'resolved' ? '#28a745' : '#444',
                                        color: '#fff',
                                        border: 'none',
                                        borderRadius: '4px'
                                    }}
                                >
                                    ✅ Resolvido ({counts.resolved})
                                </button>
                                <button
                                    onClick={() => setStatusFilter('imported')}
                                    style={{
                                        padding: '4px 8px',
                                        fontSize: '0.75em',
                                        cursor: 'pointer',
                                        background: statusFilter === 'imported' ? '#17a2b8' : '#444',
                                        color: '#fff',
                                        border: 'none',
                                        borderRadius: '4px'
                                    }}
                                >
                                    📥 Importado ({counts.imported})
                                </button>
                                <button
                                    onClick={() => setStatusFilter('pending')}
                                    style={{
                                        padding: '4px 8px',
                                        fontSize: '0.75em',
                                        cursor: 'pointer',
                                        background: statusFilter === 'pending' ? '#ffc107' : '#444',
                                        color: statusFilter === 'pending' ? '#333' : '#fff',
                                        border: 'none',
                                        borderRadius: '4px'
                                    }}
                                >
                                    ⚠️ Pendente ({counts.pending})
                                </button>
                            </div>
                        </div>
                        {filteredNames.map((item) => {
                            const status = getStatus(item.name);
                            const actualCount = getActualCount(item.name);
                            return (
                                <div
                                    key={item.name}
                                    onClick={() => setSelectedName(item.name)}
                                    style={{
                                        padding: '10px',
                                        cursor: 'pointer',
                                        background: selectedName === item.name ? '#333' : 'transparent',
                                        borderBottom: '1px solid #222'
                                    }}
                                >
                                    {getStatusIcon(status)} {item.name}
                                    <span style={{ opacity: 0.6, marginLeft: '4px' }}>
                                        ({item.count})
                                        {actualCount > 0 && (
                                            <span style={{ color: '#17a2b8', marginLeft: '4px' }}>
                                                → BD: {actualCount}
                                            </span>
                                        )}
                                    </span>
                                </div>
                            );
                        })}
                    </div>

                    {/* Detail */}
                    <div style={{ flex: 1, padding: '20px' }}>
                        {selectedName ? (
                            <div>
                                <h3>Resolver: {selectedName}</h3>
                                <p>Encontrado {unknownNames.find(n => n.name === selectedName)?.count} vezes nas pautas.</p>

                                <div style={{ margin: '20px 0', display: 'flex', flexDirection: 'column', gap: '10px' }}>
                                    {/* Suggestion Block */}
                                    {(() => {
                                        // 1. Try exact match against current publishers
                                        const exactMatch = publishers.find(p => p.name.toLowerCase() === selectedName.toLowerCase());

                                        // 2. Fallback to static best_guess
                                        const unknownEntry = unknownNames.find(n => n.name === selectedName);
                                        let suggestedPub = exactMatch;

                                        if (!suggestedPub && unknownEntry?.best_guess) {
                                            suggestedPub = publishers.find(p => p.name === unknownEntry.best_guess);
                                        }

                                        if (suggestedPub) {
                                            const isExact = suggestedPub.name.toLowerCase() === selectedName.toLowerCase();

                                            return (
                                                <div style={{
                                                    background: isExact ? 'rgba(76, 175, 80, 0.1)' : 'rgba(33, 150, 243, 0.1)',
                                                    padding: '15px',
                                                    borderRadius: '8px',
                                                    border: `1px solid ${isExact ? 'rgba(76, 175, 80, 0.3)' : 'rgba(33, 150, 243, 0.3)'}`,
                                                    marginBottom: '15px'
                                                }}>
                                                    <p style={{ margin: '0 0 10px 0', fontSize: '0.9em', color: isExact ? '#81c784' : '#64b5f6', fontWeight: 'bold' }}>
                                                        {isExact ? '✅ Correspondência exata encontrada:' : '💡 Sugestão encontrada (Similar):'}
                                                    </p>

                                                    <div style={{ fontSize: '1.1em', marginBottom: '15px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                                                        <span style={{ color: '#aaa' }}>{selectedName}</span>
                                                        <span>→</span>
                                                        <strong style={{ color: '#fff' }}>{suggestedPub.name}</strong>
                                                    </div>

                                                    <div style={{ display: 'flex', gap: '10px' }}>
                                                        <button
                                                            onClick={() => handleResolve(selectedName, { type: 'map', targetId: suggestedPub!.id })}
                                                            style={{
                                                                flex: 1,
                                                                padding: '8px 12px',
                                                                background: '#444',
                                                                border: '1px solid #666',
                                                                color: '#fff',
                                                                borderRadius: '4px',
                                                                cursor: 'pointer',
                                                                textAlign: 'center'
                                                            }}
                                                            title="Mantém o nome que já está no cadastro"
                                                        >
                                                            Vincular
                                                            <div style={{ fontSize: '0.7em', color: '#aaa', marginTop: '4px' }}>
                                                                Manter "{suggestedPub.name}"
                                                            </div>
                                                        </button>

                                                        <button
                                                            onClick={() => handleResolve(selectedName, { type: 'map', targetId: suggestedPub!.id, updateExistingName: true })}
                                                            style={{
                                                                flex: 1,
                                                                padding: '8px 12px',
                                                                background: isExact ? '#2e7d32' : '#1565c0',
                                                                border: 'none',
                                                                color: '#fff',
                                                                borderRadius: '4px',
                                                                cursor: 'pointer',
                                                                textAlign: 'center'
                                                            }}
                                                            title="Atualiza o cadastro com o nome vindo do histórico"
                                                        >
                                                            Vincular e Renomear
                                                            <div style={{ fontSize: '0.7em', color: 'rgba(255,255,255,0.8)', marginTop: '4px' }}>
                                                                Usar "{selectedName}"
                                                            </div>
                                                        </button>
                                                    </div>
                                                </div>
                                            );
                                        }
                                        return null;
                                    })()}

                                    <label>
                                        <input
                                            type="radio"
                                            name="resType"
                                            checked={currentResolution?.type === 'map'}
                                            onChange={() => handleResolve(selectedName, { type: 'map', targetId: '' })}
                                        />
                                        Mapear para Existente
                                    </label>
                                    {currentResolution?.type === 'map' && (
                                        <div style={{ marginLeft: '25px' }}>
                                            <select
                                                value={currentResolution.targetId || ''}
                                                onChange={e => handleResolve(selectedName, { type: 'map', targetId: e.target.value })}
                                                style={{ background: '#222', color: '#fff', padding: '5px', width: '90%' }}
                                            >
                                                <option value="">Selecione...</option>
                                                {publishers
                                                    .slice()
                                                    .sort((a, b) => a.name.localeCompare(b.name)) // Sort alphabetically
                                                    .map(p => (
                                                        <option key={p.id} value={p.id}>{p.name}</option>
                                                    ))}
                                            </select>

                                            {currentResolution.targetId && (
                                                <div style={{ marginTop: '8px' }}>
                                                    <label style={{ fontSize: '0.9em', color: '#ddd', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px' }}>
                                                        <input
                                                            type="checkbox"
                                                            checked={!!currentResolution.updateExistingName}
                                                            onChange={e => handleResolve(selectedName, { ...currentResolution, updateExistingName: e.target.checked })}
                                                        />
                                                        Atualizar cadastro para usar nome: "<strong>{selectedName}</strong>"
                                                    </label>
                                                </div>
                                            )}
                                        </div>
                                    )}

                                    <label>
                                        <input
                                            type="radio"
                                            name="resType"
                                            checked={currentResolution?.type === 'create'}
                                            onChange={() => handleResolve(selectedName, { type: 'create', newPublisherData: { name: selectedName } })}
                                        />
                                        Criar Novo Publicador
                                    </label>
                                    {currentResolution?.type === 'create' && (
                                        <div style={{ marginLeft: '25px', display: 'flex', flexDirection: 'column', gap: '5px' }}>
                                            <input
                                                type="text"
                                                value={currentResolution.newPublisherData?.name || ''}
                                                onChange={e => handleResolve(selectedName, { ...currentResolution, newPublisherData: { ...currentResolution.newPublisherData, name: e.target.value } })}
                                                placeholder="Nome"
                                                style={{ background: '#222', color: '#fff', padding: '5px', width: '90%' }}
                                            />
                                            <select
                                                value={currentResolution.newPublisherData?.gender || 'brother'}
                                                onChange={e => handleResolve(selectedName, { ...currentResolution, newPublisherData: { ...currentResolution.newPublisherData, gender: e.target.value as any } })}
                                                style={{ background: '#222', color: '#fff', padding: '5px', width: '90%' }}
                                            >
                                                <option value="brother">Irmão</option>
                                                <option value="sister">Irmã</option>
                                            </select>
                                        </div>
                                    )}

                                    <label>
                                        <input
                                            type="radio"
                                            name="resType"
                                            checked={currentResolution?.type === 'ignore'}
                                            onChange={() => handleResolve(selectedName, { type: 'ignore' })}
                                        />
                                        Ignorar (Não importar)
                                    </label>
                                </div>
                            </div>
                        ) : (
                            <p>Selecione um nome à esquerda para resolver.</p>
                        )}
                    </div>
                </div>
            )}

            <div style={{ marginTop: '20px', display: 'flex', gap: '10px', alignItems: 'center', flexWrap: 'wrap', justifyContent: 'space-between' }}>
                <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
                    <button onClick={onCancel} style={{ padding: '10px 20px', background: '#444', border: 'none', color: '#fff', cursor: 'pointer', borderRadius: '6px' }}>Cancelar</button>

                    {currentStep > 1 && (
                        <button
                            onClick={() => setCurrentStep((currentStep - 1) as 1 | 2 | 3)}
                            style={{ padding: '10px 20px', background: '#555', border: 'none', color: '#fff', cursor: 'pointer', borderRadius: '6px' }}
                        >
                            ← Voltar
                        </button>
                    )}

                    <button
                        onClick={async () => {
                            setCleanupStatus('🔄 Limpando duplicatas...');
                            try {
                                const result = await api.deduplicateParticipations();
                                setCleanupStatus(`✅ ${result.removed} removidas, ${result.kept} mantidas`);
                            } catch (e) {
                                setCleanupStatus('❌ Erro');
                                console.error(e);
                            }
                        }}
                        style={{ padding: '10px 16px', background: '#dc3545', border: 'none', color: '#fff', cursor: 'pointer', borderRadius: '6px' }}
                    >
                        🧹 Limpar Duplicatas
                    </button>
                    {cleanupStatus && <span style={{ fontSize: '0.85em' }}>{cleanupStatus}</span>}
                </div>

                <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
                    {/* Step 1/2: Próximo button */}
                    {currentStep < 3 && (
                        <button
                            onClick={() => setCurrentStep((currentStep + 1) as 1 | 2 | 3)}
                            disabled={counts.pending > 0}
                            style={{
                                padding: '10px 24px',
                                background: counts.pending > 0 ? '#555' : '#3b82f6',
                                border: 'none',
                                color: '#fff',
                                cursor: counts.pending > 0 ? 'not-allowed' : 'pointer',
                                borderRadius: '6px',
                                fontWeight: 'bold'
                            }}
                            title={counts.pending > 0 ? `Resolva os ${counts.pending} itens pendentes` : 'Avançar para próxima etapa'}
                        >
                            Próximo →
                        </button>
                    )}

                    {/* Step 3: Import button */}
                    {currentStep === 3 && counts.resolved > 0 && (
                        <button
                            onClick={handleImport}
                            style={{ padding: '12px 32px', background: '#22c55e', border: 'none', color: '#fff', cursor: 'pointer', borderRadius: '6px', fontWeight: 'bold', fontSize: '1.1em' }}
                        >
                            ✅ Importar Dados ({counts.resolved} itens)
                        </button>
                    )}
                </div>
            </div>
        </div>
    );
}
