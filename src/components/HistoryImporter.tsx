import { useState, useMemo } from 'react';
import type { Publisher, Participation } from '../types';
import { ParticipationType } from '../types';
import { importedHistory } from '../data/importedHistory';

interface Props {
    publishers: Publisher[];
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

export default function HistoryImporter({ publishers, onImport, onCancel }: Props) {
    const [resolutions, setResolutions] = useState<Record<string, Resolution>>({});
    const [selectedName, setSelectedName] = useState<string | null>(null);

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

    const handleResolve = (name: string, resolution: Resolution) => {
        setResolutions(prev => ({ ...prev, [name]: resolution }));
    };

    const getStatus = (name: string) => {
        if (resolutions[name]) return '✅';
        return '⚠️';
    };

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
                    availability: { mode: "always", exceptionDates: [] },
                    aliases: [name],
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
                        date: new Date().toISOString(), // Fallback
                        partTitle: p.part,
                        type: type,
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
            <h2>Importar Histórico e Resolver Nomes</h2>
            <div style={{ display: 'flex', gap: '20px', height: '600px' }}>
                {/* List */}
                <div style={{ width: '300px', overflowY: 'auto', borderRight: '1px solid #444' }}>
                    {unknownNames.map((item) => (
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
                            {getStatus(item.name)} {item.name} <span style={{ opacity: 0.6 }}>({item.count})</span>
                        </div>
                    ))}
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

            <div style={{ marginTop: '20px', display: 'flex', gap: '10px' }}>
                <button onClick={onCancel} style={{ padding: '10px 20px', background: '#444', border: 'none', color: '#fff', cursor: 'pointer' }}>Cancelar</button>
                <button onClick={handleImport} style={{ padding: '10px 20px', background: '#007bff', border: 'none', color: '#fff', cursor: 'pointer' }}>Importar Dados</button>
            </div>
        </div>
    );
}
