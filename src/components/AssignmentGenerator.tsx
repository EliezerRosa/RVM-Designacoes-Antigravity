import { useState } from 'react'
import { ParticipationType } from '../types'
import type { Publisher, Participation, GeneratedAssignmentResponse, GenerateRequest } from '../types'
import { api } from '../services/api'
import { parsePdfFile } from '../services/pdfParser'
import type { ParsedWeek } from '../services/pdfParser'

interface AssignmentGeneratorProps {
    publishers: Publisher[]
    participations: Participation[]
    onSaveParticipation: (participation: Participation) => void
}

export default function AssignmentGenerator({ publishers, participations, onSaveParticipation }: AssignmentGeneratorProps) {
    // Stage 1: File Upload & Parsing
    const [parsedWeeks, setParsedWeeks] = useState<ParsedWeek[]>([])
    const [selectedWeekIndex, setSelectedWeekIndex] = useState<number>(-1)
    const [isParsing, setIsParsing] = useState(false)
    const [parseError, setParseError] = useState<string | null>(null)

    // Stage 2: Generation
    const [isGenerating, setIsGenerating] = useState(false)
    const [generatedResults, setGeneratedResults] = useState<GeneratedAssignmentResponse[]>([])

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
                // Filter out non-assignable parts from parsed data if necessary, 
                // but the parser already does a good job.
                // We need to map 'section' and 'title' to what backend expects.
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
            setGeneratedResults(results)

        } catch (e: any) {
            alert(`Erro ao gerar designações: ${e.message}`)
        } finally {
            setIsGenerating(false)
        }
    }

    const handleSave = () => {
        if (generatedResults.length === 0) return

        let savedCount = 0
        const weekDate = parsedWeeks[selectedWeekIndex]?.date || new Date().toISOString().split('T')[0]
        const weekLabel = parsedWeeks[selectedWeekIndex]?.label || weekDate

        generatedResults.forEach(result => {
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

    return (
        <div className="assignment-generator">
            <div className="page-header">
                <h2>Gerador Inteligente de Designações</h2>
                <div style={{ fontSize: '0.9em', color: 'var(--text-muted)' }}>
                    Motor v2.0 (Powered by Python Backend)
                </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '300px 1fr', gap: '24px' }}>

                {/* LEFT PANEL: CONFIGURATION */}
                <div className="assignment-panel">
                    <h3>1. Carregar Apostila</h3>

                    <div className="form-group">
                        <label>Arquivo S-140 (PDF)</label>
                        <input
                            type="file"
                            accept=".pdf"
                            onChange={handleFileUpload}
                            disabled={isParsing || isGenerating}
                            style={{ width: '100%' }}
                        />
                        {isParsing && <div style={{ marginTop: 8, color: 'var(--primary-400)' }}>Lendo arquivo...</div>}
                        {parseError && <div style={{ marginTop: 8, color: 'var(--danger-400)' }}>{parseError}</div>}
                    </div>

                    {parsedWeeks.length > 0 && (
                        <div className="form-group" style={{ marginTop: '20px' }}>
                            <label>Selecione a Semana</label>
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
                        {generatedResults.length > 0 &&
                            <span style={{ fontSize: '0.6em', color: 'var(--text-muted)', marginLeft: 8 }}>
                                ({generatedResults.length} partes geradas)
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
                            <p>Selecione uma semana e clique em Gerar</p>
                        </div>
                    ) : (
                        <div className="results-container">
                            <div style={{ marginBottom: '20px', display: 'flex', justifyContent: 'flex-end' }}>
                                <button className="btn-primary" onClick={handleSave}>
                                    💾 Salvar Tudo no Histórico
                                </button>
                            </div>

                            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                                {generatedResults.map((result, idx) => (
                                    <div key={idx} className="card" style={{ padding: '16px', display: 'grid', gridTemplateColumns: 'minmax(200px, 1fr) 2fr 1fr', gap: '16px', alignItems: 'center' }}>

                                        {/* Part Info */}
                                        <div>
                                            <div style={{ fontWeight: 'bold', color: 'var(--primary-400)' }}>
                                                {result.part_title}
                                            </div>
                                            <div style={{ fontSize: '0.8em', color: 'var(--text-muted)' }}>
                                                {result.part_type}
                                            </div>
                                        </div>

                                        {/* Assignment */}
                                        <div>
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

                                            {result.secondary_name && (
                                                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: '4px', paddingLeft: '24px' }}>
                                                    <span style={{ fontSize: '0.9em', color: 'var(--text-muted)' }}>+ Ajudante:</span>
                                                    <span>{result.secondary_name}</span>
                                                </div>
                                            )}

                                            <div style={{ marginTop: '4px', fontSize: '0.85em', color: 'var(--text-secondary)' }}>
                                                Only reason: {result.reason}
                                            </div>
                                        </div>

                                        {/* Status */}
                                        <div style={{ textAlign: 'right' }}>
                                            <span className={`badge ${result.status === 'APPROVED' ? 'badge-elder' : 'badge-ms'}`}>
                                                {result.status}
                                            </span>
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
