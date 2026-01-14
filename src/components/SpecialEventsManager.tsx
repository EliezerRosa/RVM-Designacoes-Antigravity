/**
 * SpecialEventsManager - Gerenciador de Eventos Especiais
 * Modal com CRUD completo para eventos que impactam semanas da apostila
 */

import { useState, useEffect, useCallback } from 'react';
import { specialEventService, EVENT_TEMPLATES } from '../services/specialEventService';
import { supabase } from '../lib/supabase';
import type { SpecialEvent } from '../types';

interface Props {
    availableWeeks: { weekId: string; display: string }[];
    onClose: () => void;
    onEventApplied?: () => void;  // Callback para recarregar partes
}

export function SpecialEventsManager({ availableWeeks, onClose, onEventApplied }: Props) {
    const [events, setEvents] = useState<SpecialEvent[]>([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [showForm, setShowForm] = useState(false);
    const [editingEvent, setEditingEvent] = useState<SpecialEvent | null>(null);

    // Form state
    const [formTemplateId, setFormTemplateId] = useState('');
    const [formWeekId, setFormWeekId] = useState('');
    const [formTheme, setFormTheme] = useState('');
    const [formAssignee, setFormAssignee] = useState('');
    const [formTargetPartId, setFormTargetPartId] = useState('');
    const [formAutoApply, setFormAutoApply] = useState(true);  // Padrão: aplicar automaticamente
    const [targetParts, setTargetParts] = useState<Array<{ id: string; title: string; duration: string }>>([]);

    const templates = EVENT_TEMPLATES;

    const loadEvents = useCallback(async () => {
        try {
            setLoading(true);
            const data = await specialEventService.getAllEvents();
            setEvents(data);
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Erro ao carregar eventos');
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        loadEvents();
    }, [loadEvents]);

    const selectedTemplate = templates.find(t => t.id === formTemplateId);

    // Carregar partes da seção Vida Cristã quando necessário
    useEffect(() => {
        const fetchParts = async () => {
            if (!formWeekId || !selectedTemplate || selectedTemplate.impact.action !== 'REDUCE_VIDA_CRISTA_TIME') {
                setTargetParts([]);
                return;
            }

            try {
                // Buscar partes da semana que sejam da seção Vida e Ministério
                // Filtrar por seção que contenha "Vida" ou "Ministério" ou "Ministerio"
                const { data, error } = await supabase
                    .from('workbook_parts')
                    .select('id, part_title, tipo_parte, duracao, section')
                    .eq('week_id', formWeekId)
                    .neq('status', 'CANCELADA'); // Não mostrar canceladas

                if (error) throw error;

                const vidaParts = (data || []).filter(p => {
                    const sec = (p.section || '').toLowerCase();
                    const isVida = sec.includes('vida') || sec.includes('ministério') || sec.includes('ministerio');
                    // Excluir partes de presidência/oração se houver
                    const isPresidency = p.tipo_parte === 'Presidente' || p.tipo_parte?.includes('Oração');
                    return isVida && !isPresidency;
                }).map(p => ({
                    id: p.id,
                    title: p.part_title || p.tipo_parte,
                    duration: p.duracao
                }));

                setTargetParts(vidaParts);
            } catch (err) {
                console.error('Erro ao buscar partes alvo:', err);
                // Não bloquear erro
            }
        };

        fetchParts();
    }, [formWeekId, formTemplateId, selectedTemplate]);

    const resetForm = () => {
        setFormTemplateId('');
        setFormWeekId('');
        setFormTheme('');
        setFormAssignee('');
        setFormTargetPartId('');
        setFormAutoApply(true);  // Resetar para padrão
        setTargetParts([]);
        setEditingEvent(null);
        setShowForm(false);
    };

    const handleSubmit = async () => {
        if (!formTemplateId || !formWeekId) {
            setError('Selecione o tipo e a semana');
            return;
        }

        // Validação adicional para eventos que reduzem tempo
        if (selectedTemplate?.impact.action === 'REDUCE_VIDA_CRISTA_TIME' && !formTargetPartId) {
            setError('Selecione a parte que terá o tempo reduzido');
            return;
        }

        try {
            setLoading(true);

            const eventData = {
                templateId: formTemplateId,
                week: formWeekId,
                theme: formTheme || undefined,
                responsible: formAssignee || undefined,
                duration: selectedTemplate?.defaults.duration,
                targetPartId: formTargetPartId || undefined,
                isApplied: false,
            };

            let createdEvent: SpecialEvent;

            if (editingEvent) {
                await specialEventService.updateEvent(editingEvent.id, eventData);
                createdEvent = { ...editingEvent, ...eventData } as SpecialEvent;
            } else {
                createdEvent = await specialEventService.createEvent(eventData as Omit<SpecialEvent, 'id'>);
            }

            // Buscar IDs das partes da semana
            const { data: weekParts } = await supabase
                .from('workbook_parts')
                .select('id')
                .eq('week_id', formWeekId);
            const partIds = (weekParts || []).map((p: { id: string }) => p.id);

            if (formAutoApply && partIds.length > 0) {
                // Aplicar automaticamente
                await specialEventService.applyEventImpact(createdEvent, partIds);
                console.log('[Eventos] ✅ Evento aplicado automaticamente');
            } else if (partIds.length > 0) {
                // Marcar como pendente (indicadores visuais)
                await specialEventService.markPendingImpact(createdEvent, partIds);
                console.log('[Eventos] ⏳ Evento marcado como pendente');
            }

            resetForm();
            await loadEvents();
            onEventApplied?.();  // Recarregar partes na aba Apostila
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Erro ao salvar');
        } finally {
            setLoading(false);
        }
    };

    const handleEdit = (event: SpecialEvent) => {
        setEditingEvent(event);
        setFormTemplateId(event.templateId);
        setFormWeekId(event.week);
        setFormTheme(event.theme || '');
        setFormAssignee(event.responsible || '');
        setFormTargetPartId(event.targetPartId || '');
        setShowForm(true);
    };

    const handleDelete = async (event: SpecialEvent) => {
        if (!confirm(`Excluir evento "${getTemplateName(event.templateId)}" da semana ${event.week}?`)) return;

        try {
            setLoading(true);

            // Se estava aplicado, reverter impacto primeiro
            if (event.isApplied) {
                await specialEventService.revertEventImpact(event);
            }

            await specialEventService.deleteEvent(event.id);
            await loadEvents();
            onEventApplied?.();
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Erro ao excluir');
        } finally {
            setLoading(false);
        }
    };

    const handleApply = async (event: SpecialEvent) => {
        try {
            setLoading(true);

            // Buscar IDs das partes da semana diretamente do Supabase
            const { data: weekParts, error: fetchError } = await supabase
                .from('workbook_parts')
                .select('id')
                .eq('week_id', event.week);

            if (fetchError) throw new Error(`Erro ao buscar partes: ${fetchError.message}`);

            const partIds = (weekParts || []).map((p: { id: string }) => p.id);

            if (partIds.length === 0) {
                throw new Error('Nenhuma parte encontrada para esta semana');
            }

            // Limpar marcações de pendente antes de aplicar (para atualizar indicadores)
            await specialEventService.clearPendingMarks(event.id);

            // Aplicar impacto
            const result = await specialEventService.applyEventImpact(event, partIds);
            console.log(`[Eventos] ✅ Impacto aplicado: ${result.affected} partes afetadas`);

            await loadEvents();
            onEventApplied?.();
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Erro ao aplicar');
        } finally {
            setLoading(false);
        }
    };

    const handleRevert = async (event: SpecialEvent) => {
        if (!confirm('Reverter impacto deste evento? As partes canceladas serão restauradas.')) return;

        try {
            setLoading(true);
            await specialEventService.revertEventImpact(event);
            await loadEvents();
            onEventApplied?.();
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Erro ao reverter');
        } finally {
            setLoading(false);
        }
    };

    const getTemplateName = (templateId: string) => {
        return templates.find(t => t.id === templateId)?.name || templateId;
    };

    // Styles
    const containerStyle: React.CSSProperties = {
        background: '#fff',
        borderRadius: '12px',
        padding: '20px',
        maxWidth: '700px',
        width: '100%',
        margin: '0 auto',
        boxShadow: '0 4px 20px rgba(0,0,0,0.15)',
        maxHeight: '85vh',
        overflowY: 'auto',
    };

    const headerStyle: React.CSSProperties = {
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: '16px',
        borderBottom: '2px solid #E5E7EB',
        paddingBottom: '12px',
    };

    const eventCardStyle = (isApplied: boolean | undefined): React.CSSProperties => ({
        display: 'flex',
        alignItems: 'center',
        gap: '12px',
        padding: '12px',
        background: isApplied ? '#DCFCE7' : '#F3F4F6',
        borderRadius: '8px',
        marginBottom: '8px',
        border: isApplied ? '1px solid #86EFAC' : '1px solid transparent',
    });

    const btnStyle = (bg: string): React.CSSProperties => ({
        padding: '4px 8px',
        border: 'none',
        borderRadius: '4px',
        cursor: 'pointer',
        fontSize: '11px',
        fontWeight: '500',
        background: bg,
        color: 'white',
    });

    const inputStyle: React.CSSProperties = {
        width: '100%',
        padding: '8px 12px',
        borderRadius: '6px',
        border: '1px solid #D1D5DB',
        fontSize: '14px',
        marginBottom: '12px',
    };

    return (
        <div style={containerStyle}>
            {/* Header */}
            <div style={headerStyle}>
                <h3 style={{ margin: 0, color: '#1F2937' }}>
                    📅 Eventos Especiais
                </h3>
                <div style={{ display: 'flex', gap: '8px' }}>
                    {!showForm && (
                        <button
                            onClick={() => setShowForm(true)}
                            style={{ ...btnStyle('#059669'), padding: '6px 12px' }}
                        >
                            ➕ Novo Evento
                        </button>
                    )}
                    <button
                        onClick={onClose}
                        style={{ border: 'none', background: 'none', cursor: 'pointer', fontSize: '20px' }}
                    >
                        ✕
                    </button>
                </div>
            </div>

            {/* Error */}
            {error && (
                <div style={{ padding: '8px', background: '#FEE2E2', color: '#B91C1C', borderRadius: '6px', marginBottom: '12px' }}>
                    {error}
                    <button onClick={() => setError(null)} style={{ float: 'right', border: 'none', background: 'none' }}>✕</button>
                </div>
            )}

            {/* Form */}
            {showForm && (
                <div style={{ background: '#F9FAFB', padding: '16px', borderRadius: '8px', marginBottom: '16px' }}>
                    <h4 style={{ margin: '0 0 12px 0', color: '#374151' }}>
                        {editingEvent ? 'Editar Evento' : 'Novo Evento'}
                    </h4>

                    <label style={{ fontSize: '12px', fontWeight: '600', color: '#374151' }}>Tipo de Evento</label>
                    <select
                        value={formTemplateId}
                        onChange={e => setFormTemplateId(e.target.value)}
                        style={inputStyle}
                    >
                        <option value="">Selecione...</option>
                        {templates.map(t => (
                            <option key={t.id} value={t.id}>{t.name}</option>
                        ))}
                    </select>

                    {selectedTemplate && (
                        <div style={{ fontSize: '12px', color: '#6B7280', marginBottom: '12px', padding: '8px', background: '#E5E7EB', borderRadius: '4px' }}>
                            {selectedTemplate.description}
                        </div>
                    )}

                    <label style={{ fontSize: '12px', fontWeight: '600', color: '#374151' }}>Semana Alvo</label>
                    <select
                        value={formWeekId}
                        onChange={e => setFormWeekId(e.target.value)}
                        style={inputStyle}
                    >
                        <option value="">Selecione a semana...</option>
                        {availableWeeks.map(w => (
                            <option key={w.weekId} value={w.weekId}>{w.display}</option>
                        ))}
                    </select>

                    {selectedTemplate?.impact.action === 'REDUCE_VIDA_CRISTA_TIME' && (
                        <>
                            <label style={{ fontSize: '12px', fontWeight: '600', color: '#374151' }}>
                                Parte para Reduzir Tempo
                                <span style={{ fontWeight: 'normal', color: '#6B7280', marginLeft: '4px' }}>
                                    (Será reduzida em {selectedTemplate.defaults.duration} min)
                                </span>
                            </label>
                            <select
                                value={formTargetPartId}
                                onChange={e => setFormTargetPartId(e.target.value)}
                                style={inputStyle}
                            >
                                <option value="">Selecione a parte...</option>
                                {targetParts.map(p => (
                                    <option key={p.id} value={p.id}>
                                        {p.title} ({p.duration})
                                    </option>
                                ))}
                            </select>
                        </>
                    )}

                    {selectedTemplate?.defaults.requiresTheme && (
                        <>
                            <label style={{ fontSize: '12px', fontWeight: '600', color: '#374151' }}>Tema</label>
                            <input
                                type="text"
                                value={formTheme}
                                onChange={e => setFormTheme(e.target.value)}
                                placeholder="Tema do evento"
                                style={inputStyle}
                            />
                        </>
                    )}

                    {selectedTemplate?.defaults.requiresAssignee && (
                        <>
                            <label style={{ fontSize: '12px', fontWeight: '600', color: '#374151' }}>Responsável</label>
                            <input
                                type="text"
                                value={formAssignee}
                                onChange={e => setFormAssignee(e.target.value)}
                                placeholder="Nome do responsável"
                                style={inputStyle}
                            />
                        </>
                    )}

                    {/* Opção de Auto-Aplicar */}
                    <div style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '8px',
                        marginBottom: '16px',
                        padding: '8px 12px',
                        background: formAutoApply ? '#DCFCE7' : '#FEF3C7',
                        borderRadius: '6px',
                        border: formAutoApply ? '1px solid #86EFAC' : '1px solid #FCD34D'
                    }}>
                        <input
                            type="checkbox"
                            id="autoApply"
                            checked={formAutoApply}
                            onChange={e => setFormAutoApply(e.target.checked)}
                            style={{ width: '16px', height: '16px', cursor: 'pointer' }}
                        />
                        <label htmlFor="autoApply" style={{
                            fontSize: '13px',
                            fontWeight: '500',
                            color: formAutoApply ? '#166534' : '#92400E',
                            cursor: 'pointer'
                        }}>
                            {formAutoApply
                                ? '✅ Aplicar automaticamente ao salvar'
                                : '⏳ Manter pendente (com indicador visual)'}
                        </label>
                    </div>

                    <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
                        <button onClick={resetForm} style={btnStyle('#6B7280')}>
                            Cancelar
                        </button>
                        <button onClick={handleSubmit} disabled={loading} style={btnStyle('#4F46E5')}>
                            {loading ? 'Salvando...' : 'Salvar'}
                        </button>
                    </div>
                </div>
            )}

            {/* Events List */}
            {loading && !showForm ? (
                <div style={{ textAlign: 'center', padding: '20px', color: '#6B7280' }}>
                    Carregando...
                </div>
            ) : events.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '30px', color: '#6B7280' }}>
                    Nenhum evento cadastrado.
                    <br />
                    <small>Clique em "Novo Evento" para adicionar.</small>
                </div>
            ) : (
                events.map(event => (
                    <div key={event.id} style={eventCardStyle(event.isApplied)}>
                        <div style={{
                            width: '36px',
                            height: '36px',
                            borderRadius: '8px',
                            background: event.isApplied ? '#22C55E' : '#3B82F6',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            color: 'white',
                            fontSize: '16px',
                        }}>
                            {event.isApplied ? '✓' : '📅'}
                        </div>
                        <div style={{ flex: 1 }}>
                            <div style={{ fontWeight: '600', color: '#1F2937' }}>
                                {getTemplateName(event.templateId)}
                            </div>
                            <div style={{ fontSize: '12px', color: '#6B7280' }}>
                                Semana: {event.week}
                                {event.theme && ` • ${event.theme}`}
                                {event.responsible && ` • ${event.responsible}`}
                            </div>
                        </div>
                        <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap' }}>
                            {!event.isApplied ? (
                                <button onClick={() => handleApply(event)} style={btnStyle('#059669')} title="Aplicar impacto">
                                    ▶️ Aplicar
                                </button>
                            ) : (
                                <button onClick={() => handleRevert(event)} style={btnStyle('#F59E0B')} title="Reverter impacto">
                                    ↩️ Reverter
                                </button>
                            )}
                            <button onClick={() => handleEdit(event)} style={btnStyle('#3B82F6')} title="Editar">
                                ✏️
                            </button>
                            <button onClick={() => handleDelete(event)} style={btnStyle('#EF4444')} title="Excluir">
                                🗑️
                            </button>
                        </div>
                    </div>
                ))
            )}

            {/* Info */}
            <div style={{
                marginTop: '16px',
                padding: '12px',
                background: '#FEF3C7',
                borderRadius: '8px',
                fontSize: '12px',
                color: '#92400E',
            }}>
                💡 <strong>Como funciona:</strong> Eventos afetam partes da apostila (cancelando, ajustando tempo, etc.).
                Clique em "Aplicar" para efetivar o impacto. O motor de designação ignora partes canceladas.
            </div>
        </div>
    );
}
