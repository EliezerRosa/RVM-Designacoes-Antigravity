import type { Publisher } from '../types'
import { useState } from 'react'
import { usePersistedState } from '../hooks/usePersistedState'
import { matchesSearch as fuzzyMatchesSearch } from '../utils/searchUtils'

interface PublisherListProps {
    publishers: Publisher[]
    onEdit: (publisher: Publisher) => void
    onDelete: (publisher: Publisher) => void
}

type FilterCondition = 'all' | 'Ancião' | 'Servo Ministerial' | 'Publicador';
type FilterGender = 'all' | 'brother' | 'sister';
type FilterStatus = 'all' | 'active' | 'inactive';
type FilterFlag = 'all' | 'notQualified' | 'noParticipation' | 'normal';
type FilterHelper = 'all' | 'helperOnly' | 'fullParticipation';
type FilterAgeGroup = 'all' | 'Adulto' | 'Jovem' | 'Crianca';
type SortField = 'name' | 'condition' | 'gender' | 'ageGroup' | 'source';
type SortOrder = 'asc' | 'desc';

export default function PublisherList({ publishers, onEdit, onDelete }: PublisherListProps) {
    // State persistence with localStorage
    const [searchTerm, setSearchTerm] = usePersistedState('pl_searchTerm', '')
    const [filterCondition, setFilterCondition] = usePersistedState<FilterCondition>('pl_filterCondition', 'all')
    const [filterGender, setFilterGender] = usePersistedState<FilterGender>('pl_filterGender', 'all')
    const [filterStatus, setFilterStatus] = usePersistedState<FilterStatus>('pl_filterStatus', 'all')
    const [filterFlag, setFilterFlag] = usePersistedState<FilterFlag>('pl_filterFlag', 'all')
    const [filterHelper, setFilterHelper] = usePersistedState<FilterHelper>('pl_filterHelper', 'all')
    const [filterAgeGroup, setFilterAgeGroup] = usePersistedState<FilterAgeGroup>('pl_filterAgeGroup', 'all')
    const [sortBy, setSortBy] = usePersistedState<SortField>('pl_sortBy', 'name')
    const [sortOrder, setSortOrder] = usePersistedState<SortOrder>('pl_sortOrder', 'asc')
    const [showFilters, setShowFilters] = useState(false)

    const filteredPublishers = publishers.filter(p => {
        // Fuzzy/phonetic text search (ex: "eryc" matches "Erik", "Eric", "Eryck")
        const matchesSearch = searchTerm === '' ||
            fuzzyMatchesSearch(searchTerm, p.name) ||
            fuzzyMatchesSearch(searchTerm, p.condition);

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

        // Helper filter
        const matchesHelper = filterHelper === 'all' ||
            (filterHelper === 'helperOnly' && p.isHelperOnly) ||
            (filterHelper === 'fullParticipation' && !p.isHelperOnly);

        // Age group filter
        const matchesAgeGroup = filterAgeGroup === 'all' || p.ageGroup === filterAgeGroup;

        return matchesSearch && matchesCondition && matchesGender && matchesStatus && matchesFlag && matchesHelper && matchesAgeGroup;
    }).sort((a, b) => {
        let comparison = 0;
        switch (sortBy) {
            case 'name':
                comparison = a.name.localeCompare(b.name, 'pt-BR');
                break;
            case 'condition':
                comparison = a.condition.localeCompare(b.condition, 'pt-BR');
                break;
            case 'gender':
                comparison = a.gender.localeCompare(b.gender);
                break;
            case 'ageGroup':
                comparison = a.ageGroup.localeCompare(b.ageGroup, 'pt-BR');
                break;
            case 'source':
                comparison = (a.source || 'initial').localeCompare(b.source || 'initial');
                break;
        }
        return sortOrder === 'asc' ? comparison : -comparison;
    });

    const activeFiltersCount = [filterCondition, filterGender, filterStatus, filterFlag, filterHelper, filterAgeGroup]
        .filter(f => f !== 'all').length;

    const clearFilters = () => {
        setFilterCondition('all');
        setFilterGender('all');
        setFilterStatus('all');
        setFilterFlag('all');
        setFilterHelper('all');
        setFilterAgeGroup('all');
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

                        <div>
                            <label style={{ display: 'block', fontSize: '0.8rem', color: 'var(--text-muted)', marginBottom: '4px' }}>
                                Participação
                            </label>
                            <select
                                value={filterHelper}
                                onChange={e => setFilterHelper(e.target.value as FilterHelper)}
                                style={selectStyle}
                            >
                                <option value="all">Todos</option>
                                <option value="fullParticipation">🎤 Participação Completa</option>
                                <option value="helperOnly">🤝 Apenas Ajudante</option>
                            </select>
                        </div>

                        <div>
                            <label style={{ display: 'block', fontSize: '0.8rem', color: 'var(--text-muted)', marginBottom: '4px' }}>
                                Faixa Etária
                            </label>
                            <select
                                value={filterAgeGroup}
                                onChange={e => setFilterAgeGroup(e.target.value as FilterAgeGroup)}
                                style={selectStyle}
                            >
                                <option value="all">Todas</option>
                                <option value="Adulto">👨 Adulto</option>
                                <option value="Jovem">🧑 Jovem</option>
                                <option value="Crianca">👶 Criança</option>
                            </select>
                        </div>

                        {/* Sort Options */}
                        <div style={{ borderLeft: '1px solid var(--border-color)', paddingLeft: '16px' }}>
                            <label style={{ display: 'block', fontSize: '0.8rem', color: 'var(--text-muted)', marginBottom: '4px' }}>
                                📊 Ordenar por
                            </label>
                            <div style={{ display: 'flex', gap: '8px' }}>
                                <select
                                    value={sortBy}
                                    onChange={e => setSortBy(e.target.value as SortField)}
                                    style={selectStyle}
                                >
                                    <option value="name">Nome</option>
                                    <option value="condition">Condição</option>
                                    <option value="gender">Gênero</option>
                                    <option value="ageGroup">Faixa Etária</option>
                                    <option value="source">Origem</option>
                                </select>
                                <button
                                    onClick={() => setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc')}
                                    style={{
                                        padding: '8px 12px',
                                        borderRadius: '6px',
                                        border: '1px solid var(--border-color)',
                                        background: 'var(--bg-secondary)',
                                        color: 'var(--text-primary)',
                                        cursor: 'pointer',
                                        fontSize: '1rem'
                                    }}
                                    title={sortOrder === 'asc' ? 'Ordenação Crescente' : 'Ordenação Decrescente'}
                                >
                                    {sortOrder === 'asc' ? '⬆️' : '⬇️'}
                                </button>
                            </div>
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

                            {/* Status and Info Badges Container */}
                            <div style={{ marginTop: 'var(--spacing-sm)', display: 'flex', flexWrap: 'wrap', gap: '4px' }}>
                                {/* Age Group Badge */}
                                {publisher.ageGroup !== 'Adulto' && (
                                    <span style={{
                                        color: 'var(--primary-500)',
                                        background: 'rgba(59, 130, 246, 0.1)',
                                        padding: '2px 6px',
                                        borderRadius: '4px',
                                        fontSize: '0.75rem'
                                    }}>
                                        {publisher.ageGroup === 'Jovem' ? '🧑 Jovem' : '👶 Crianca'}
                                    </span>
                                )}

                                {/* Baptized */}
                                {publisher.isBaptized && (
                                    <span style={{
                                        color: 'var(--success-500)',
                                        background: 'rgba(34, 197, 94, 0.1)',
                                        padding: '2px 6px',
                                        borderRadius: '4px',
                                        fontSize: '0.75rem'
                                    }}>
                                        ✓ Batizado
                                    </span>
                                )}

                                {/* Inactive */}
                                {!publisher.isServing && (
                                    <span style={{
                                        color: 'var(--warning-500)',
                                        background: 'rgba(245, 158, 11, 0.1)',
                                        padding: '2px 6px',
                                        borderRadius: '4px',
                                        fontSize: '0.75rem'
                                    }}>
                                        ⏸️ Inativo
                                    </span>
                                )}

                                {/* Helper Only */}
                                {publisher.isHelperOnly && (
                                    <span style={{
                                        color: 'var(--info-500)',
                                        background: 'rgba(14, 165, 233, 0.1)',
                                        padding: '2px 6px',
                                        borderRadius: '4px',
                                        fontSize: '0.75rem'
                                    }}>
                                        🤝 Apenas Ajudante
                                    </span>
                                )}

                                {/* Can pair with non-parent */}
                                {publisher.ageGroup !== 'Adulto' && publisher.canPairWithNonParent && (
                                    <span style={{
                                        color: 'var(--success-500)',
                                        background: 'rgba(34, 197, 94, 0.1)',
                                        padding: '2px 6px',
                                        borderRadius: '4px',
                                        fontSize: '0.75rem'
                                    }} title="Liberado pelos pais para participar com outro par">
                                        👨‍👩‍👧 Liberado p/ Outros
                                    </span>
                                )}

                                {/* Not Qualified - with reason tooltip */}
                                {publisher.isNotQualified && (
                                    <span
                                        style={{
                                            color: 'var(--danger-500)',
                                            background: 'rgba(239, 68, 68, 0.1)',
                                            padding: '2px 6px',
                                            borderRadius: '4px',
                                            fontSize: '0.75rem',
                                            cursor: publisher.notQualifiedReason ? 'help' : 'default'
                                        }}
                                        title={publisher.notQualifiedReason || 'Publicador marcado como não apto para participar'}
                                    >
                                        ⚠️ Não Apto{publisher.notQualifiedReason ? '*' : ''}
                                    </span>
                                )}

                                {/* No Participation - with reason tooltip */}
                                {publisher.requestedNoParticipation && (
                                    <span
                                        style={{
                                            color: 'var(--warning-500)',
                                            background: 'rgba(245, 158, 11, 0.1)',
                                            padding: '2px 6px',
                                            borderRadius: '4px',
                                            fontSize: '0.75rem',
                                            cursor: publisher.noParticipationReason ? 'help' : 'default'
                                        }}
                                        title={publisher.noParticipationReason || 'Publicador pediu para não participar'}
                                    >
                                        🙅 Não Participa{publisher.noParticipationReason ? '*' : ''}
                                    </span>
                                )}

                                {/* Source Badge */}
                                {publisher.source && (
                                    <span style={{
                                        color: publisher.source === 'manual' ? '#22c55e' :
                                            publisher.source === 'import' ? '#a855f7' :
                                                publisher.source === 'sync' ? '#3b82f6' : '#6b7280',
                                        background: publisher.source === 'manual' ? 'rgba(34, 197, 94, 0.1)' :
                                            publisher.source === 'import' ? 'rgba(168, 85, 247, 0.1)' :
                                                publisher.source === 'sync' ? 'rgba(59, 130, 246, 0.1)' : 'rgba(107, 114, 128, 0.1)',
                                        padding: '2px 6px',
                                        borderRadius: '4px',
                                        fontSize: '0.75rem'
                                    }} title={`Origem: ${publisher.source}`}>
                                        {publisher.source === 'manual' ? '✍️ Manual' :
                                            publisher.source === 'import' ? '📥 Import' :
                                                publisher.source === 'sync' ? '🔄 Sync' : '📋 Inicial'}
                                    </span>
                                )}
                            </div>

                            {/* Parent info for young publishers */}
                            {publisher.parentIds && publisher.parentIds.length > 0 && (
                                <div style={{ marginTop: 'var(--spacing-xs)', fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                                    👨‍👩‍👧 Responsáveis: {publisher.parentIds.map(id => {
                                        const parent = publishers.find(p => p.id === id);
                                        return parent?.name || id;
                                    }).join(', ')}
                                </div>
                            )}
                        </div>



                        <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                            <strong>Privilégios:</strong>
                            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px', marginTop: '4px' }}>
                                {publisher.privileges.canPreside && (
                                    <span className="badge" style={{ background: 'rgba(147, 51, 234, 0.15)', color: '#9333ea' }} title="Pode presidir reuniões">
                                        👔 Presidir
                                    </span>
                                )}
                                {publisher.privileges.canPray && (
                                    <span className="badge" style={{ background: 'rgba(59, 130, 246, 0.15)', color: '#3b82f6' }} title="Pode fazer orações">
                                        🙏 Orar
                                    </span>
                                )}
                                {publisher.privileges.canGiveTalks && (
                                    <span className="badge" style={{ background: 'rgba(34, 197, 94, 0.15)', color: '#22c55e' }} title="Pode dar discursos de ensino">
                                        🎤 DISCURSO ENSINO
                                    </span>
                                )}
                                {publisher.privileges.canConductCBS && (
                                    <span className="badge" style={{ background: 'rgba(234, 179, 8, 0.15)', color: '#ca8a04' }} title="Pode dirigir Estudo Bíblico de Congregação">
                                        📖 Dirigir EBC
                                    </span>
                                )}
                                {publisher.privileges.canReadCBS && (
                                    <span className="badge" style={{ background: 'rgba(14, 165, 233, 0.15)', color: '#0ea5e9' }} title="Pode ler no Estudo Bíblico de Congregação">
                                        📗 Ler EBC
                                    </span>
                                )}

                                {publisher.privileges.canGiveStudentTalks && (
                                    <span className="badge" style={{ background: 'rgba(168, 85, 247, 0.15)', color: '#a855f7' }} title="Pode dar discursos de estudante">
                                        🎓 DISCURSO ESTUDANTE
                                    </span>
                                )}
                                {/* Show message if no privileges */}
                                {!publisher.privileges.canPreside &&
                                    !publisher.privileges.canPray &&
                                    !publisher.privileges.canGiveTalks &&
                                    !publisher.privileges.canConductCBS &&
                                    !publisher.privileges.canReadCBS && (
                                        <span style={{ color: 'var(--text-muted)', fontStyle: 'italic', fontSize: '0.75rem' }}>
                                            Nenhum privilégio especial
                                        </span>
                                    )}
                            </div>
                        </div>

                        {/* Section Permissions (Phase 3.2) */}
                        {publisher.privilegesBySection && (
                            <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginTop: 'var(--spacing-sm)' }}>
                                <strong>📍 Seções:</strong>
                                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px', marginTop: '4px' }}>
                                    <span
                                        style={{
                                            color: publisher.privilegesBySection.canParticipateInTreasures ? '#22c55e' : '#94a3b8',
                                            background: publisher.privilegesBySection.canParticipateInTreasures ? 'rgba(34, 197, 94, 0.1)' : 'rgba(148, 163, 184, 0.1)',
                                            padding: '2px 6px',
                                            borderRadius: '4px',
                                            fontSize: '0.75rem',
                                            textDecoration: publisher.privilegesBySection.canParticipateInTreasures ? 'none' : 'line-through'
                                        }}
                                        title={publisher.privilegesBySection.canParticipateInTreasures ? 'Pode participar' : 'Não pode participar'}
                                    >
                                        💎 Tesouros
                                    </span>
                                    <span
                                        style={{
                                            color: publisher.privilegesBySection.canParticipateInMinistry ? '#22c55e' : '#94a3b8',
                                            background: publisher.privilegesBySection.canParticipateInMinistry ? 'rgba(34, 197, 94, 0.1)' : 'rgba(148, 163, 184, 0.1)',
                                            padding: '2px 6px',
                                            borderRadius: '4px',
                                            fontSize: '0.75rem',
                                            textDecoration: publisher.privilegesBySection.canParticipateInMinistry ? 'none' : 'line-through'
                                        }}
                                        title={publisher.privilegesBySection.canParticipateInMinistry ? 'Pode participar' : 'Não pode participar'}
                                    >
                                        📚 Ministério
                                    </span>
                                    <span
                                        style={{
                                            color: publisher.privilegesBySection.canParticipateInLife ? '#22c55e' : '#94a3b8',
                                            background: publisher.privilegesBySection.canParticipateInLife ? 'rgba(34, 197, 94, 0.1)' : 'rgba(148, 163, 184, 0.1)',
                                            padding: '2px 6px',
                                            borderRadius: '4px',
                                            fontSize: '0.75rem',
                                            textDecoration: publisher.privilegesBySection.canParticipateInLife ? 'none' : 'line-through'
                                        }}
                                        title={publisher.privilegesBySection.canParticipateInLife ? 'Pode participar' : 'Não pode participar'}
                                    >
                                        💚 Vida Cristã
                                    </span>
                                </div>
                            </div>
                        )}

                        {/* Disponibilidade */}
                        {publisher.availability && publisher.availability.mode !== 'always' && (
                            <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginTop: 'var(--spacing-sm)' }}>
                                <strong>📅 Disponibilidade:</strong>
                                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px', marginTop: '4px' }}>
                                    {publisher.availability.mode === 'never' && (
                                        <span style={{
                                            color: '#f59e0b',
                                            background: 'rgba(245, 158, 11, 0.1)',
                                            padding: '2px 6px',
                                            borderRadius: '4px',
                                            fontSize: '0.75rem'
                                        }}>
                                            ⚠️ Apenas em datas específicas
                                        </span>
                                    )}
                                    {publisher.availability.availableDates && publisher.availability.availableDates.length > 0 && (
                                        <span style={{
                                            color: '#22c55e',
                                            background: 'rgba(34, 197, 94, 0.1)',
                                            padding: '2px 6px',
                                            borderRadius: '4px',
                                            fontSize: '0.75rem'
                                        }} title={publisher.availability.availableDates.join(', ')}>
                                            ✓ {publisher.availability.availableDates.length} datas livres
                                        </span>
                                    )}
                                </div>
                            </div>
                        )}

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
