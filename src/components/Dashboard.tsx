import type { Publisher, Participation } from '../types'
import { useMemo } from 'react'

interface DashboardProps {
    publishers: Publisher[]
    participations: Participation[]
}

export default function Dashboard({ publishers, participations }: DashboardProps) {
    // Calcular estatísticas
    const stats = useMemo(() => {
        const brothers = publishers.filter(p => p.gender === 'brother').length
        const sisters = publishers.filter(p => p.gender === 'sister').length
        const elders = publishers.filter(p => p.condition === 'Ancião').length
        const ministerialServants = publishers.filter(p => p.condition === 'Servo Ministerial').length

        // Calcular quem está mais tempo sem participar
        const publisherStats: Record<string, { count: number; lastDate: string | null }> = {}

        for (const p of participations) {
            if (!publisherStats[p.publisherName]) {
                publisherStats[p.publisherName] = { count: 0, lastDate: null }
            }
            publisherStats[p.publisherName].count++
            if (!publisherStats[p.publisherName].lastDate || p.date > publisherStats[p.publisherName].lastDate!) {
                publisherStats[p.publisherName].lastDate = p.date
            }
        }

        const recentParticipants = Object.entries(publisherStats)
            .sort((a, b) => (b[1].lastDate || '').localeCompare(a[1].lastDate || ''))
            .slice(0, 5)

        return {
            totalPublishers: publishers.length,
            brothers,
            sisters,
            elders,
            ministerialServants,
            totalParticipations: participations.length,
            recentParticipants
        }
    }, [publishers, participations])

    return (
        <div className="dashboard">
            <h2 style={{ marginBottom: 'var(--spacing-xl)' }}>Dashboard</h2>

            <div className="stats-grid">
                <div className="stat-card">
                    <div className="stat-icon">👥</div>
                    <div className="stat-info">
                        <h3>{stats.totalPublishers}</h3>
                        <p>Publicadores</p>
                    </div>
                </div>

                <div className="stat-card">
                    <div className="stat-icon">👔</div>
                    <div className="stat-info">
                        <h3>{stats.brothers}</h3>
                        <p>Irmãos</p>
                    </div>
                </div>

                <div className="stat-card">
                    <div className="stat-icon">👗</div>
                    <div className="stat-info">
                        <h3>{stats.sisters}</h3>
                        <p>Irmãs</p>
                    </div>
                </div>

                <div className="stat-card">
                    <div className="stat-icon">📝</div>
                    <div className="stat-info">
                        <h3>{stats.totalParticipations}</h3>
                        <p>Participações</p>
                    </div>
                </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--spacing-xl)' }}>
                <div className="card">
                    <h3 style={{ marginBottom: 'var(--spacing-lg)' }}>Composição da Congregação</h3>
                    <div>
                        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 'var(--spacing-md)' }}>
                            <span>Anciãos</span>
                            <span className="badge badge-elder">{stats.elders}</span>
                        </div>
                        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 'var(--spacing-md)' }}>
                            <span>Servos Ministeriais</span>
                            <span className="badge badge-ms">{stats.ministerialServants}</span>
                        </div>
                        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                            <span>Publicadores</span>
                            <span className="badge">{stats.totalPublishers - stats.elders - stats.ministerialServants}</span>
                        </div>
                    </div>
                </div>

                <div className="card">
                    <h3 style={{ marginBottom: 'var(--spacing-lg)' }}>Participações Recentes</h3>
                    {stats.recentParticipants.length === 0 ? (
                        <p style={{ color: 'var(--text-muted)' }}>Nenhuma participação registrada</p>
                    ) : (
                        <div>
                            {stats.recentParticipants.map(([name, data]) => (
                                <div
                                    key={name}
                                    style={{
                                        display: 'flex',
                                        justifyContent: 'space-between',
                                        padding: 'var(--spacing-sm) 0',
                                        borderBottom: '1px solid var(--border-color)'
                                    }}
                                >
                                    <span>{name}</span>
                                    <span style={{ color: 'var(--text-secondary)', fontSize: '0.85rem' }}>
                                        {data.count}x • {data.lastDate ? new Date(data.lastDate).toLocaleDateString('pt-BR') : '-'}
                                    </span>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            </div>
        </div>
    )
}
