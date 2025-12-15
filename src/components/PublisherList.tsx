import type { Publisher } from '../types'
import { useState } from 'react'

interface PublisherListProps {
    publishers: Publisher[]
    onEdit: (publisher: Publisher) => void
    onDelete: (publisher: Publisher) => void
}

type FilterCondition = 'all' | 'Ancião' | 'Servo Ministerial' | 'Publicador';
type FilterGender = 'all' | 'brother' | 'sister';
type FilterStatus = 'all' | 'active' | 'inactive';
type FilterFlag = 'all' | 'notQualified' | 'noParticipation' | 'normal';

export default function PublisherList({ publishers, onEdit, onDelete }: PublisherListProps) {
    const [searchTerm, setSearchTerm] = useState('')
    const [filterCondition, setFilterCondition] = useState<FilterCondition>('all')
    const [filterGender, setFilterGender] = useState<FilterGender>('all')
    const [filterStatus, setFilterStatus] = useState<FilterStatus>('all')
    const [filterFlag, setFilterFlag] = useState<FilterFlag>('all')
    const [showFilters, setShowFilters] = useState(false)

    const filteredPublishers = publishers.filter(p => {
        // Text search
        const matchesSearch = searchTerm === '' ||
            p.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
            p.condition.toLowerCase().includes(searchTerm.toLowerCase());

        // Condition filter
        const matchesCondition = filterCondition === 'all' || p.condition === filterCondition;

        // Gender filter
        const matchesGender = filterGender === 'all' || p.gender === filterGender;

        // Status filter
        const matchesStatus = filterStatus === 'all' ||
            (filterStatus === 'active' && p.isServing) ||
            (filterStatus === 'inactive' && !p.isServing);

        // Flag filter
        const matchesFlag = filterFlag === 'all' ||
            (filterFlag === 'notQualified' && p.isNotQualified) ||
            (filterFlag === 'noParticipation' && p.requestedNoParticipation) ||
            (filterFlag === 'normal' && !p.isNotQualified && !p.requestedNoParticipation);

        return matchesSearch && matchesCondition && matchesGender && matchesStatus && matchesFlag;
    });

    const activeFiltersCount = [filterCondition, filterGender, filterStatus, filterFlag]
        .filter(f => f !== 'all').length;

    const clearFilters = () => {
        setFilterCondition('all');
        setFilterGender('all');
        setFilterStatus('all');
        setFilterFlag('all');
        setSearchTerm('');
    };

    const selectStyle = {
        padding: '8px 12px',
        borderRadius: '6px',
        border: '1px solid var(--border-color)',
        background: 'var(--bg-secondary)',
        color: 'var(--text-primary)',
        fontSize: '0.9rem',
        minWidth: '140px',
    };

    if (publishers.length === 0) {
        return (
            <div className="card" style={{ textAlign: 'center', padding: 'var(--spacing-xl)' }}>
                <p style={{ color: 'var(--text-muted)', marginBottom: 'var(--spacing-md)' }}>
                    Nenhum publicador cadastrado
                </p>
                <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem' }}>
                    Clique em "Novo Publicador" para adicionar o primeiro
                </p>
            </div>
        )
    }

    return (
        <div>
            {/* Search and Filter Toggle */}
            <div style={{ display: 'flex', gap: '12px', marginBottom: '12px', alignItems: 'center' }}>
                <input
                    type="text"
                    placeholder="🔍 Buscar publicador..."
                    value={searchTerm}
                    onChange={e => setSearchTerm(e.target.value)}
                    style={{
                        flex: 1,
                        padding: '12px',
                        borderRadius: '8px',
                        border: '1px solid var(--border-color)',
                        background: 'var(--bg-secondary)',
                        color: 'var(--text-primary)',
                        fontSize: '1rem'
                    }}
                />
                <button
                    onClick={() => setShowFilters(!showFilters)}
                    style={{
                        padding: '12px 16px',
                        borderRadius: '8px',
                        border: showFilters ? '2px solid var(--primary-500)' : '1px solid var(--border-color)',
                        background: showFilters ? 'rgba(59, 130, 246, 0.1)' : 'var(--bg-secondary)',
                        color: showFilters ? 'var(--primary-500)' : 'var(--text-primary)',
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '6px',
                    }}
                >
                    🎛️ Filtros {activeFiltersCount > 0 && <span style={{
                        background: 'var(--primary-500)',
                        color: 'white',
                        borderRadius: '50%',
                        padding: '2px 8px',
                        fontSize: '0.8rem'
                    }}>{activeFiltersCount}</span>}
                </button>
            </div>

            {/* Filter Panel */}
            {showFilters && (
                <div style={{
                    padding: '16px',
                    marginBottom: '16px',
                    borderRadius: '8px',
                    background: 'var(--bg-secondary)',
                    border: '1px solid var(--border-color)'
                }}>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '16px', alignItems: 'flex-end' }}>
                        <div>
                            <label style={{ display: 'block', fontSize: '0.8rem', color: 'var(--text-muted)', marginBottom: '4px' }}>
                                Condição
                            </label>
                            <select
                                value={filterCondition}
                                onChange={e => setFilterCondition(e.target.value as FilterCondition)}
                                style={selectStyle}
                            >
                                <option value="all">Todas</option>
                                <option value="Ancião">👔 Ancião</option>
                                <option value="Servo Ministerial">📋 Servo Ministerial</option>
                                <option value="Publicador">👤 Publicador</option>
                            </select>
                        </div>

                        <div>
                            <label style={{ display: 'block', fontSize: '0.8rem', color: 'var(--text-muted)', marginBottom: '4px' }}>
                                Gênero
                            </label>
                            <select
                                value={filterGender}
                                onChange={e => setFilterGender(e.target.value as FilterGender)}
                                style={selectStyle}
                            >
                                <option value="all">Todos</option>
                                <option value="brother">👔 Irmãos</option>
                                <option value="sister">👗 Irmãs</option>
                            </select>
                        </div>

                        <div>
                            <label style={{ display: 'block', fontSize: '0.8rem', color: 'var(--text-muted)', marginBottom: '4px' }}>
                                Status
                            </label>
                            <select
                                value={filterStatus}
                                onChange={e => setFilterStatus(e.target.value as FilterStatus)}
                                style={selectStyle}
                            >
                                <option value="all">Todos</option>
                                <option value="active">✅ Ativos</option>
                                <option value="inactive">⏸️ Inativos</option>
                            </select>
                        </div>

                        <div>
                            <label style={{ display: 'block', fontSize: '0.8rem', color: 'var(--text-muted)', marginBottom: '4px' }}>
                                Situação Especial
                            </label>
                            <select
                                value={filterFlag}
                                onChange={e => setFilterFlag(e.target.value as FilterFlag)}
                                style={selectStyle}
                            >
                                <option value="all">Todas</option>
                                <option value="normal">✅ Normal</option>
                                <option value="notQualified">⚠️ Não Apto</option>
                                <option value="noParticipation">🙅 Não Participa</option>
                            </select>
                        </div>

                        {activeFiltersCount > 0 && (
                            <button
                                onClick={clearFilters}
                                style={{
                                    padding: '8px 12px',
                                    borderRadius: '6px',
                                    border: 'none',
                                    background: 'var(--danger-500)',
                                    color: 'white',
                                    cursor: 'pointer',
                                    fontSize: '0.9rem',
                                }}
                            >
                                ✖ Limpar Filtros
                            </button>
                        )}
                    </div>

                    <div style={{ marginTop: '12px', fontSize: '0.85rem', color: 'var(--text-muted)' }}>
                        Mostrando <strong>{filteredPublishers.length}</strong> de <strong>{publishers.length}</strong> publicadores
                    </div>
                </div>
            )}

            <div className="publisher-grid">
                {filteredPublishers.map(publisher => (
                    <div key={publisher.id} className="card publisher-card">
                        <div className="card-header">
                            <div>
                                <div className="publisher-name">{publisher.name}</div>
                                <div className="publisher-info">
                                    <span className={`badge ${publisher.gender === 'brother' ? 'badge-brother' : 'badge-sister'}`}>
                                        {publisher.gender === 'brother' ? 'Irmão' : 'Irmã'}
                                    </span>
                                    <span className={`badge ${publisher.condition === 'Ancião' ? 'badge-elder' :
                                        publisher.condition === 'Servo Ministerial' ? 'badge-ms' : ''
                                        }`}>
                                        {publisher.condition}
                                    </span>
                                </div>
                            </div>
                        </div>

                        <div style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginBottom: 'var(--spacing-md)' }}>
                            {publisher.phone && <div>📱 {publisher.phone}</div>}
                            <div style={{ marginTop: 'var(--spacing-xs)' }}>
                                {publisher.isBaptized && <span title="Batizado">✓ Batizado</span>}
                                {!publisher.isServing && <span style={{ color: 'var(--warning-500)', marginLeft: 'var(--spacing-sm)' }}>Inativo</span>}
                            </div>
                            {/* Status flags from EMR */}
                            {(publisher.isNotQualified || publisher.requestedNoParticipation) && (
                                <div style={{ marginTop: 'var(--spacing-xs)', display: 'flex', flexWrap: 'wrap', gap: '4px' }}>
                                    {publisher.isNotQualified && (
                                        <span style={{
                                            color: 'var(--warning-500)',
                                            background: 'rgba(245, 158, 11, 0.1)',
                                            padding: '2px 6px',
                                            borderRadius: '4px',
                                            fontSize: '0.75rem'
                                        }}>
                                            ⚠️ Não Apto
                                        </span>
                                    )}
                                    {publisher.requestedNoParticipation && (
                                        <span style={{
                                            color: 'var(--warning-500)',
                                            background: 'rgba(245, 158, 11, 0.1)',
                                            padding: '2px 6px',
                                            borderRadius: '4px',
                                            fontSize: '0.75rem'
                                        }}>
                                            🙅 Não Participa
                                        </span>
                                    )}
                                </div>
                            )}
                        </div>

                        <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                            <strong>Privilégios:</strong>
                            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px', marginTop: '4px' }}>
                                {publisher.privileges.canGiveTalks && <span className="badge">Discursos</span>}
                                {publisher.privileges.canPray && <span className="badge">Oração</span>}
                                {publisher.privileges.canConductCBS && <span className="badge">Dirigir EBC</span>}
                                {publisher.privileges.canReadCBS && <span className="badge">Ler EBC</span>}
                                {publisher.privileges.canPreside && <span className="badge">Presidir</span>}
                            </div>
                        </div>

                        <div className="publisher-actions">
                            <button className="btn-secondary" onClick={() => onEdit(publisher)}>
                                ✏️ Editar
                            </button>
                            <button className="btn-danger" onClick={() => onDelete(publisher)}>
                                🗑️ Remover
                            </button>
                        </div>
                    </div>
                ))}
            </div>
        </div>
    )
}
