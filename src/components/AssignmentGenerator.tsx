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

// Result with editing capability
interface EditableResult extends GeneratedAssignmentResponse {
    isEditing?: boolean
    isRemoved?: boolean
}

export default function AssignmentGenerator({ publishers, participations, onSaveParticipation }: AssignmentGeneratorProps) {
    // Stage 1: File Upload & Parsing
    const [parsedWeeks, setParsedWeeks] = useState<ParsedWeek[]>([])
    const [selectedWeekIndex, setSelectedWeekIndex] = useState<number>(-1)
    const [isParsing, setIsParsing] = useState(false)
    const [parseError, setParseError] = useState<string | null>(null)

    // Stage 2: Preview (NEW)
    const [showPreview, setShowPreview] = useState(true)

    // Stage 3: Generation
    const [isGenerating, setIsGenerating] = useState(false)
    const [generatedResults, setGeneratedResults] = useState<EditableResult[]>([])

    // Computed: selected week data
    const selectedWeek = selectedWeekIndex >= 0 ? parsedWeeks[selectedWeekIndex] : null

    // Handlers
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
                setSelectedWeekIndex(0) // Select first week by default
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
            // Map parsed parts to request format
            const partsToFill = weekData.parts
                .map(p => {
                    // Simple heuristic to detect if needs helper
                    const needsHelper = p.title.toLowerCase().includes('iniciando') ||
                        p.title.toLowerCase().includes('cultivando') ||
                        p.title.toLowerCase().includes('fazendo') ||
                        p.title.toLowerCase().includes('explicando') ||
                        p.title.toLowerCase().includes('demonstração'); // fallback

                    // Map type based on section
                    let type: string = ParticipationType.MINISTERIO
                    if (p.section === 'Tesouros' || p.section === 'Tesouros da Palavra de Deus') type = ParticipationType.TESOUROS
                    if (p.section === 'Vida Cristã' || p.section === 'Nossa Vida Cristã') type = ParticipationType.VIDA_CRISTA

                    return {
                        title: p.title,
                        type: type,
                        needsHelper: needsHelper
                    }
                });

            const request: GenerateRequest = {
                week: weekData.date ? weekData.date.substring(0, 7) : '2025-W01',
                date: weekData.date || new Date().toISOString().split('T')[0],
                publishers: publishers.filter(p => p.isServing), // Only send active publishers
                participations: participations,
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

    // Edit a result's publisher
    const handleEditPublisher = (idx: number, newPublisherId: string) => {
        const publisher = publishers.find(p => p.id === newPublisherId)
        if (!publisher) return

        setGeneratedResults(prev => prev.map((r, i) =>
            i === idx ? {
                ...r,
                principal_name: publisher.name,
                principal_id: publisher.id,
                isEditing: false,
                reason: 'Alterado manualmente'
            } : r
        ))
    }

    // Toggle edit mode for a result
    const toggleEdit = (idx: number) => {
        setGeneratedResults(prev => prev.map((r, i) =>
            i === idx ? { ...r, isEditing: !r.isEditing } : r
        ))
    }

    // Remove a result from the list
    const removeResult = (idx: number) => {
        setGeneratedResults(prev => prev.map((r, i) =>
            i === idx ? { ...r, isRemoved: true } : r
        ))
    }

    // Restore a removed result
    const restoreResult = (idx: number) => {
        setGeneratedResults(prev => prev.map((r, i) =>
            i === idx ? { ...r, isRemoved: false } : r
        ))
    }

    const handleSave = () => {
        const activeResults = generatedResults.filter(r => !r.isRemoved)
        if (activeResults.length === 0) return

        let savedCount = 0
        const weekDate = parsedWeeks[selectedWeekIndex]?.date || new Date().toISOString().split('T')[0]
        const weekLabel = parsedWeeks[selectedWeekIndex]?.label || weekDate

        activeResults.forEach(result => {
            // Save Principal
            if (result.principal_id) {
                onSaveParticipation({
                    id: '',
                    publisherName: result.principal_name,
                    week: weekLabel, // Using label as week identifier for now to match old system
                    date: weekDate,
                    partTitle: result.part_title,
                    type: result.part_type as any
                })
                savedCount++
            }

            // Save Secondary (Assistant)
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
            setGeneratedResults([]) // Clear results to prevent double save
        }
    }

    // Part preview component
    const PartPreview = ({ part, index }: { part: ParsedPart; index: number }) => (
        <div
            style={{
                padding: '8px 12px',
                background: 'var(--bg-secondary)',
                borderRadius: '6px',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                fontSize: '0.9em'
            }}
        >
            <div>
                <span style={{ color: 'var(--text-muted)', marginRight: '8px' }}>#{index + 1}</span>
                <strong>{part.title}</strong>
            </div>
            <span style={{
                padding: '2px 8px',
                borderRadius: '4px',
                background: part.section?.includes('Tesouros') ? 'rgba(124,58,237,0.2)' :
                    part.section?.includes('Ministério') ? 'rgba(245,158,11,0.2)' :
                        'rgba(34,197,94,0.2)',
                color: part.section?.includes('Tesouros') ? '#a78bfa' :
                    part.section?.includes('Ministério') ? '#fbbf24' :
                        '#4ade80',
                fontSize: '0.8em'
            }}>
                {part.section?.replace('Faça Seu Melhor no ', '').replace('Nossa ', '')}
            </span>
        </div>
    )

    const activeResults = generatedResults.filter(r => !r.isRemoved)
    const removedCount = generatedResults.filter(r => r.isRemoved).length

    return (
        <div className="assignment-generator">
            <div className="page-header">
                <h2>Gerador Inteligente de Designações</h2>
                <div style={{ fontSize: '0.9em', color: 'var(--text-muted)' }}>
                    Motor v2.0 (Powered by Python Backend)
                </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '320px 1fr', gap: '24px' }}>

                {/* LEFT PANEL: CONFIGURATION */}
                <div className="assignment-panel">
                    <h3>1. Carregar Apostila</h3>

                    <div className="form-group">
                        <label>Apostila NWB (.pdf)</label>
                        <input
                            type="file"
                            accept=".pdf"
                            onChange={handleFileUpload}
                            disabled={isParsing || isGenerating}
                            style={{ width: '100%' }}
                        />
                        {isParsing && <div style={{ marginTop: 8, color: 'var(--primary-400)' }}>📖 Lendo apostila...</div>}
                        {parseError && <div style={{ marginTop: 8, color: 'var(--danger-400)' }}>{parseError}</div>}
                    </div>

                    {parsedWeeks.length > 0 && (
                        <div className="form-group" style={{ marginTop: '20px' }}>
                            <label>2. Selecione a Semana</label>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                                {parsedWeeks.map((week, idx) => (
                                    <button
                                        key={idx}
                                        onClick={() => setSelectedWeekIndex(idx)}
                                        className={selectedWeekIndex === idx ? 'btn-primary' : 'btn-secondary'}
                                        style={{ textAlign: 'left', justifyContent: 'flex-start' }}
                                    >
                                        📅 {week.label}
                                    </button>
                                ))}
                            </div>
                        </div>
                    )}

                    {/* PREVIEW SECTION (NEW) */}
                    {selectedWeek && selectedWeek.parts.length > 0 && (
                        <div className="form-group" style={{ marginTop: '20px' }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                                <label style={{ margin: 0 }}>3. Partes a Preencher ({selectedWeek.parts.length})</label>
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
                                    {showPreview ? '▼ Ocultar' : '▶ Mostrar'}
                                </button>
                            </div>
                            {showPreview && (
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', maxHeight: '200px', overflowY: 'auto' }}>
                                    {selectedWeek.parts.map((part, idx) => (
                                        <PartPreview key={idx} part={part} index={idx} />
                                    ))}
                                </div>
                            )}
                        </div>
                    )}

                    <div style={{ marginTop: 'auto', paddingTop: '20px' }}>
                        <button
                            className="btn-primary"
                            onClick={handleGenerate}
                            disabled={selectedWeekIndex < 0 || isGenerating}
                            style={{ width: '100%', padding: '16px', fontSize: '1.1em' }}
                        >
                            {isGenerating ? '🧠 Processando Regras...' : '✨ Gerar Designações'}
                        </button>
                    </div>
                </div>

                {/* RIGHT PANEL: RESULTS */}
                <div className="assignment-panel">
                    <h3>
                        Resultados
                        {activeResults.length > 0 &&
                            <span style={{ fontSize: '0.6em', color: 'var(--text-muted)', marginLeft: 8 }}>
                                ({activeResults.length} partes{removedCount > 0 ? `, ${removedCount} removidas` : ''})
                            </span>
                        }
                    </h3>

                    {generatedResults.length === 0 ? (
                        <div style={{
                            height: '300px',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            flexDirection: 'column',
                            color: 'var(--text-muted)',
                            border: '2px dashed var(--border-color)',
                            borderRadius: '8px'
                        }}>
                            <div style={{ fontSize: '3em', marginBottom: '16px' }}>🤖</div>
                            <p>Carregue uma apostila, selecione a semana e clique em Gerar</p>
                        </div>
                    ) : (
                        <div className="results-container">
                            <div style={{ marginBottom: '20px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                <span style={{ color: 'var(--text-muted)', fontSize: '0.9em' }}>
                                    💡 Clique no ✏️ para editar ou 🗑️ para remover
                                </span>
                                <button
                                    className="btn-primary"
                                    onClick={handleSave}
                                    disabled={activeResults.length === 0}
                                >
                                    💾 Salvar ({activeResults.length}) no Histórico
                                </button>
                            </div>

                            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                                {generatedResults.map((result, idx) => (
                                    <div
                                        key={idx}
                                        className="card"
                                        style={{
                                            padding: '16px',
                                            display: 'grid',
                                            gridTemplateColumns: 'minmax(180px, 1fr) 2fr auto',
                                            gap: '16px',
                                            alignItems: 'center',
                                            opacity: result.isRemoved ? 0.4 : 1,
                                            background: result.isRemoved ? 'var(--bg-tertiary)' : undefined
                                        }}
                                    >

                                        {/* Part Info */}
                                        <div>
                                            <div style={{ fontWeight: 'bold', color: 'var(--primary-400)' }}>
                                                {result.part_title}
                                            </div>
                                            <div style={{ fontSize: '0.8em', color: 'var(--text-muted)' }}>
                                                {result.part_type}
                                            </div>
                                        </div>

                                        {/* Assignment - with edit capability */}
                                        <div>
                                            {result.isEditing ? (
                                                <select
                                                    autoFocus
                                                    defaultValue={result.principal_id}
                                                    onChange={(e) => handleEditPublisher(idx, e.target.value)}
                                                    onBlur={() => toggleEdit(idx)}
                                                    style={{
                                                        padding: '8px 12px',
                                                        borderRadius: '6px',
                                                        border: '1px solid var(--primary-500)',
                                                        background: 'var(--bg-secondary)',
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
                                                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                                    <span style={{ fontSize: '1.2em' }}>👤</span>
                                                    <strong>{result.principal_name}</strong>
                                                    <span
                                                        className="badge"
                                                        title={result.reason}
                                                        style={{
                                                            fontSize: '0.7em',
                                                            cursor: 'help',
                                                            background: result.score > 500 ? 'var(--success-500)' : 'var(--warning-500)'
                                                        }}
                                                    >
                                                        Score: {Math.round(result.score)}
                                                    </span>
                                                </div>
                                            )}

                                            {result.secondary_name && (
                                                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: '4px', paddingLeft: '24px' }}>
                                                    <span style={{ fontSize: '0.9em', color: 'var(--text-muted)' }}>+ Ajudante:</span>
                                                    <span>{result.secondary_name}</span>
                                                </div>
                                            )}

                                            <div style={{ marginTop: '4px', fontSize: '0.85em', color: 'var(--text-secondary)' }}>
                                                {result.reason}
                                            </div>
                                        </div>

                                        {/* Actions */}
                                        <div style={{ display: 'flex', gap: '8px' }}>
                                            {result.isRemoved ? (
                                                <button
                                                    onClick={() => restoreResult(idx)}
                                                    title="Restaurar"
                                                    style={{
                                                        background: 'transparent',
                                                        border: '1px solid var(--border-color)',
                                                        borderRadius: '6px',
                                                        padding: '6px 10px',
                                                        cursor: 'pointer',
                                                        color: 'var(--success-400)'
                                                    }}
                                                >
                                                    ↩️
                                                </button>
                                            ) : (
                                                <>
                                                    <button
                                                        onClick={() => toggleEdit(idx)}
                                                        title="Editar publicador"
                                                        style={{
                                                            background: 'transparent',
                                                            border: '1px solid var(--border-color)',
                                                            borderRadius: '6px',
                                                            padding: '6px 10px',
                                                            cursor: 'pointer'
                                                        }}
                                                    >
                                                        ✏️
                                                    </button>
                                                    <button
                                                        onClick={() => removeResult(idx)}
                                                        title="Remover desta lista"
                                                        style={{
                                                            background: 'transparent',
                                                            border: '1px solid var(--border-color)',
                                                            borderRadius: '6px',
                                                            padding: '6px 10px',
                                                            cursor: 'pointer',
                                                            color: 'var(--danger-400)'
                                                        }}
                                                    >
                                                        🗑️
                                                    </button>
                                                </>
                                            )}
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}
                </div>
            </div>
        </div>
    )
}
