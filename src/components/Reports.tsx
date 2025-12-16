import { useState, useMemo } from 'react';
import type { Publisher, Participation } from '../types';
import { ParticipationType } from '../types';

interface ReportsProps {
    publishers: Publisher[];
    participations: Participation[];
}

// Helper to get display name for part type
const getPartTypeName = (type: ParticipationType): string => {
    const names: Record<ParticipationType, string> = {
        [ParticipationType.PRESIDENTE]: 'Presidente',
        [ParticipationType.ORACAO_INICIAL]: 'Oração Inicial',
        [ParticipationType.ORACAO_FINAL]: 'Oração Final',
        [ParticipationType.TESOUROS]: 'Tesouros da Palavra',
        [ParticipationType.MINISTERIO]: 'Faça Seu Melhor no Ministério',
        [ParticipationType.VIDA_CRISTA]: 'Nossa Vida Cristã',
        [ParticipationType.DIRIGENTE]: 'Dirigente (EBC)',
        [ParticipationType.LEITOR]: 'Leitor (EBC)',
        [ParticipationType.AJUDANTE]: 'Ajudante',
        [ParticipationType.CANTICO]: 'Cântico',
        [ParticipationType.COMENTARIOS_FINAIS]: 'Comentários Finais',
    };
    return names[type] || type;
};

export default function Reports({ publishers, participations }: ReportsProps) {
    // State for each section
    const [selectedPartType, setSelectedPartType] = useState<ParticipationType | 'all'>('all');
    const [selectedPublisher, setSelectedPublisher] = useState<string>('');
    const [publisherSearch, setPublisherSearch] = useState('');
    const [distributionFilter, setDistributionFilter] = useState<'all' | 'brother' | 'sister'>('all');
    const [distributionSort, setDistributionSort] = useState<'days' | 'count' | 'name'>('days');
    const [activeSection, setActiveSection] = useState<'type' | 'publisher' | 'distribution'>('type');

    // ===== SEÇÃO 1: Por Tipo de Parte =====
    const participationsByType = useMemo(() => {
        const byType: Record<string, { name: string; lastDate: string; count: number }[]> = {};

        participations.forEach(p => {
            const type = p.type;
            if (!byType[type]) byType[type] = [];

            const existing = byType[type].find(e => e.name === p.publisherName);
            if (existing) {
                existing.count++;
                if (p.date > existing.lastDate) existing.lastDate = p.date;
            } else {
                byType[type].push({ name: p.publisherName, lastDate: p.date || '', count: 1 });
            }
        });

        // Sort each type by lastDate descending
        Object.keys(byType).forEach(type => {
            byType[type].sort((a, b) => (b.lastDate || '').localeCompare(a.lastDate || ''));
        });

        return byType;
    }, [participations]);

    // ===== SEÇÃO 2: Perfil do Publicador =====
    const publisherProfile = useMemo(() => {
        if (!selectedPublisher) return null;

        const pubParticipations = participations.filter(p => p.publisherName === selectedPublisher);
        const byType: Record<string, number> = {};
        const timeline: { date: string; type: string; title: string }[] = [];

        pubParticipations.forEach(p => {
            byType[p.type] = (byType[p.type] || 0) + 1;
            timeline.push({ date: p.date, type: p.type, title: p.partTitle });
        });

        timeline.sort((a, b) => (b.date || '').localeCompare(a.date || ''));

        return {
            totalCount: pubParticipations.length,
            byType,
            timeline: timeline.slice(0, 10) // Last 10
        };
    }, [participations, selectedPublisher]);

    const filteredPublishers = useMemo(() => {
        return publishers.filter(p =>
            p.name.toLowerCase().includes(publisherSearch.toLowerCase())
        ).slice(0, 10);
    }, [publishers, publisherSearch]);

    // ===== SEÇÃO 3: Análise de Distribuição =====
    const distributionAnalysis = useMemo(() => {
        const now = new Date();
        const pubStats = publishers
            .filter(p => p.isServing)
            .filter(p => distributionFilter === 'all' || p.gender === distributionFilter)
            .map(pub => {
                const pubParticipations = participations.filter(p => p.publisherName === pub.name);
                const validDates = pubParticipations
                    .map(p => p.date)
                    .filter(d => d && !isNaN(new Date(d).getTime()));

                const lastDate = validDates.length > 0
                    ? validDates.sort((a, b) => b.localeCompare(a))[0]
                    : null;

                const daysSinceLast = lastDate
                    ? Math.floor((now.getTime() - new Date(lastDate).getTime()) / (1000 * 60 * 60 * 24))
                    : 999;

                return {
                    id: pub.id,
                    name: pub.name,
                    gender: pub.gender,
                    condition: pub.condition,
                    lastDate,
                    count: pubParticipations.length,
                    daysSinceLast
                };
            });

        // Sort
        switch (distributionSort) {
            case 'days':
                pubStats.sort((a, b) => b.daysSinceLast - a.daysSinceLast);
                break;
            case 'count':
                pubStats.sort((a, b) => a.count - b.count);
                break;
            case 'name':
                pubStats.sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'));
                break;
        }

        return pubStats;
    }, [publishers, participations, distributionFilter, distributionSort]);

    const formatDate = (dateStr: string | null): string => {
        if (!dateStr || isNaN(new Date(dateStr).getTime())) return '-';
        return new Date(dateStr).toLocaleDateString('pt-BR');
    };

    return (
        <div className="reports-page" style={{ padding: 'var(--spacing-lg)' }}>
            <h2 style={{ marginBottom: 'var(--spacing-xl)' }}>📊 Relatórios de Participações</h2>

            {/* Section Tabs */}
            <div style={{ display: 'flex', gap: '8px', marginBottom: 'var(--spacing-xl)' }}>
                <button
                    onClick={() => setActiveSection('type')}
                    style={{
                        padding: '12px 24px',
                        borderRadius: '8px',
                        border: 'none',
                        background: activeSection === 'type' ? 'var(--primary-500)' : 'var(--bg-secondary)',
                        color: activeSection === 'type' ? '#fff' : 'var(--text-primary)',
                        cursor: 'pointer',
                        fontWeight: activeSection === 'type' ? 'bold' : 'normal'
                    }}
                >
                    📋 Por Tipo de Parte
                </button>
                <button
                    onClick={() => setActiveSection('publisher')}
                    style={{
                        padding: '12px 24px',
                        borderRadius: '8px',
                        border: 'none',
                        background: activeSection === 'publisher' ? 'var(--primary-500)' : 'var(--bg-secondary)',
                        color: activeSection === 'publisher' ? '#fff' : 'var(--text-primary)',
                        cursor: 'pointer',
                        fontWeight: activeSection === 'publisher' ? 'bold' : 'normal'
                    }}
                >
                    👤 Perfil do Publicador
                </button>
                <button
                    onClick={() => setActiveSection('distribution')}
                    style={{
                        padding: '12px 24px',
                        borderRadius: '8px',
                        border: 'none',
                        background: activeSection === 'distribution' ? 'var(--primary-500)' : 'var(--bg-secondary)',
                        color: activeSection === 'distribution' ? '#fff' : 'var(--text-primary)',
                        cursor: 'pointer',
                        fontWeight: activeSection === 'distribution' ? 'bold' : 'normal'
                    }}
                >
                    📈 Análise de Distribuição
                </button>
            </div>

            {/* SEÇÃO 1: Por Tipo de Parte */}
            {activeSection === 'type' && (
                <div className="card" style={{ padding: 'var(--spacing-lg)' }}>
                    <div style={{ marginBottom: 'var(--spacing-lg)', display: 'flex', gap: '12px', alignItems: 'center' }}>
                        <label style={{ color: 'var(--text-muted)' }}>Tipo de Parte:</label>
                        <select
                            value={selectedPartType}
                            onChange={e => setSelectedPartType(e.target.value as ParticipationType | 'all')}
                            style={{
                                padding: '10px 16px',
                                borderRadius: '6px',
                                border: '1px solid var(--border-color)',
                                background: 'var(--bg-secondary)',
                                color: 'var(--text-primary)',
                                fontSize: '1rem',
                                minWidth: '250px'
                            }}
                        >
                            <option value="all">Todos os Tipos</option>
                            {Object.values(ParticipationType).map(type => (
                                <option key={type} value={type}>{getPartTypeName(type)}</option>
                            ))}
                        </select>
                    </div>

                    {selectedPartType === 'all' ? (
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: '16px' }}>
                            {Object.entries(participationsByType).map(([type, list]) => (
                                <div key={type} style={{ background: 'var(--bg-tertiary)', padding: '16px', borderRadius: '8px' }}>
                                    <h4 style={{ marginBottom: '12px', color: 'var(--primary-400)' }}>
                                        {getPartTypeName(type as ParticipationType)}
                                    </h4>
                                    <div style={{ fontSize: '0.9em' }}>
                                        {list.slice(0, 5).map((item, i) => (
                                            <div key={i} style={{ display: 'flex', justifyContent: 'space-between', padding: '4px 0', borderBottom: '1px solid var(--border-color)' }}>
                                                <span>{item.name}</span>
                                                <span style={{ color: 'var(--text-muted)' }}>{item.count}x</span>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            ))}
                        </div>
                    ) : (
                        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                            <thead>
                                <tr style={{ borderBottom: '2px solid var(--border-color)' }}>
                                    <th style={{ textAlign: 'left', padding: '12px 8px' }}>Publicador</th>
                                    <th style={{ textAlign: 'center', padding: '12px 8px' }}>Última Vez</th>
                                    <th style={{ textAlign: 'center', padding: '12px 8px' }}>Total</th>
                                </tr>
                            </thead>
                            <tbody>
                                {(participationsByType[selectedPartType] || []).map((item, i) => (
                                    <tr key={i} style={{ borderBottom: '1px solid var(--border-color)' }}>
                                        <td style={{ padding: '12px 8px' }}>{item.name}</td>
                                        <td style={{ textAlign: 'center', padding: '12px 8px', color: 'var(--text-muted)' }}>{formatDate(item.lastDate)}</td>
                                        <td style={{ textAlign: 'center', padding: '12px 8px' }}>
                                            <span style={{ background: 'var(--primary-500)', color: '#fff', padding: '4px 12px', borderRadius: '12px' }}>
                                                {item.count}x
                                            </span>
                                        </td>
                                    </tr>
                                ))}
                                {(participationsByType[selectedPartType] || []).length === 0 && (
                                    <tr>
                                        <td colSpan={3} style={{ padding: '24px', textAlign: 'center', color: 'var(--text-muted)' }}>
                                            Nenhuma participação encontrada para este tipo.
                                        </td>
                                    </tr>
                                )}
                            </tbody>
                        </table>
                    )}
                </div>
            )}

            {/* SEÇÃO 2: Perfil do Publicador */}
            {activeSection === 'publisher' && (
                <div className="card" style={{ padding: 'var(--spacing-lg)' }}>
                    <div style={{ marginBottom: 'var(--spacing-lg)', position: 'relative' }}>
                        <input
                            type="text"
                            placeholder="🔍 Buscar publicador..."
                            value={publisherSearch}
                            onChange={e => setPublisherSearch(e.target.value)}
                            style={{
                                width: '100%',
                                maxWidth: '400px',
                                padding: '12px 16px',
                                borderRadius: '8px',
                                border: '1px solid var(--border-color)',
                                background: 'var(--bg-secondary)',
                                color: 'var(--text-primary)',
                                fontSize: '1rem'
                            }}
                        />
                        {publisherSearch && filteredPublishers.length > 0 && (
                            <div style={{
                                position: 'absolute',
                                top: '100%',
                                left: 0,
                                right: 0,
                                maxWidth: '400px',
                                background: 'var(--bg-tertiary)',
                                border: '1px solid var(--border-color)',
                                borderRadius: '8px',
                                marginTop: '4px',
                                zIndex: 10
                            }}>
                                {filteredPublishers.map(p => (
                                    <div
                                        key={p.id}
                                        onClick={() => {
                                            setSelectedPublisher(p.name);
                                            setPublisherSearch('');
                                        }}
                                        style={{
                                            padding: '10px 16px',
                                            cursor: 'pointer',
                                            borderBottom: '1px solid var(--border-color)'
                                        }}
                                        onMouseOver={e => (e.currentTarget.style.background = 'var(--bg-secondary)')}
                                        onMouseOut={e => (e.currentTarget.style.background = 'transparent')}
                                    >
                                        {p.name}
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>

                    {selectedPublisher && publisherProfile ? (
                        <div>
                            <h3 style={{ marginBottom: 'var(--spacing-lg)', display: 'flex', alignItems: 'center', gap: '12px' }}>
                                <span style={{ fontSize: '1.5em' }}>👤</span>
                                {selectedPublisher}
                                <span style={{ fontSize: '0.8em', color: 'var(--text-muted)', fontWeight: 'normal' }}>
                                    ({publisherProfile.totalCount} participações)
                                </span>
                            </h3>

                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '24px' }}>
                                {/* Resumo por Tipo */}
                                <div style={{ background: 'var(--bg-tertiary)', padding: '16px', borderRadius: '8px' }}>
                                    <h4 style={{ marginBottom: '12px', color: 'var(--primary-400)' }}>Resumo por Tipo</h4>
                                    {Object.entries(publisherProfile.byType).map(([type, count]) => (
                                        <div key={type} style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', borderBottom: '1px solid var(--border-color)' }}>
                                            <span>{getPartTypeName(type as ParticipationType)}</span>
                                            <span style={{ background: 'var(--primary-500)', color: '#fff', padding: '2px 10px', borderRadius: '10px' }}>
                                                {count}x
                                            </span>
                                        </div>
                                    ))}
                                </div>

                                {/* Timeline */}
                                <div style={{ background: 'var(--bg-tertiary)', padding: '16px', borderRadius: '8px' }}>
                                    <h4 style={{ marginBottom: '12px', color: 'var(--success-400)' }}>Últimas Participações</h4>
                                    {publisherProfile.timeline.map((item, i) => (
                                        <div key={i} style={{ padding: '8px 0', borderBottom: '1px solid var(--border-color)', fontSize: '0.9em' }}>
                                            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                                                <span style={{ color: 'var(--text-muted)' }}>{formatDate(item.date)}</span>
                                                <span>{getPartTypeName(item.type as ParticipationType)}</span>
                                            </div>
                                            <div style={{ color: 'var(--text-secondary)', fontSize: '0.85em' }}>{item.title}</div>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        </div>
                    ) : (
                        <div style={{ textAlign: 'center', padding: '40px', color: 'var(--text-muted)' }}>
                            Busque e selecione um publicador para ver seu perfil de participações.
                        </div>
                    )}
                </div>
            )}

            {/* SEÇÃO 3: Análise de Distribuição */}
            {activeSection === 'distribution' && (
                <div className="card" style={{ padding: 'var(--spacing-lg)' }}>
                    <div style={{ display: 'flex', gap: '16px', marginBottom: 'var(--spacing-lg)', flexWrap: 'wrap' }}>
                        <div>
                            <label style={{ display: 'block', fontSize: '0.85em', color: 'var(--text-muted)', marginBottom: '4px' }}>Filtrar por:</label>
                            <select
                                value={distributionFilter}
                                onChange={e => setDistributionFilter(e.target.value as typeof distributionFilter)}
                                style={{
                                    padding: '10px 16px',
                                    borderRadius: '6px',
                                    border: '1px solid var(--border-color)',
                                    background: 'var(--bg-secondary)',
                                    color: 'var(--text-primary)'
                                }}
                            >
                                <option value="all">Todos</option>
                                <option value="brother">Irmãos</option>
                                <option value="sister">Irmãs</option>
                            </select>
                        </div>
                        <div>
                            <label style={{ display: 'block', fontSize: '0.85em', color: 'var(--text-muted)', marginBottom: '4px' }}>Ordenar por:</label>
                            <select
                                value={distributionSort}
                                onChange={e => setDistributionSort(e.target.value as typeof distributionSort)}
                                style={{
                                    padding: '10px 16px',
                                    borderRadius: '6px',
                                    border: '1px solid var(--border-color)',
                                    background: 'var(--bg-secondary)',
                                    color: 'var(--text-primary)'
                                }}
                            >
                                <option value="days">Mais tempo sem participar</option>
                                <option value="count">Menos participações</option>
                                <option value="name">Nome</option>
                            </select>
                        </div>
                    </div>

                    <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                        <thead>
                            <tr style={{ borderBottom: '2px solid var(--border-color)' }}>
                                <th style={{ textAlign: 'left', padding: '12px 8px' }}>Publicador</th>
                                <th style={{ textAlign: 'center', padding: '12px 8px' }}>Condição</th>
                                <th style={{ textAlign: 'center', padding: '12px 8px' }}>Última</th>
                                <th style={{ textAlign: 'center', padding: '12px 8px' }}>Total</th>
                                <th style={{ textAlign: 'center', padding: '12px 8px' }}>Dias sem participar</th>
                            </tr>
                        </thead>
                        <tbody>
                            {distributionAnalysis.map((pub) => (
                                <tr key={pub.id} style={{ borderBottom: '1px solid var(--border-color)' }}>
                                    <td style={{ padding: '12px 8px' }}>
                                        <span style={{ marginRight: '8px' }}>{pub.gender === 'brother' ? '👔' : '👗'}</span>
                                        {pub.name}
                                    </td>
                                    <td style={{ textAlign: 'center', padding: '12px 8px' }}>
                                        <span className={`badge ${pub.condition === 'Ancião' ? 'badge-elder' : pub.condition === 'Servo Ministerial' ? 'badge-ms' : ''}`}>
                                            {pub.condition}
                                        </span>
                                    </td>
                                    <td style={{ textAlign: 'center', padding: '12px 8px', color: 'var(--text-muted)' }}>
                                        {formatDate(pub.lastDate)}
                                    </td>
                                    <td style={{ textAlign: 'center', padding: '12px 8px' }}>
                                        <span style={{ background: 'var(--primary-500)', color: '#fff', padding: '4px 12px', borderRadius: '12px' }}>
                                            {pub.count}x
                                        </span>
                                    </td>
                                    <td style={{ textAlign: 'center', padding: '12px 8px' }}>
                                        <span style={{
                                            padding: '4px 12px',
                                            borderRadius: '12px',
                                            background: pub.daysSinceLast > 90 ? 'rgba(239, 68, 68, 0.2)' :
                                                pub.daysSinceLast > 60 ? 'rgba(245, 158, 11, 0.2)' :
                                                    'rgba(34, 197, 94, 0.2)',
                                            color: pub.daysSinceLast > 90 ? '#ef4444' :
                                                pub.daysSinceLast > 60 ? '#f59e0b' :
                                                    '#22c55e'
                                        }}>
                                            {pub.daysSinceLast === 999 ? 'Nunca' : `${pub.daysSinceLast} dias`}
                                        </span>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            )}
        </div>
    );
}
