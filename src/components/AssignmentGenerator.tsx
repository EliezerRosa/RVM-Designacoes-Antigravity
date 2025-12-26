/**
 * AssignmentGenerator - Novo Workflow de Designações
 * 
 * Etapas:
 * 1. Upload Excel (formato HistoryRecord)
 * 2. Preview e seleção de partes
 * 3. Motor de elegibilidade
 * 4. Aprovação por anciãos
 * 5. Geração S-140/S-89
 * 6. Comunicação e aceite
 */
import { useState, useMemo } from 'react'
import type { Publisher, Participation, HistoryRecord } from '../types'
import { parseExcelFile } from '../services/excelParser'
import { checkEligibility } from '../services/eligibilityService'

interface AssignmentGeneratorProps {
    publishers: Publisher[]
    participations: Participation[]
    onSaveParticipation: (participation: Participation) => void
}

// Status de designação no workflow
type AssignmentStatus = 'DRAFT' | 'PENDING' | 'APPROVED' | 'REJECTED' | 'SENT' | 'ACCEPTED' | 'DECLINED'

// Parte com candidatos e status
interface AssignmentPart {
    id: string
    weekDisplay: string
    date: string
    section: string
    // 5 CAMPOS CANÔNICOS
    tipoParte: string
    modalidade: string
    tituloParte: string
    descricaoParte: string
    detalhesParte: string
    // Outros campos
    funcao: string
    duracao: number | null
    assignmentStatus: AssignmentStatus
    selectedPublisherId?: string
    selectedPublisherName?: string
    eligibleCandidates: EligibleCandidate[]
    rejectionReason?: string
}

interface EligibleCandidate {
    publisher: Publisher
    score: number
    reason: string
    isEligible: boolean
}

// Cores por seção
const getSectionColor = (section: string) => {
    if (section?.includes('Tesouros')) return { bg: 'rgba(139, 92, 246, 0.15)', color: '#a78bfa', border: '#8b5cf6' }
    if (section?.includes('Ministério')) return { bg: 'rgba(245, 158, 11, 0.15)', color: '#fbbf24', border: '#f59e0b' }
    if (section?.includes('Vida')) return { bg: 'rgba(34, 197, 94, 0.15)', color: '#4ade80', border: '#22c55e' }
    if (section?.includes('Final')) return { bg: 'rgba(239, 68, 68, 0.15)', color: '#f87171', border: '#ef4444' }
    return { bg: 'rgba(99, 102, 241, 0.15)', color: '#818cf8', border: '#6366f1' }
}

// Stepper component
const WorkflowStepper = ({ currentStep }: { currentStep: number }) => {
    const steps = [
        { num: 1, label: 'Upload', icon: '📤' },
        { num: 2, label: 'Elegíveis', icon: '👥' },
        { num: 3, label: 'Aprovar', icon: '✅' },
        { num: 4, label: 'Documentos', icon: '📄' },
        { num: 5, label: 'Comunicar', icon: '💬' }
    ]

    return (
        <div style={{
            display: 'flex',
            justifyContent: 'center',
            gap: '4px',
            marginBottom: '24px',
            padding: '16px',
            background: 'var(--bg-secondary)',
            borderRadius: '12px',
            flexWrap: 'wrap'
        }}>
            {steps.map((step, idx) => (
                <div key={step.num} style={{ display: 'flex', alignItems: 'center' }}>
                    <div style={{
                        display: 'flex',
                        flexDirection: 'column',
                        alignItems: 'center',
                        gap: '4px',
                        minWidth: '70px'
                    }}>
                        <div style={{
                            width: '40px',
                            height: '40px',
                            borderRadius: '50%',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            fontSize: '1.2em',
                            background: currentStep >= step.num
                                ? 'linear-gradient(135deg, var(--primary-500), var(--primary-600))'
                                : 'var(--bg-tertiary)',
                            boxShadow: currentStep === step.num ? '0 0 15px rgba(99, 102, 241, 0.5)' : 'none',
                            transition: 'all 0.3s ease'
                        }}>
                            {currentStep > step.num ? '✓' : step.icon}
                        </div>
                        <span style={{
                            fontSize: '0.75em',
                            color: currentStep >= step.num ? 'var(--text-primary)' : 'var(--text-muted)',
                            fontWeight: currentStep === step.num ? '600' : '400'
                        }}>
                            {step.label}
                        </span>
                    </div>
                    {idx < steps.length - 1 && (
                        <div style={{
                            width: '30px',
                            height: '2px',
                            background: currentStep > step.num ? 'var(--primary-500)' : 'var(--bg-tertiary)',
                            margin: '0 4px',
                            marginBottom: '20px'
                        }} />
                    )}
                </div>
            ))}
        </div>
    )
}

// Status badge
const StatusBadge = ({ status }: { status: AssignmentStatus }) => {
    const config: Record<AssignmentStatus, { bg: string; color: string; label: string }> = {
        DRAFT: { bg: 'rgba(156, 163, 175, 0.2)', color: '#9ca3af', label: '📝 Rascunho' },
        PENDING: { bg: 'rgba(245, 158, 11, 0.2)', color: '#f59e0b', label: '⏳ Pendente' },
        APPROVED: { bg: 'rgba(34, 197, 94, 0.2)', color: '#22c55e', label: '✅ Aprovado' },
        REJECTED: { bg: 'rgba(239, 68, 68, 0.2)', color: '#ef4444', label: '❌ Rejeitado' },
        SENT: { bg: 'rgba(59, 130, 246, 0.2)', color: '#3b82f6', label: '📤 Enviado' },
        ACCEPTED: { bg: 'rgba(16, 185, 129, 0.2)', color: '#10b981', label: '👍 Aceito' },
        DECLINED: { bg: 'rgba(244, 63, 94, 0.2)', color: '#f43f5e', label: '👎 Recusado' }
    }
    const { bg, color, label } = config[status]
    return (
        <span style={{
            padding: '4px 10px',
            borderRadius: '12px',
            background: bg,
            color,
            fontSize: '0.8em',
            fontWeight: '500'
        }}>
            {label}
        </span>
    )
}

// Convert HistoryRecord to AssignmentPart
function recordToPart(record: HistoryRecord): AssignmentPart {
    return {
        id: record.id,
        weekDisplay: record.weekDisplay,
        date: record.date,
        section: record.section,
        // 5 CAMPOS CANÔNICOS
        tipoParte: record.tipoParte,
        modalidade: record.modalidade,
        tituloParte: record.tituloParte,
        descricaoParte: record.descricaoParte,
        detalhesParte: record.detalhesParte,
        // Outros campos
        funcao: record.funcao,
        duracao: record.duracao || null,
        assignmentStatus: 'DRAFT',
        eligibleCandidates: []
    }
}

export default function AssignmentGenerator({ publishers, participations }: AssignmentGeneratorProps) {
    // State
    const [currentStep, setCurrentStep] = useState(1)
    const [isLoading, setIsLoading] = useState(false)
    const [error, setError] = useState<string | null>(null)
    const [parts, setParts] = useState<AssignmentPart[]>([])
    const [selectedWeek, setSelectedWeek] = useState<string | null>(null)

    // Computed: unique weeks
    const weeks = useMemo(() => {
        const uniqueWeeks = new Map<string, { display: string; date: string; count: number }>()
        parts.forEach(p => {
            const key = p.weekDisplay
            if (!uniqueWeeks.has(key)) {
                uniqueWeeks.set(key, { display: p.weekDisplay, date: p.date, count: 0 })
            }
            uniqueWeeks.get(key)!.count++
        })
        return Array.from(uniqueWeeks.values())
    }, [parts])

    // Computed: filtered parts by selected week
    const filteredParts = useMemo(() => {
        if (!selectedWeek) return parts
        return parts.filter(p => p.weekDisplay === selectedWeek)
    }, [parts, selectedWeek])

    // Stats
    const stats = useMemo(() => ({
        total: filteredParts.length,
        draft: filteredParts.filter(p => p.assignmentStatus === 'DRAFT').length,
        pending: filteredParts.filter(p => p.assignmentStatus === 'PENDING').length,
        approved: filteredParts.filter(p => p.assignmentStatus === 'APPROVED').length,
        rejected: filteredParts.filter(p => p.assignmentStatus === 'REJECTED').length,
    }), [filteredParts])

    // STEP 1: Upload Excel
    const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
        const file = event.target.files?.[0]
        if (!file) return

        setIsLoading(true)
        setError(null)

        try {
            const result = await parseExcelFile(file)
            if (result.success && result.records.length > 0) {
                // Convert to AssignmentPart
                const assignmentParts = result.records.map(record => recordToPart(record))
                setParts(assignmentParts)

                // Auto-select first week
                if (assignmentParts.length > 0) {
                    setSelectedWeek(assignmentParts[0].weekDisplay)
                }

                setCurrentStep(2)
            } else {
                setError(result.error || 'Erro ao processar arquivo')
            }
        } catch (e: unknown) {
            setError(e instanceof Error ? e.message : 'Erro desconhecido')
        } finally {
            setIsLoading(false)
        }
    }

    // STEP 2: Calculate eligibility for a part
    const calculateEligibility = (partIndex: number) => {
        const part = filteredParts[partIndex]
        if (!part) return

        const globalIndex = parts.findIndex(p => p.id === part.id)
        if (globalIndex === -1) return

        // Get eligible publishers
        const activePublishers = publishers.filter(p => p.isServing)
        const candidates: EligibleCandidate[] = []

        // Convert part to modality format
        const modalityMap: Record<string, string> = {
            'Leitura de Estudante': 'Leitura de Estudante',
            'Demonstração': 'Demonstração',
            'Discurso de Estudante': 'Discurso de Estudante',
            'Discurso de Ensino': 'Discurso de Ensino',
            'Oração': 'Oração',
            'Dirigente de EBC': 'Dirigente de EBC',
            'Leitor de EBC': 'Leitor de EBC',
            'Presidência': 'Presidência'
        }
        const modality = modalityMap[part.modalidade] || 'Discurso de Ensino'

        for (const pub of activePublishers) {
            // checkEligibility expects EnumModalidade values (e.g., 'Demonstração')
            const eligibility = checkEligibility(pub, modality as Parameters<typeof checkEligibility>[1], undefined, { date: part.date })

            // Calculate simple score based on participation history
            const lastParticipation = participations.find(p => p.publisherName === pub.name)
            const daysSinceLast = lastParticipation?.date
                ? Math.floor((new Date().getTime() - new Date(lastParticipation.date).getTime()) / (1000 * 60 * 60 * 24))
                : 365
            const score = eligibility.eligible ? Math.min(daysSinceLast, 100) : 0

            candidates.push({
                publisher: pub,
                score,
                reason: eligibility.reason || 'Elegível',
                isEligible: eligibility.eligible
            })
        }

        // Sort by score (descending), eligible first
        candidates.sort((a, b) => {
            if (a.isEligible !== b.isEligible) return a.isEligible ? -1 : 1
            return b.score - a.score
        })

        // Update part with candidates
        setParts(prev => prev.map((p, idx) =>
            idx === globalIndex ? { ...p, eligibleCandidates: candidates } : p
        ))
    }

    // STEP 2: Select publisher for a part
    const selectPublisher = (partIndex: number, publisherId: string, publisherName: string) => {
        const part = filteredParts[partIndex]
        if (!part) return

        const globalIndex = parts.findIndex(p => p.id === part.id)
        if (globalIndex === -1) return

        setParts(prev => prev.map((p, idx) =>
            idx === globalIndex ? {
                ...p,
                selectedPublisherId: publisherId,
                selectedPublisherName: publisherName,
                assignmentStatus: 'DRAFT' as AssignmentStatus
            } : p
        ))
    }

    // STEP 3: Submit for approval
    const submitForApproval = () => {
        setParts(prev => prev.map(p =>
            p.selectedPublisherId && p.assignmentStatus === 'DRAFT'
                ? { ...p, assignmentStatus: 'PENDING' as AssignmentStatus }
                : p
        ))
        setCurrentStep(3)
    }

    // STEP 3: Approve/Reject
    const approveDesignation = (partId: string) => {
        setParts(prev => prev.map(p =>
            p.id === partId ? { ...p, assignmentStatus: 'APPROVED' as AssignmentStatus } : p
        ))
    }

    const rejectDesignation = (partId: string, reason: string) => {
        setParts(prev => prev.map(p =>
            p.id === partId ? {
                ...p,
                assignmentStatus: 'REJECTED' as AssignmentStatus,
                rejectionReason: reason
            } : p
        ))
    }

    const approveAll = () => {
        setParts(prev => prev.map(p =>
            p.assignmentStatus === 'PENDING' ? { ...p, assignmentStatus: 'APPROVED' as AssignmentStatus } : p
        ))
    }

    // STEP 4: Generate S-140
    const generateS140 = () => {
        // TODO: Implement PDF generation
        alert('Funcionalidade S-140 será implementada em breve!')
        setCurrentStep(4)
    }

    return (
        <div style={{ maxWidth: '1400px', margin: '0 auto', padding: '20px' }}>
            {/* Header */}
            <div style={{ marginBottom: '24px' }}>
                <h2 style={{ margin: 0, fontSize: '1.5em' }}>📋 Gerador de Designações</h2>
                <p style={{ margin: '4px 0 0', color: 'var(--text-muted)', fontSize: '0.9em' }}>
                    Workflow completo: Upload → Elegíveis → Aprovar → Documentos → Comunicar
                </p>
            </div>

            {/* Stepper */}
            <WorkflowStepper currentStep={currentStep} />

            {/* Main Content */}
            <div className="card" style={{ padding: '24px' }}>

                {/* STEP 1: Upload */}
                {currentStep === 1 && (
                    <div>
                        <h3 style={{ marginTop: 0 }}>📤 Upload da Planilha</h3>
                        <p style={{ color: 'var(--text-muted)' }}>
                            Carregue uma planilha Excel (.xlsx) com as partes da reunião no formato HistoryRecord.
                        </p>

                        <div style={{
                            border: '2px dashed var(--border-color)',
                            borderRadius: '12px',
                            padding: '40px',
                            textAlign: 'center',
                            background: 'var(--bg-secondary)',
                            marginTop: '20px'
                        }}>
                            <input
                                type="file"
                                accept=".xlsx,.xls"
                                onChange={handleFileUpload}
                                disabled={isLoading}
                                style={{ display: 'none' }}
                                id="excel-upload"
                            />
                            <label
                                htmlFor="excel-upload"
                                style={{
                                    cursor: isLoading ? 'wait' : 'pointer',
                                    display: 'flex',
                                    flexDirection: 'column',
                                    alignItems: 'center',
                                    gap: '12px'
                                }}
                            >
                                <span style={{ fontSize: '3em' }}>📊</span>
                                <span style={{ fontWeight: '500', fontSize: '1.1em' }}>
                                    {isLoading ? 'Processando...' : 'Clique para selecionar arquivo Excel'}
                                </span>
                                <span style={{ fontSize: '0.85em', color: 'var(--text-muted)' }}>
                                    Formato: .xlsx com colunas do HistoryRecord
                                </span>
                            </label>
                        </div>

                        {error && (
                            <div style={{
                                marginTop: '16px',
                                padding: '12px 16px',
                                background: 'rgba(239, 68, 68, 0.1)',
                                border: '1px solid rgba(239, 68, 68, 0.3)',
                                borderRadius: '8px',
                                color: '#ef4444'
                            }}>
                                ❌ {error}
                            </div>
                        )}
                    </div>
                )}

                {/* STEP 2+: Parts list */}
                {currentStep >= 2 && parts.length > 0 && (
                    <div>
                        {/* Week selector */}
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px', flexWrap: 'wrap', gap: '12px' }}>
                            <div>
                                <h3 style={{ margin: 0 }}>👥 Selecionar Elegíveis</h3>
                                <p style={{ margin: '4px 0 0', color: 'var(--text-muted)', fontSize: '0.9em' }}>
                                    {stats.total} partes | {stats.draft} rascunho | {stats.pending} pendente | {stats.approved} aprovado
                                </p>
                            </div>

                            <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
                                <select
                                    value={selectedWeek || ''}
                                    onChange={(e) => setSelectedWeek(e.target.value)}
                                    style={{
                                        padding: '10px 14px',
                                        borderRadius: '8px',
                                        border: '1px solid var(--border-color)',
                                        background: 'var(--bg-secondary)',
                                        color: 'var(--text-primary)',
                                        fontSize: '0.95em'
                                    }}
                                >
                                    {weeks.map(w => (
                                        <option key={w.display} value={w.display}>
                                            📅 {w.display} ({w.count} partes)
                                        </option>
                                    ))}
                                </select>

                                {currentStep === 2 && stats.draft > 0 && filteredParts.some(p => p.selectedPublisherId) && (
                                    <button
                                        className="btn-primary"
                                        onClick={submitForApproval}
                                        style={{ padding: '10px 20px' }}
                                    >
                                        ✅ Submeter para Aprovação
                                    </button>
                                )}

                                {currentStep >= 3 && stats.pending > 0 && (
                                    <button
                                        className="btn-primary"
                                        onClick={approveAll}
                                        style={{ padding: '10px 20px' }}
                                    >
                                        ✅ Aprovar Todos
                                    </button>
                                )}

                                {stats.approved > 0 && (
                                    <button
                                        className="btn-primary"
                                        onClick={generateS140}
                                        style={{ padding: '10px 20px' }}
                                    >
                                        📄 Gerar S-140
                                    </button>
                                )}
                            </div>
                        </div>

                        {/* Parts list */}
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                            {filteredParts.map((part, idx) => {
                                const sectionStyle = getSectionColor(part.section)
                                return (
                                    <div
                                        key={part.id}
                                        style={{
                                            padding: '16px',
                                            borderRadius: '10px',
                                            background: sectionStyle.bg,
                                            border: `1px solid ${sectionStyle.border}`,
                                            display: 'grid',
                                            gridTemplateColumns: '1fr 200px 150px auto',
                                            gap: '16px',
                                            alignItems: 'center'
                                        }}
                                    >
                                        {/* Part info */}
                                        <div>
                                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
                                                <span style={{
                                                    padding: '2px 8px',
                                                    borderRadius: '4px',
                                                    background: sectionStyle.color,
                                                    color: 'white',
                                                    fontSize: '0.7em',
                                                    fontWeight: '600'
                                                }}>
                                                    {part.section?.split(' ')[0]}
                                                </span>
                                                <span style={{ fontWeight: '600' }}>{part.tituloParte}</span>
                                                {part.duracao && (
                                                    <span style={{ fontSize: '0.85em', color: 'var(--text-muted)' }}>
                                                        ({part.duracao} min)
                                                    </span>
                                                )}
                                            </div>
                                            <div style={{ fontSize: '0.85em', color: 'var(--text-muted)' }}>
                                                {part.funcao} • {part.modalidade}
                                            </div>
                                        </div>

                                        {/* Publisher selection */}
                                        <div>
                                            {part.selectedPublisherName ? (
                                                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                                    <span>👤</span>
                                                    <strong>{part.selectedPublisherName}</strong>
                                                </div>
                                            ) : (
                                                <select
                                                    onChange={(e) => {
                                                        const pub = publishers.find(p => p.id === e.target.value)
                                                        if (pub) selectPublisher(idx, pub.id, pub.name)
                                                    }}
                                                    onFocus={() => {
                                                        if (part.eligibleCandidates.length === 0) {
                                                            calculateEligibility(idx)
                                                        }
                                                    }}
                                                    style={{
                                                        width: '100%',
                                                        padding: '8px 12px',
                                                        borderRadius: '6px',
                                                        border: '1px solid var(--border-color)',
                                                        background: 'var(--bg-primary)',
                                                        color: 'var(--text-primary)',
                                                        fontSize: '0.9em'
                                                    }}
                                                >
                                                    <option value="">Selecionar...</option>
                                                    {part.eligibleCandidates.length > 0 ? (
                                                        part.eligibleCandidates.map(c => (
                                                            <option
                                                                key={c.publisher.id}
                                                                value={c.publisher.id}
                                                                disabled={!c.isEligible}
                                                            >
                                                                {c.isEligible ? '✓' : '✗'} {c.publisher.name} ({c.score}d)
                                                            </option>
                                                        ))
                                                    ) : (
                                                        publishers.filter(p => p.isServing).map(p => (
                                                            <option key={p.id} value={p.id}>{p.name}</option>
                                                        ))
                                                    )}
                                                </select>
                                            )}
                                        </div>

                                        {/* Status */}
                                        <StatusBadge status={part.assignmentStatus} />

                                        {/* Actions */}
                                        <div style={{ display: 'flex', gap: '6px' }}>
                                            {part.assignmentStatus === 'PENDING' && (
                                                <>
                                                    <button
                                                        onClick={() => approveDesignation(part.id)}
                                                        title="Aprovar"
                                                        style={{
                                                            background: 'var(--success-500)',
                                                            border: 'none',
                                                            borderRadius: '6px',
                                                            padding: '6px 10px',
                                                            cursor: 'pointer',
                                                            color: 'white'
                                                        }}
                                                    >
                                                        ✓
                                                    </button>
                                                    <button
                                                        onClick={() => {
                                                            const reason = prompt('Motivo da rejeição:')
                                                            if (reason) rejectDesignation(part.id, reason)
                                                        }}
                                                        title="Rejeitar"
                                                        style={{
                                                            background: 'var(--danger-500)',
                                                            border: 'none',
                                                            borderRadius: '6px',
                                                            padding: '6px 10px',
                                                            cursor: 'pointer',
                                                            color: 'white'
                                                        }}
                                                    >
                                                        ✗
                                                    </button>
                                                </>
                                            )}
                                            {part.assignmentStatus === 'DRAFT' && part.selectedPublisherName && (
                                                <button
                                                    onClick={() => selectPublisher(idx, '', '')}
                                                    title="Limpar seleção"
                                                    style={{
                                                        background: 'transparent',
                                                        border: '1px solid var(--border-color)',
                                                        borderRadius: '6px',
                                                        padding: '6px 10px',
                                                        cursor: 'pointer'
                                                    }}
                                                >
                                                    ↩️
                                                </button>
                                            )}
                                        </div>
                                    </div>
                                )
                            })}
                        </div>
                    </div>
                )}

                {/* Empty state */}
                {currentStep === 1 && parts.length === 0 && !isLoading && (
                    <div style={{
                        textAlign: 'center',
                        padding: '40px',
                        color: 'var(--text-muted)'
                    }}>
                        <div style={{ fontSize: '3em', marginBottom: '16px', opacity: 0.5 }}>📊</div>
                        <p>Carregue uma planilha Excel para começar</p>
                    </div>
                )}
            </div>
        </div>
    )
}
