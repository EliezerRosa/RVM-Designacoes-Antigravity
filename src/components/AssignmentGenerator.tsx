import { useState } from 'react'
import { ParticipationType } from '../types'
import type { Publisher, Participation, GeneratedAssignmentResponse, GenerateRequest } from '../types'
import { api } from '../services/api'
import { parsePdfFile } from '../services/pdfParser'
import type { ParsedWeek, ParsedPart } from '../services/pdfParser'

interface AssignmentGeneratorProps {
    publishers: Publisher[]
    participations: Participation[]
    onSaveParticipation: (participation: Participation) => void
}

interface EditableResult extends GeneratedAssignmentResponse {
    isEditing?: boolean
    isRemoved?: boolean
}

// Step indicator component
const Stepper = ({ currentStep }: { currentStep: number }) => {
    const steps = [
        { num: 1, label: 'Carregar' },
        { num: 2, label: 'Selecionar' },
        { num: 3, label: 'Gerar' }
    ]

    return (
        <div style={{
            display: 'flex',
            justifyContent: 'center',
            gap: '8px',
            marginBottom: '24px',
            padding: '16px',
            background: 'var(--bg-secondary)',
            borderRadius: '12px'
        }}>
            {steps.map((step, idx) => (
                <div key={step.num} style={{ display: 'flex', alignItems: 'center' }}>
                    <div style={{
                        display: 'flex',
                        flexDirection: 'column',
                        alignItems: 'center',
                        gap: '4px'
                    }}>
                        <div style={{
                            width: '36px',
                            height: '36px',
                            borderRadius: '50%',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            fontWeight: 'bold',
                            fontSize: '0.95em',
                            background: currentStep >= step.num
                                ? 'linear-gradient(135deg, var(--primary-500), var(--primary-600))'
                                : 'var(--bg-tertiary)',
                            color: currentStep >= step.num ? 'white' : 'var(--text-muted)',
                            border: currentStep === step.num ? '2px solid var(--primary-400)' : 'none',
                            boxShadow: currentStep === step.num ? '0 0 12px rgba(99, 102, 241, 0.4)' : 'none',
                            transition: 'all 0.3s ease'
                        }}>
                            {currentStep > step.num ? '✓' : step.num}
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
                            width: '40px',
                            height: '2px',
                            background: currentStep > step.num ? 'var(--primary-500)' : 'var(--bg-tertiary)',
                            margin: '0 8px',
                            marginBottom: '20px',
                            transition: 'background 0.3s ease'
                        }} />
                    )}
                </div>
            ))}
        </div>
    )
}

// Section badge colors
const getSectionStyle = (section: string | undefined) => {
    if (section?.includes('Tesouros')) {
        return { bg: 'rgba(139, 92, 246, 0.15)', color: '#a78bfa', border: 'rgba(139, 92, 246, 0.3)' }
    }
    if (section?.includes('Ministério')) {
        return { bg: 'rgba(245, 158, 11, 0.15)', color: '#fbbf24', border: 'rgba(245, 158, 11, 0.3)' }
    }
    return { bg: 'rgba(34, 197, 94, 0.15)', color: '#4ade80', border: 'rgba(34, 197, 94, 0.3)' }
}

export default function AssignmentGenerator({ publishers, participations, onSaveParticipation }: AssignmentGeneratorProps) {
    const [parsedWeeks, setParsedWeeks] = useState<ParsedWeek[]>([])
    const [selectedWeekIndex, setSelectedWeekIndex] = useState<number>(-1)
    const [isParsing, setIsParsing] = useState(false)
    const [parseError, setParseError] = useState<string | null>(null)
    const [showPreview, setShowPreview] = useState(true)
    const [isGenerating, setIsGenerating] = useState(false)
    const [generatedResults, setGeneratedResults] = useState<EditableResult[]>([])

    const selectedWeek = selectedWeekIndex >= 0 ? parsedWeeks[selectedWeekIndex] : null

    // Calculate current step
    const currentStep = generatedResults.length > 0 ? 3 : (selectedWeekIndex >= 0 ? 2 : (parsedWeeks.length > 0 ? 2 : 1))

    const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
        const file = event.target.files?.[0]
        if (!file) return

        setIsParsing(true)
        setParseError(null)
        setParsedWeeks([])
        setGeneratedResults([])

        try {
            const result = await parsePdfFile(file)
            if (result.success && result.weeks.length > 0) {
                setParsedWeeks(result.weeks)
                setSelectedWeekIndex(0)
            } else {
                setParseError(result.error || 'Nenhuma semana encontrada no arquivo.')
            }
        } catch (e: any) {
            setParseError(`Erro ao ler arquivo: ${e.message}`)
        } finally {
            setIsParsing(false)
        }
    }

    const handleGenerate = async () => {
        if (selectedWeekIndex < 0 || !parsedWeeks[selectedWeekIndex]) return

        setIsGenerating(true)
        setGeneratedResults([])
        const weekData = parsedWeeks[selectedWeekIndex]

        try {
            const partsToFill = weekData.parts.map(p => {
                const needsHelper = p.title.toLowerCase().includes('iniciando') ||
                    p.title.toLowerCase().includes('cultivando') ||
                    p.title.toLowerCase().includes('fazendo') ||
                    p.title.toLowerCase().includes('explicando') ||
                    p.title.toLowerCase().includes('demonstração')

                let type: string = ParticipationType.MINISTERIO
                if (p.section === 'Tesouros' || p.section === 'Tesouros da Palavra de Deus') type = ParticipationType.TESOUROS
                if (p.section === 'Vida Cristã' || p.section === 'Nossa Vida Cristã') type = ParticipationType.VIDA_CRISTA

                return { title: p.title, type, needsHelper }
            })

            const request: GenerateRequest = {
                week: weekData.date ? weekData.date.substring(0, 7) : '2025-W01',
                date: weekData.date || new Date().toISOString().split('T')[0],
                publishers: publishers.filter(p => p.isServing),
                participations,
                parts: partsToFill
            }

            const results = await api.generateAssignments(request)
            setGeneratedResults(results.map(r => ({ ...r, isEditing: false, isRemoved: false })))
        } catch (e: any) {
            alert(`Erro ao gerar designações: ${e.message}`)
        } finally {
            setIsGenerating(false)
        }
    }

    const handleEditPublisher = (idx: number, newPublisherId: string) => {
        const publisher = publishers.find(p => p.id === newPublisherId)
        if (!publisher) return
        setGeneratedResults(prev => prev.map((r, i) =>
            i === idx ? { ...r, principal_name: publisher.name, principal_id: publisher.id, isEditing: false, reason: 'Alterado manualmente' } : r
        ))
    }

    const toggleEdit = (idx: number) => {
        setGeneratedResults(prev => prev.map((r, i) => i === idx ? { ...r, isEditing: !r.isEditing } : r))
    }

    const removeResult = (idx: number) => {
        setGeneratedResults(prev => prev.map((r, i) => i === idx ? { ...r, isRemoved: true } : r))
    }

    const restoreResult = (idx: number) => {
        setGeneratedResults(prev => prev.map((r, i) => i === idx ? { ...r, isRemoved: false } : r))
    }

    const handleSave = () => {
        const activeResults = generatedResults.filter(r => !r.isRemoved)
        if (activeResults.length === 0) return

        let savedCount = 0
        const weekDate = parsedWeeks[selectedWeekIndex]?.date || new Date().toISOString().split('T')[0]
        const weekLabel = parsedWeeks[selectedWeekIndex]?.label || weekDate

        activeResults.forEach(result => {
            if (result.principal_id) {
                onSaveParticipation({
                    id: '',
                    publisherName: result.principal_name,
                    week: weekLabel,
                    date: weekDate,
                    partTitle: result.part_title,
                    type: result.part_type as any
                })
                savedCount++
            }
            if (result.secondary_id) {
                onSaveParticipation({
                    id: '',
                    publisherName: result.secondary_name!,
                    week: weekLabel,
                    date: weekDate,
                    partTitle: `${result.part_title} (Ajudante)`,
                    type: ParticipationType.AJUDANTE
                })
                savedCount++
            }
        })

        if (savedCount > 0) {
            alert(`${savedCount} designações salvas com sucesso!`)
            setGeneratedResults([])
        }
    }

    const PartPreview = ({ part, index }: { part: ParsedPart; index: number }) => {
        const style = getSectionStyle(part.section)
        return (
            <div style={{
                padding: '10px 14px',
                background: style.bg,
                borderRadius: '8px',
                borderLeft: `3px solid ${style.color}`,
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                fontSize: '0.9em'
            }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                    <span style={{
                        color: style.color,
                        fontWeight: 'bold',
                        fontSize: '0.85em',
                        opacity: 0.7
                    }}>
                        {index + 1}
                    </span>
                    <span style={{ fontWeight: '500' }}>{part.title}</span>
                </div>
                {part.student && (
                    <span style={{ color: 'var(--text-muted)', fontSize: '0.85em' }}>
                        👤 {part.student}
                    </span>
                )}
            </div>
        )
    }

    const activeResults = generatedResults.filter(r => !r.isRemoved)
    const removedCount = generatedResults.filter(r => r.isRemoved).length

    return (
        <div className="assignment-generator" style={{ maxWidth: '1200px', margin: '0 auto' }}>
            {/* Header */}
            <div style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                marginBottom: '20px',
                flexWrap: 'wrap',
                gap: '16px'
            }}>
                <div>
                    <h2 style={{ margin: 0, fontSize: '1.5em' }}>✨ Gerador de Designações</h2>
                    <p style={{ margin: '4px 0 0', color: 'var(--text-muted)', fontSize: '0.9em' }}>
                        Preencha automaticamente as partes da reunião
                    </p>
                </div>
                {generatedResults.length > 0 && (
                    <button
                        className="btn-primary"
                        onClick={handleSave}
                        disabled={activeResults.length === 0}
                        style={{ padding: '12px 24px', fontSize: '1em' }}
                    >
                        💾 Salvar {activeResults.length} Designações
                    </button>
                )}
            </div>

            {/* Stepper */}
            <Stepper currentStep={currentStep} />

            {/* Main Content - Responsive Grid */}
            <div style={{
                display: 'grid',
                gridTemplateColumns: generatedResults.length > 0 ? '1fr' : 'minmax(280px, 400px) 1fr',
                gap: '24px'
            }}>

                {/* Left Panel: Configuration (hide when showing results) */}
                {generatedResults.length === 0 && (
                    <div className="card" style={{ padding: '24px' }}>
                        {/* Step 1: Upload */}
                        <div style={{ marginBottom: '24px' }}>
                            <h4 style={{ margin: '0 0 12px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                                <span style={{
                                    width: '24px',
                                    height: '24px',
                                    borderRadius: '50%',
                                    background: 'var(--primary-500)',
                                    color: 'white',
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    fontSize: '0.75em'
                                }}>1</span>
                                Carregar Apostila
                            </h4>
                            <div style={{
                                border: '2px dashed var(--border-color)',
                                borderRadius: '10px',
                                padding: '20px',
                                textAlign: 'center',
                                background: 'var(--bg-secondary)',
                                transition: 'all 0.2s'
                            }}>
                                <input
                                    type="file"
                                    accept=".pdf"
                                    onChange={handleFileUpload}
                                    disabled={isParsing || isGenerating}
                                    style={{ display: 'none' }}
                                    id="pdf-upload"
                                />
                                <label
                                    htmlFor="pdf-upload"
                                    style={{
                                        cursor: isParsing ? 'wait' : 'pointer',
                                        display: 'flex',
                                        flexDirection: 'column',
                                        alignItems: 'center',
                                        gap: '8px'
                                    }}
                                >
                                    <span style={{ fontSize: '2em' }}>📄</span>
                                    <span style={{ fontWeight: '500' }}>
                                        {isParsing ? 'Lendo apostila...' : 'Clique para selecionar PDF'}
                                    </span>
                                    <span style={{ fontSize: '0.85em', color: 'var(--text-muted)' }}>
                                        Apostila NWB (Nossa Vida e Ministério)
                                    </span>
                                </label>
                            </div>
                            {parseError && (
                                <div style={{
                                    marginTop: '12px',
                                    padding: '10px 14px',
                                    background: 'rgba(239, 68, 68, 0.1)',
                                    border: '1px solid rgba(239, 68, 68, 0.3)',
                                    borderRadius: '8px',
                                    color: '#ef4444',
                                    fontSize: '0.9em'
                                }}>
                                    ❌ {parseError}
                                </div>
                            )}
                        </div>

                        {/* Step 2: Select Week */}
                        {parsedWeeks.length > 0 && (
                            <div style={{ marginBottom: '24px' }}>
                                <h4 style={{ margin: '0 0 12px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                                    <span style={{
                                        width: '24px',
                                        height: '24px',
                                        borderRadius: '50%',
                                        background: 'var(--primary-500)',
                                        color: 'white',
                                        display: 'flex',
                                        alignItems: 'center',
                                        justifyContent: 'center',
                                        fontSize: '0.75em'
                                    }}>2</span>
                                    Selecionar Semana
                                </h4>
                                <select
                                    value={selectedWeekIndex}
                                    onChange={(e) => setSelectedWeekIndex(Number(e.target.value))}
                                    style={{
                                        width: '100%',
                                        padding: '12px 16px',
                                        borderRadius: '8px',
                                        border: '1px solid var(--border-color)',
                                        background: 'var(--bg-secondary)',
                                        color: 'var(--text-primary)',
                                        fontSize: '1em',
                                        cursor: 'pointer'
                                    }}
                                >
                                    {parsedWeeks.map((week, idx) => (
                                        <option key={idx} value={idx}>
                                            📅 {week.label} ({week.parts.length} partes)
                                        </option>
                                    ))}
                                </select>
                            </div>
                        )}

                        {/* Generate Button */}
                        {selectedWeek && (
                            <button
                                className="btn-primary"
                                onClick={handleGenerate}
                                disabled={selectedWeekIndex < 0 || isGenerating}
                                style={{
                                    width: '100%',
                                    padding: '16px',
                                    fontSize: '1.1em',
                                    borderRadius: '10px',
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    gap: '10px'
                                }}
                            >
                                {isGenerating ? (
                                    <>🧠 Processando...</>
                                ) : (
                                    <>✨ Gerar Designações</>
                                )}
                            </button>
                        )}
                    </div>
                )}

                {/* Right Panel: Preview or Results */}
                <div className="card" style={{ padding: '24px' }}>
                    {generatedResults.length === 0 ? (
                        <>
                            {/* Preview */}
                            {selectedWeek && selectedWeek.parts.length > 0 ? (
                                <>
                                    <div style={{
                                        display: 'flex',
                                        justifyContent: 'space-between',
                                        alignItems: 'center',
                                        marginBottom: '16px'
                                    }}>
                                        <h4 style={{ margin: 0 }}>
                                            📋 Partes a Preencher ({selectedWeek.parts.length})
                                        </h4>
                                        <button
                                            onClick={() => setShowPreview(!showPreview)}
                                            style={{
                                                background: 'transparent',
                                                border: 'none',
                                                color: 'var(--primary-400)',
                                                cursor: 'pointer',
                                                fontSize: '0.85em'
                                            }}
                                        >
                                            {showPreview ? '▲ Recolher' : '▼ Expandir'}
                                        </button>
                                    </div>
                                    {showPreview && (
                                        <div style={{
                                            display: 'flex',
                                            flexDirection: 'column',
                                            gap: '8px',
                                            maxHeight: '400px',
                                            overflowY: 'auto'
                                        }}>
                                            {selectedWeek.parts.map((part, idx) => (
                                                <PartPreview key={idx} part={part} index={idx} />
                                            ))}
                                        </div>
                                    )}
                                </>
                            ) : (
                                <div style={{
                                    height: '300px',
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    flexDirection: 'column',
                                    color: 'var(--text-muted)',
                                    textAlign: 'center'
                                }}>
                                    <div style={{ fontSize: '4em', marginBottom: '16px', opacity: 0.5 }}>📑</div>
                                    <p style={{ margin: 0, fontSize: '1.1em' }}>
                                        Carregue uma apostila para ver as partes
                                    </p>
                                    <p style={{ margin: '8px 0 0', fontSize: '0.9em', opacity: 0.7 }}>
                                        As partes da reunião aparecerão aqui
                                    </p>
                                </div>
                            )}
                        </>
                    ) : (
                        <>
                            {/* Results */}
                            <div style={{
                                display: 'flex',
                                justifyContent: 'space-between',
                                alignItems: 'center',
                                marginBottom: '20px',
                                flexWrap: 'wrap',
                                gap: '12px'
                            }}>
                                <div>
                                    <h4 style={{ margin: 0 }}>
                                        🎯 Designações Geradas
                                    </h4>
                                    <p style={{ margin: '4px 0 0', fontSize: '0.85em', color: 'var(--text-muted)' }}>
                                        {activeResults.length} ativas{removedCount > 0 && `, ${removedCount} removidas`}
                                    </p>
                                </div>
                                <button
                                    onClick={() => setGeneratedResults([])}
                                    style={{
                                        background: 'transparent',
                                        border: '1px solid var(--border-color)',
                                        borderRadius: '8px',
                                        padding: '8px 16px',
                                        cursor: 'pointer',
                                        color: 'var(--text-muted)',
                                        fontSize: '0.9em'
                                    }}
                                >
                                    ← Voltar
                                </button>
                            </div>

                            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                                {generatedResults.map((result, idx) => {
                                    const style = getSectionStyle(result.part_type)
                                    return (
                                        <div
                                            key={idx}
                                            style={{
                                                padding: '14px 18px',
                                                borderRadius: '10px',
                                                background: result.isRemoved ? 'var(--bg-tertiary)' : style.bg,
                                                border: `1px solid ${result.isRemoved ? 'var(--border-color)' : style.border}`,
                                                opacity: result.isRemoved ? 0.5 : 1,
                                                display: 'grid',
                                                gridTemplateColumns: '1fr auto',
                                                gap: '16px',
                                                alignItems: 'center',
                                                transition: 'all 0.2s'
                                            }}
                                        >
                                            <div>
                                                <div style={{
                                                    display: 'flex',
                                                    alignItems: 'center',
                                                    gap: '8px',
                                                    marginBottom: '4px'
                                                }}>
                                                    <span style={{
                                                        padding: '2px 8px',
                                                        borderRadius: '4px',
                                                        background: style.color,
                                                        color: 'white',
                                                        fontSize: '0.7em',
                                                        fontWeight: '600'
                                                    }}>
                                                        {result.part_type?.replace('Tesouros da Palavra de Deus', 'Tesouros')
                                                            .replace('Faça Seu Melhor no Ministério', 'Ministério')
                                                            .replace('Nossa Vida Cristã', 'Vida Cristã')}
                                                    </span>
                                                    <span style={{ fontWeight: '600', fontSize: '0.95em' }}>
                                                        {result.part_title}
                                                    </span>
                                                </div>

                                                {result.isEditing ? (
                                                    <select
                                                        autoFocus
                                                        defaultValue={result.principal_id}
                                                        onChange={(e) => handleEditPublisher(idx, e.target.value)}
                                                        onBlur={() => toggleEdit(idx)}
                                                        style={{
                                                            padding: '8px 12px',
                                                            borderRadius: '6px',
                                                            border: '2px solid var(--primary-500)',
                                                            background: 'var(--bg-primary)',
                                                            color: 'var(--text-primary)',
                                                            width: '100%',
                                                            fontSize: '0.95em'
                                                        }}
                                                    >
                                                        <option value="">Selecione...</option>
                                                        {publishers.filter(p => p.isServing).map(p => (
                                                            <option key={p.id} value={p.id}>{p.name}</option>
                                                        ))}
                                                    </select>
                                                ) : (
                                                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                                                        <span style={{ fontSize: '1.1em' }}>👤</span>
                                                        <span style={{ fontWeight: '500' }}>{result.principal_name}</span>
                                                        {result.secondary_name && (
                                                            <span style={{ color: 'var(--text-muted)', fontSize: '0.9em' }}>
                                                                + {result.secondary_name}
                                                            </span>
                                                        )}
                                                    </div>
                                                )}
                                            </div>

                                            <div style={{ display: 'flex', gap: '6px' }}>
                                                {result.isRemoved ? (
                                                    <button
                                                        onClick={() => restoreResult(idx)}
                                                        title="Restaurar"
                                                        style={{
                                                            background: 'var(--success-500)',
                                                            border: 'none',
                                                            borderRadius: '6px',
                                                            padding: '8px 12px',
                                                            cursor: 'pointer',
                                                            color: 'white'
                                                        }}
                                                    >
                                                        ↩️
                                                    </button>
                                                ) : (
                                                    <>
                                                        <button
                                                            onClick={() => toggleEdit(idx)}
                                                            title="Editar"
                                                            style={{
                                                                background: 'var(--bg-secondary)',
                                                                border: '1px solid var(--border-color)',
                                                                borderRadius: '6px',
                                                                padding: '8px 12px',
                                                                cursor: 'pointer'
                                                            }}
                                                        >
                                                            ✏️
                                                        </button>
                                                        <button
                                                            onClick={() => removeResult(idx)}
                                                            title="Remover"
                                                            style={{
                                                                background: 'rgba(239, 68, 68, 0.1)',
                                                                border: '1px solid rgba(239, 68, 68, 0.3)',
                                                                borderRadius: '6px',
                                                                padding: '8px 12px',
                                                                cursor: 'pointer',
                                                                color: '#ef4444'
                                                            }}
                                                        >
                                                            🗑️
                                                        </button>
                                                    </>
                                                )}
                                            </div>
                                        </div>
                                    )
                                })}
                            </div>
                        </>
                    )}
                </div>
            </div>
        </div>
    )
}
