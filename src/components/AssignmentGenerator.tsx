import { useState, useMemo } from 'react'
import { ParticipationType } from '../types'
import type { Publisher, Participation, AiScheduleResult } from '../types'

interface AssignmentGeneratorProps {
    publishers: Publisher[]
    participations: Participation[]
    onSaveParticipation: (participation: Participation) => void
}

// Partes típicas da reunião
const MEETING_PARTS = [
    { title: 'Leitura da Bíblia', type: ParticipationType.TESOUROS, needsHelper: false },
    { title: 'Iniciando conversas', type: ParticipationType.MINISTERIO, needsHelper: true },
    { title: 'Cultivando o interesse', type: ParticipationType.MINISTERIO, needsHelper: true },
    { title: 'Fazendo discípulos', type: ParticipationType.MINISTERIO, needsHelper: true },
    { title: 'Explicando suas crenças', type: ParticipationType.MINISTERIO, needsHelper: true },
    { title: 'Discurso', type: ParticipationType.MINISTERIO, needsHelper: false },
]

export default function AssignmentGenerator({ publishers, participations, onSaveParticipation }: AssignmentGeneratorProps) {
    const [week, setWeek] = useState(() => {
        const today = new Date()
        return today.toISOString().split('T')[0]
    })
    const [results, setResults] = useState<AiScheduleResult[]>([])
    const [isGenerating, setIsGenerating] = useState(false)

    // Calcular estatísticas de cada publicador
    const publisherStats = useMemo(() => {
        const stats: Record<string, { count: number; lastDate: string | null }> = {}

        for (const publisher of publishers) {
            stats[publisher.name] = { count: 0, lastDate: null }
        }

        for (const p of participations) {
            if (!stats[p.publisherName]) {
                stats[p.publisherName] = { count: 0, lastDate: null }
            }
            stats[p.publisherName].count++
            if (!stats[p.publisherName].lastDate || p.date > stats[p.publisherName].lastDate!) {
                stats[p.publisherName].lastDate = p.date
            }
        }

        return stats
    }, [publishers, participations])

    // Gerar designações localmente
    const generateAssignments = () => {
        setIsGenerating(true)

        const assigned = new Set<string>()
        const newResults: AiScheduleResult[] = []

        for (const part of MEETING_PARTS) {
            // Filtrar candidatos elegíveis
            const eligible = publishers.filter(p => {
                if (assigned.has(p.name)) return false
                if (!p.isServing) return false

                // Verificar privilégios
                if (part.type === ParticipationType.TESOUROS && part.title.includes('Leitura')) {
                    if (p.gender !== 'brother') return false
                }
                if (part.title === 'Discurso') {
                    if (p.gender !== 'brother') return false
                    if (!p.privileges.canGiveTalks) return false
                }

                // Verificar privilégios por seção
                if (part.type === ParticipationType.TESOUROS && !p.privilegesBySection.canParticipateInTreasures) return false
                if (part.type === ParticipationType.MINISTERIO && !p.privilegesBySection.canParticipateInMinistry) return false

                // Verificar se é apenas ajudante
                if (p.isHelperOnly && !part.needsHelper) return false

                return true
            })

            if (eligible.length === 0) {
                newResults.push({
                    partTitle: part.title,
                    studentName: '[Sem candidato]',
                    helperName: null,
                    reason: 'Nenhum publicador elegível disponível'
                })
                continue
            }

            // Ordenar por quem está mais tempo sem participar
            eligible.sort((a, b) => {
                const statsA = publisherStats[a.name]
                const statsB = publisherStats[b.name]

                // Priorizar quem nunca participou
                if (!statsA.lastDate && statsB.lastDate) return -1
                if (statsA.lastDate && !statsB.lastDate) return 1
                if (!statsA.lastDate && !statsB.lastDate) return 0

                // Depois por data mais antiga
                return (statsA.lastDate || '').localeCompare(statsB.lastDate || '')
            })

            const chosen = eligible[0]
            assigned.add(chosen.name)

            // Encontrar ajudante se necessário
            let helperName: string | null = null
            if (part.needsHelper) {
                const helperCandidates = publishers.filter(p => {
                    if (assigned.has(p.name)) return false
                    if (!p.isServing) return false
                    return true
                })

                if (helperCandidates.length > 0) {
                    // Ordenar ajudantes também
                    helperCandidates.sort((a, b) => {
                        const statsA = publisherStats[a.name]
                        const statsB = publisherStats[b.name]
                        if (!statsA.lastDate && statsB.lastDate) return -1
                        if (statsA.lastDate && !statsB.lastDate) return 1
                        return (statsA.lastDate || '').localeCompare(statsB.lastDate || '')
                    })

                    helperName = helperCandidates[0].name
                    assigned.add(helperName)
                }
            }

            const stats = publisherStats[chosen.name]
            const daysSince = stats.lastDate
                ? Math.floor((Date.now() - new Date(stats.lastDate).getTime()) / (1000 * 60 * 60 * 24))
                : null

            newResults.push({
                partTitle: part.title,
                studentName: chosen.name,
                helperName,
                reason: daysSince !== null
                    ? `Última participação há ${daysSince} dias`
                    : 'Nunca participou nesta categoria'
            })
        }

        setResults(newResults)
        setIsGenerating(false)
    }

    // Salvar designações
    const saveAssignments = () => {
        for (const result of results) {
            if (result.studentName !== '[Sem candidato]') {
                onSaveParticipation({
                    id: '',
                    publisherName: result.studentName,
                    week,
                    date: week,
                    partTitle: result.partTitle,
                    type: ParticipationType.MINISTERIO
                })

                if (result.helperName) {
                    onSaveParticipation({
                        id: '',
                        publisherName: result.helperName,
                        week,
                        date: week,
                        partTitle: `${result.partTitle} (Ajudante)`,
                        type: ParticipationType.AJUDANTE
                    })
                }
            }
        }

        alert('Designações salvas com sucesso!')
        setResults([])
    }

    return (
        <div>
            <div className="page-header">
                <h2>Gerador de Designações</h2>
            </div>

            <div className="assignment-generator">
                <div className="assignment-panel">
                    <h3>Configurações</h3>

                    <div className="form-group">
                        <label>Semana</label>
                        <input
                            type="date"
                            value={week}
                            onChange={(e) => setWeek(e.target.value)}
                        />
                    </div>

                    <div style={{ marginTop: 'var(--spacing-lg)' }}>
                        <p style={{ color: 'var(--text-secondary)', marginBottom: 'var(--spacing-md)' }}>
                            <strong>{publishers.length}</strong> publicadores disponíveis
                        </p>

                        <button
                            className="btn-primary"
                            onClick={generateAssignments}
                            disabled={isGenerating || publishers.length === 0}
                            style={{ width: '100%' }}
                        >
                            {isGenerating ? 'Gerando...' : '✨ Gerar Designações com IA'}
                        </button>
                    </div>

                    {publishers.length === 0 && (
                        <p style={{ color: 'var(--warning-500)', marginTop: 'var(--spacing-md)', fontSize: '0.9rem' }}>
                            Cadastre publicadores antes de gerar designações
                        </p>
                    )}
                </div>

                <div className="assignment-panel">
                    <h3>Resultado</h3>

                    {results.length === 0 ? (
                        <p style={{ color: 'var(--text-muted)' }}>
                            Clique em "Gerar Designações" para ver o resultado
                        </p>
                    ) : (
                        <>
                            {results.map((result, index) => (
                                <div key={index} className="part-item">
                                    <div className="part-title">{result.partTitle}</div>
                                    <div className="part-assignee">
                                        {result.studentName}
                                        {result.helperName && ` + ${result.helperName}`}
                                    </div>
                                    <div className="part-reason">{result.reason}</div>
                                </div>
                            ))}

                            <button
                                className="btn-primary"
                                onClick={saveAssignments}
                                style={{ width: '100%', marginTop: 'var(--spacing-lg)' }}
                            >
                                💾 Salvar Designações
                            </button>
                        </>
                    )}
                </div>
            </div>
        </div>
    )
}
