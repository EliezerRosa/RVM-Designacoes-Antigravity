/**
 * SpecialEventManager - Gerenciador de Eventos Especiais
 * Permite adicionar/remover eventos que impactam semanas da apostila
 */

import { useState, useEffect, useCallback } from 'react';
import { specialEventService, EVENT_TEMPLATES } from '../services/specialEventService';
import type { SpecialEvent, Publisher } from '../types';
import { getStatusConfig } from '../constants/status';

interface Props {
    weekId: string;
    weekDisplay: string;
    publishers?: Publisher[];
    onEventChange?: () => void; // Callback para atualizar lista de partes
}

export function SpecialEventManager({ weekId, weekDisplay, publishers = [], onEventChange }: Props) {
    const [events, setEvents] = useState<SpecialEvent[]>([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [showModal, setShowModal] = useState(false);

    // Form state
    const [selectedTemplateId, setSelectedTemplateId] = useState<string>('');
    const [theme, setTheme] = useState('');
    const [assignedTo, setAssignedTo] = useState('');
    const [duration, setDuration] = useState(15);

    // Load events for this week
    const loadEvents = useCallback(async () => {
        try {
            setLoading(true);
            const data = await specialEventService.getEventsByWeek(weekId);
            setEvents(data);
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Erro ao carregar eventos');
        } finally {
            setLoading(false);
        }
    }, [weekId]);

    useEffect(() => {
        loadEvents();
    }, [loadEvents]);

    // Get selected template
    const selectedTemplate = EVENT_TEMPLATES.find(t => t.id === selectedTemplateId);

    // Handle template change
    const handleTemplateChange = (templateId: string) => {
        setSelectedTemplateId(templateId);
        const template = EVENT_TEMPLATES.find(t => t.id === templateId);
        if (template) {
            setDuration(template.defaults.duration);
            setTheme(template.defaults.theme || '');
        }
    };

    // Create event
    const handleCreate = async () => {
        if (!selectedTemplateId) return;

        try {
            setLoading(true);
            await specialEventService.createEvent({
                week: weekId,
                templateId: selectedTemplateId,
                theme,
                assignedTo,
                duration,
                configuration: {},
            });
            setShowModal(false);
            resetForm();
            await loadEvents();
            onEventChange?.();
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Erro ao criar evento');
        } finally {
            setLoading(false);
        }
    };

    // Delete event
    const handleDelete = async (id: string) => {
        if (!confirm('Remover este evento especial?')) return;

        try {
            setLoading(true);
            await specialEventService.deleteEvent(id);
            await loadEvents();
            onEventChange?.();
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Erro ao remover evento');
        } finally {
            setLoading(false);
        }
    };

    const resetForm = () => {
        setSelectedTemplateId('');
        setTheme('');
        setAssignedTo('');
        setDuration(15);
    };

    const canceladaConfig = getStatusConfig('CANCELADA');

    return (
        <div style={{ marginBottom: '20px' }}>
            {/* Header */}
            <div style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                marginBottom: '10px',
            }}>
                <h4 style={{ margin: 0, color: '#9ca3af', fontSize: '0.9em' }}>
                    ⚡ Eventos Especiais
                </h4>
                <button
                    onClick={() => setShowModal(true)}
                    style={{
                        background: '#7c3aed',
                        color: '#fff',
                        border: 'none',
                        padding: '6px 12px',
                        borderRadius: '6px',
                        cursor: 'pointer',
                        fontSize: '0.85em',
                    }}
                >
                    + Adicionar Evento
                </button>
            </div>

            {/* Error */}
            {error && (
                <div style={{
                    background: '#fef2f2',
                    color: '#b91c1c',
                    padding: '8px',
                    borderRadius: '6px',
                    marginBottom: '10px',
                    fontSize: '0.85em',
                }}>
                    {error}
                </div>
            )}

            {/* Loading */}
            {loading && <div style={{ color: '#9ca3af', fontSize: '0.85em' }}>Carregando...</div>}

            {/* Events List */}
            {events.length === 0 && !loading && (
                <div style={{ color: '#6b7280', fontSize: '0.85em', fontStyle: 'italic' }}>
                    Nenhum evento especial nesta semana.
                </div>
            )}

            {events.map(event => {
                const template = EVENT_TEMPLATES.find(t => t.id === event.templateId);
                return (
                    <div
                        key={event.id}
                        style={{
                            background: canceladaConfig.bg,
                            border: `1px solid ${canceladaConfig.border}`,
                            borderRadius: '8px',
                            padding: '12px',
                            marginBottom: '8px',
                            display: 'flex',
                            justifyContent: 'space-between',
                            alignItems: 'center',
                        }}
                    >
                        <div>
                            <div style={{ fontWeight: 'bold', color: '#374151' }}>
                                {canceladaConfig.icon} {template?.name || event.templateId}
                            </div>
                            {event.theme && (
                                <div style={{ fontSize: '0.85em', color: '#6b7280' }}>
                                    Tema: {event.theme}
                                </div>
                            )}
                            {event.assignedTo && (
                                <div style={{ fontSize: '0.85em', color: '#6b7280' }}>
                                    Responsável: {event.assignedTo}
                                </div>
                            )}
                            <div style={{ fontSize: '0.75em', color: '#9ca3af' }}>
                                {event.duration} min · Impacto: {template?.impact.action}
                            </div>
                        </div>
                        <button
                            onClick={() => handleDelete(event.id)}
                            style={{
                                background: '#ef4444',
                                color: '#fff',
                                border: 'none',
                                padding: '4px 8px',
                                borderRadius: '4px',
                                cursor: 'pointer',
                                fontSize: '0.8em',
                            }}
                        >
                            🗑️
                        </button>
                    </div>
                );
            })}

            {/* Modal */}
            {showModal && (
                <div style={{
                    position: 'fixed',
                    top: 0, left: 0, right: 0, bottom: 0,
                    background: 'rgba(0,0,0,0.7)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    zIndex: 1000,
                }}>
                    <div style={{
                        background: '#1f2937',
                        borderRadius: '12px',
                        padding: '25px',
                        width: '450px',
                        maxWidth: '90vw',
                        color: '#fff',
                    }}>
                        <h3 style={{ margin: '0 0 15px' }}>➕ Adicionar Evento Especial</h3>
                        <p style={{ color: '#9ca3af', marginBottom: '15px', fontSize: '0.9em' }}>
                            Semana: {weekDisplay}
                        </p>

                        {/* Template Select */}
                        <div style={{ marginBottom: '15px' }}>
                            <label style={{ display: 'block', marginBottom: '5px', fontSize: '0.9em' }}>
                                Tipo de Evento:
                            </label>
                            <select
                                value={selectedTemplateId}
                                onChange={e => handleTemplateChange(e.target.value)}
                                style={{
                                    width: '100%',
                                    padding: '10px',
                                    borderRadius: '6px',
                                    border: '1px solid #374151',
                                    background: '#111827',
                                    color: '#fff',
                                }}
                            >
                                <option value="">Selecione...</option>
                                {EVENT_TEMPLATES.map(t => (
                                    <option key={t.id} value={t.id}>{t.name}</option>
                                ))}
                            </select>
                        </div>

                        {/* Theme */}
                        {selectedTemplate?.defaults.requiresTheme && (
                            <div style={{ marginBottom: '15px' }}>
                                <label style={{ display: 'block', marginBottom: '5px', fontSize: '0.9em' }}>
                                    Tema:
                                </label>
                                <input
                                    type="text"
                                    value={theme}
                                    onChange={e => setTheme(e.target.value)}
                                    placeholder="Ex: Coragem na Pregação"
                                    style={{
                                        width: '100%',
                                        padding: '10px',
                                        borderRadius: '6px',
                                        border: '1px solid #374151',
                                        background: '#111827',
                                        color: '#fff',
                                    }}
                                />
                            </div>
                        )}

                        {/* Assignee */}
                        {selectedTemplate?.defaults.requiresAssignee && (
                            <div style={{ marginBottom: '15px' }}>
                                <label style={{ display: 'block', marginBottom: '5px', fontSize: '0.9em' }}>
                                    Responsável:
                                </label>
                                {publishers.length > 0 ? (
                                    <select
                                        value={assignedTo}
                                        onChange={e => setAssignedTo(e.target.value)}
                                        style={{
                                            width: '100%',
                                            padding: '10px',
                                            borderRadius: '6px',
                                            border: '1px solid #374151',
                                            background: '#111827',
                                            color: '#fff',
                                        }}
                                    >
                                        <option value="">Selecione...</option>
                                        {publishers.map(p => (
                                            <option key={p.id} value={p.name}>{p.name}</option>
                                        ))}
                                    </select>
                                ) : (
                                    <input
                                        type="text"
                                        value={assignedTo}
                                        onChange={e => setAssignedTo(e.target.value)}
                                        placeholder="Nome do responsável"
                                        style={{
                                            width: '100%',
                                            padding: '10px',
                                            borderRadius: '6px',
                                            border: '1px solid #374151',
                                            background: '#111827',
                                            color: '#fff',
                                        }}
                                    />
                                )}
                            </div>
                        )}

                        {/* Duration */}
                        <div style={{ marginBottom: '20px' }}>
                            <label style={{ display: 'block', marginBottom: '5px', fontSize: '0.9em' }}>
                                Duração (min):
                            </label>
                            <input
                                type="number"
                                value={duration}
                                onChange={e => setDuration(parseInt(e.target.value) || 0)}
                                style={{
                                    width: '100%',
                                    padding: '10px',
                                    borderRadius: '6px',
                                    border: '1px solid #374151',
                                    background: '#111827',
                                    color: '#fff',
                                }}
                            />
                        </div>

                        {/* Template Description */}
                        {selectedTemplate && (
                            <div style={{
                                background: '#374151',
                                padding: '10px',
                                borderRadius: '6px',
                                marginBottom: '20px',
                                fontSize: '0.85em',
                            }}>
                                <strong>Impacto:</strong> {selectedTemplate.description}
                            </div>
                        )}

                        {/* Buttons */}
                        <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end' }}>
                            <button
                                onClick={() => { setShowModal(false); resetForm(); }}
                                style={{
                                    background: '#374151',
                                    color: '#fff',
                                    border: 'none',
                                    padding: '10px 20px',
                                    borderRadius: '6px',
                                    cursor: 'pointer',
                                }}
                            >
                                Cancelar
                            </button>
                            <button
                                onClick={handleCreate}
                                disabled={!selectedTemplateId || loading}
                                style={{
                                    background: selectedTemplateId ? '#7c3aed' : '#6b7280',
                                    color: '#fff',
                                    border: 'none',
                                    padding: '10px 20px',
                                    borderRadius: '6px',
                                    cursor: selectedTemplateId ? 'pointer' : 'not-allowed',
                                }}
                            >
                                {loading ? 'Salvando...' : 'Salvar Evento'}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
