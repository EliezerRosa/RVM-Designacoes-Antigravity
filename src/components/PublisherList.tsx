import type { Publisher } from '../types'
import { useState } from 'react'

interface PublisherListProps {
    publishers: Publisher[]
    onEdit: (publisher: Publisher) => void
    onDelete: (publisher: Publisher) => void
}

export default function PublisherList({ publishers, onEdit, onDelete }: PublisherListProps) {
    const [searchTerm, setSearchTerm] = useState('')

    const filteredPublishers = publishers.filter(p =>
        p.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        p.condition.toLowerCase().includes(searchTerm.toLowerCase())
    )

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
            <div style={{ marginBottom: '20px' }}>
                <input
                    type="text"
                    placeholder="🔍 Buscar publicador..."
                    value={searchTerm}
                    onChange={e => setSearchTerm(e.target.value)}
                    style={{
                        width: '100%',
                        padding: '12px',
                        borderRadius: '8px',
                        border: '1px solid var(--border-color)',
                        background: 'var(--bg-secondary)',
                        color: 'var(--text-primary)',
                        fontSize: '1rem'
                    }}
                />
            </div>

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
