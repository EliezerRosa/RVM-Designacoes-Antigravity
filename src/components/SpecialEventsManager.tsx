/**
 * SpecialEventsManager - Gerenciador de Eventos Especiais
 * Modal com CRUD completo para eventos que impactam semanas da apostila
 */

import { useState, useEffect, useCallback } from 'react';
import { specialEventService, EVENT_TEMPLATES } from '../services/specialEventService';
import { supabase } from '../lib/supabase';
import type { SpecialEvent, EventImpactAction, EventImpactOverride, ParticipationType } from '../types';

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
    const [formAutoApply, setFormAutoApply] = useState(true);
    const [targetParts, setTargetParts] = useState<Array<{ id: string; title: string; duration: string }>>([]);

    // Suporte a Múltiplos Impactos
    const [formImpacts, setFormImpacts] = useState<(EventImpactOverride & { _uiKey: string })[]>([]);

    // Campos de Informação Adicional
    const [formContent, setFormContent] = useState('');
    const [formReference, setFormReference] = useState('');
    const [formLinks, setFormLinks] = useState('');

    // Lista de Partes para Seleção do Form
    const [allWeekParts, setAllWeekParts] = useState<Array<{ id: string; title: string; duration: string; section: string; tipoParte: string }>>([]);

    const templates = EVENT_TEMPLATES;

    // Todas as ações de impacto disponíveis
    const IMPACT_OPTIONS: { value: EventImpactAction; label: string }[] = [
        { value: 'NO_IMPACT', label: 'Sem Impacto (informativo)' },
        { value: 'REPLACE_PART', label: 'Cancelar Partes Específicas' },
        { value: 'REPLACE_SECTION', label: 'Cancelar Seção Inteira' },
        { value: 'TIME_ADJUSTMENT', label: 'Ajustar Tempo do EBC' },
        { value: 'REDUCE_VIDA_CRISTA_TIME', label: 'Reduzir Tempo (Vida Cristã)' },
        { value: 'ADD_PART', label: 'Adicionar Nova Parte' },
        { value: 'CANCEL_WEEK', label: 'Cancelar Semana Inteira' },
        { value: 'SC_VISIT_LOGIC', label: 'Visita do SC (lógica especial)' },
    ];

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

    // Carregar partes da semana quando necessário para REDUCE_VIDA_CRISTA_TIME ou REPLACE_PART
    useEffect(() => {
        const fetchParts = async () => {
            if (!formWeekId) {
                setTargetParts([]);
                setAllWeekParts([]);
                return;
            }

            try {
                const { data, error } = await supabase
                    .from('workbook_parts')
                    .select('id, part_title, tipo_parte, duracao, section')
                    .eq('week_id', formWeekId)
                    .neq('status', 'CANCELADA');

                if (error) throw error;

                const allParts = (data || []).map(p => ({
                    id: p.id,
                    title: p.part_title || p.tipo_parte,
                    duration: p.duracao,
                    section: p.section || '',
                    tipoParte: p.tipo_parte || '',
                }));
                setAllWeekParts(allParts);

                // Filtrar partes Vida Cristã (para REDUCE_VIDA_CRISTA_TIME)
                const vidaParts = allParts.filter(p => {
                    const sec = p.section.toLowerCase();
                    const isVida = sec.includes('vida') || sec.includes('ministério') || sec.includes('ministerio');
                    const isPresidency = p.tipoParte === 'Presidente' || p.tipoParte?.includes('Oração');
                    return isVida && !isPresidency;
                });
                setTargetParts(vidaParts);
            } catch (err) {
                console.error('Erro ao buscar partes alvo:', err);
            }
        };

        fetchParts();
    }, [formWeekId]);

    // Quando troca template, pré-selecionar ação padrão se vazio
    useEffect(() => {
        if (selectedTemplate && formImpacts.length === 0) {
            setFormImpacts([{
                _uiKey: Date.now().toString(),
                action: selectedTemplate.impact.action as EventImpactAction
            }]);
        }
    }, [selectedTemplate, formImpacts.length]);

    const resetForm = () => {
        setFormTemplateId('');
        setFormWeekId('');
        setFormTheme('');
        setFormAssignee('');
        setFormTargetPartId('');
        setFormAutoApply(true);
        setTargetParts([]);
        setEditingEvent(null);
        setShowForm(false);
        // Novos resets
        setFormImpacts([]);
        setFormContent('');
        setFormReference('');
        setFormLinks('');
        setAllWeekParts([]);
    };

    const handleSubmit = async () => {
        if (!formTemplateId || !formWeekId) {
            setError('Selecione o tipo e a semana');
            return;
        }

        // Validação adicional para impactos que reduzem tempo
        const hasMissingTimeReduction = formImpacts.some(
            i => (i.action === 'REDUCE_VIDA_CRISTA_TIME' || i.action === 'TIME_ADJUSTMENT')
                && !i.timeReductionDetails?.targetPartId
        );

        if (hasMissingTimeReduction) {
            setError('Selecione a parte que terá o tempo reduzido nos impactos configurados.');
            return;
        }

        try {
            setLoading(true);

            // Remover '_uiKey' antes de salvar no banco
            const cleanedImpacts = formImpacts.map(({ _uiKey, ...rest }) => rest);

            const eventData = {
                templateId: formTemplateId,
                week: formWeekId,
                theme: formTheme || undefined,
                responsible: formAssignee || undefined,
                duration: selectedTemplate?.defaults.duration,
                isApplied: false,
                // Nova Arquitetura de Múltiplos Impactos
                impacts: cleanedImpacts,
                // Limpar campos singulares legados
                overrideAction: undefined,
                affectedPartIds: undefined,
                targetPartId: undefined,
                // Outros campos
                content: formContent || undefined,
                reference: formReference || undefined,
                links: formLinks ? formLinks.split('\n').filter(l => l.trim()) : undefined,
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

        // Popular múltiplos impactos ou criar fallback dos legados
        if (event.impacts && event.impacts.length > 0) {
            setFormImpacts(event.impacts.map((i, idx) => ({ ...i, _uiKey: idx.toString() })));
        } else {
            const legacyAction = event.overrideAction || event.templateId; // Fallback simples
            const legacyImpact: EventImpactOverride & { _uiKey: string } = {
                _uiKey: '0',
                action: legacyAction as EventImpactAction,
                affectedPartIds: event.affectedPartIds,
                timeReductionDetails: event.targetPartId ? { targetPartId: event.targetPartId, minutes: event.duration || 10 } : undefined
            };
            setFormImpacts([legacyImpact]);
        }

        setFormContent(event.content || '');
        setFormReference(event.reference || '');
        setFormLinks(event.links?.join('\n') || '');
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

                    {/* SEÇÃO DINÂMICA DE MÚLTIPLOS IMPACTOS */}
                    {selectedTemplate && formWeekId && (
                        <div style={{ marginTop: '16px', borderTop: '1px solid #E5E7EB', paddingTop: '16px', marginBottom: '16px' }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
                                <label style={{ fontSize: '13px', fontWeight: '600', color: '#1F2937', margin: 0 }}>
                                    Impactos e Ações deste Evento
                                </label>
                                <button
                                    onClick={() => setFormImpacts([...formImpacts, { _uiKey: Date.now().toString(), action: 'NO_IMPACT' }])}
                                    style={{ ...btnStyle('#3B82F6'), fontSize: '11px', padding: '4px 8px' }}
                                >
                                    ➕ Adicionar Impacto
                                </button>
                            </div>

                            {formImpacts.length === 0 && (
                                <div style={{ fontSize: '12px', color: '#6B7280', fontStyle: 'italic', marginBottom: '12px' }}>
                                    Nenhum impacto configurado. Este evento será apenas informativo.
                                </div>
                            )}

                            {formImpacts.map((impact, index) => (
                                <div key={impact._uiKey} style={{ background: '#F3F4F6', border: '1px solid #D1D5DB', borderRadius: '8px', padding: '12px', marginBottom: '8px' }}>

                                    <div style={{ display: 'flex', gap: '8px', marginBottom: '12px' }}>
                                        <div style={{ flex: 1 }}>
                                            <label style={{ fontSize: '11px', fontWeight: '600', color: '#4B5563', display: 'block', marginBottom: '4px' }}>
                                                Ação {index + 1}
                                            </label>
                                            <select
                                                value={impact.action}
                                                onChange={e => {
                                                    const newAction = e.target.value as EventImpactAction;
                                                    setFormImpacts(formImpacts.map(i => i._uiKey === impact._uiKey ? { ...i, action: newAction } : i));
                                                }}
                                                style={{ ...inputStyle, marginBottom: 0, padding: '4px 8px', fontSize: '13px' }}
                                            >
                                                {IMPACT_OPTIONS.map(o => (
                                                    <option key={o.value} value={o.value}>{o.label}</option>
                                                ))}
                                            </select>
                                        </div>
                                        <button
                                            onClick={() => setFormImpacts(formImpacts.filter(i => i._uiKey !== impact._uiKey))}
                                            style={{ background: 'none', border: 'none', color: '#EF4444', cursor: 'pointer', alignSelf: 'flex-end', padding: '6px' }}
                                            title="Remover Impacto"
                                        >
                                            🗑️
                                        </button>
                                    </div>

                                    {/* MÚLTIPLAS PARTES - REPLACE_PART */}
                                    {impact.action === 'REPLACE_PART' && allWeekParts.length > 0 && (
                                        <div style={{ marginBottom: '8px', background: '#fff', padding: '8px', borderRadius: '6px', border: '1px solid #E5E7EB' }}>
                                            <label style={{ fontSize: '11px', fontWeight: '600', color: '#374151', display: 'block', marginBottom: '6px' }}>
                                                Partes a Cancelar/Substituir
                                            </label>
                                            <div style={{ maxHeight: '120px', overflowY: 'auto' }}>
                                                {allWeekParts.map(p => (
                                                    <label key={p.id} style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '4px 6px', cursor: 'pointer', fontSize: '12px', borderBottom: '1px solid #F3F4F6' }}>
                                                        <input
                                                            type="checkbox"
                                                            checked={impact.affectedPartIds?.includes(p.id) || false}
                                                            onChange={e => {
                                                                const currentIds = impact.affectedPartIds || [];
                                                                const newIds = e.target.checked
                                                                    ? [...currentIds, p.id]
                                                                    : currentIds.filter(id => id !== p.id);
                                                                setFormImpacts(formImpacts.map(i => i._uiKey === impact._uiKey ? { ...i, affectedPartIds: newIds } : i));
                                                            }}
                                                            style={{ margin: 0 }}
                                                        />
                                                        <span style={{ flex: 1 }}>{p.title}</span>
                                                        <span style={{ color: '#9CA3AF', fontSize: '10px' }}>{p.duration}</span>
                                                    </label>
                                                ))}
                                            </div>
                                        </div>
                                    )}

                                    {/* REDUÇÃO DE TEMPO */}
                                    {(impact.action === 'REDUCE_VIDA_CRISTA_TIME' || impact.action === 'TIME_ADJUSTMENT') && targetParts.length > 0 && (
                                        <div style={{ display: 'flex', gap: '8px', background: '#fff', padding: '8px', borderRadius: '6px', border: '1px solid #E5E7EB' }}>
                                            <div style={{ flex: 2 }}>
                                                <label style={{ fontSize: '11px', fontWeight: '600', color: '#374151', display: 'block', marginBottom: '4px' }}>
                                                    Parte para Reduzir Tempo
                                                </label>
                                                <select
                                                    value={impact.timeReductionDetails?.targetPartId || ''}
                                                    onChange={e => {
                                                        const currentDetails = impact.timeReductionDetails || { minutes: selectedTemplate?.defaults.duration || 10 };
                                                        setFormImpacts(formImpacts.map(i => i._uiKey === impact._uiKey ? {
                                                            ...i,
                                                            timeReductionDetails: { ...currentDetails, targetPartId: e.target.value }
                                                        } : i));
                                                    }}
                                                    style={{ ...inputStyle, marginBottom: 0, padding: '4px 8px', fontSize: '12px' }}
                                                >
                                                    <option value="">Selecione a parte...</option>
                                                    {targetParts.map(p => (
                                                        <option key={p.id} value={p.id}>{p.title} ({p.duration})</option>
                                                    ))}
                                                </select>
                                            </div>
                                            <div style={{ flex: 1 }}>
                                                <label style={{ fontSize: '11px', fontWeight: '600', color: '#374151', display: 'block', marginBottom: '4px' }}>
                                                    Minutos
                                                </label>
                                                <input
                                                    type="number"
                                                    value={impact.timeReductionDetails?.minutes || selectedTemplate?.defaults.duration || 10}
                                                    onChange={e => {
                                                        const currentDetails = impact.timeReductionDetails || { targetPartId: '' };
                                                        setFormImpacts(formImpacts.map(i => i._uiKey === impact._uiKey ? {
                                                            ...i,
                                                            timeReductionDetails: { ...currentDetails, minutes: Number(e.target.value) }
                                                        } : i));
                                                    }}
                                                    style={{ ...inputStyle, marginBottom: 0, padding: '4px 8px', fontSize: '12px' }}
                                                    min="1"
                                                />
                                            </div>
                                        </div>
                                    )}

                                </div>
                            ))}
                        </div>
                    )}

                    {/* Campos de Tema e Responsável */}
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

                    {/* Campos de Conteúdo/Referência/Links (Anúncio/Notificação) */}
                    {(formTemplateId === 'anuncio' || formTemplateId === 'notificacao') && (
                        <>
                            <label style={{ fontSize: '12px', fontWeight: '600', color: '#374151' }}>
                                {formTemplateId === 'anuncio' ? '📢 Conteúdo do Anúncio' : '🔔 Conteúdo da Notificação'}
                            </label>
                            <textarea
                                value={formContent}
                                onChange={e => setFormContent(e.target.value)}
                                placeholder="Essência / conteúdo..."
                                rows={3}
                                style={{ ...inputStyle, resize: 'vertical' }}
                            />

                            <label style={{ fontSize: '12px', fontWeight: '600', color: '#374151' }}>Referência</label>
                            <input
                                type="text"
                                value={formReference}
                                onChange={e => setFormReference(e.target.value)}
                                placeholder="Ex: Carta nº 123 do Corpo Governante"
                                style={inputStyle}
                            />

                            <label style={{ fontSize: '12px', fontWeight: '600', color: '#374151' }}>
                                Links <span style={{ fontWeight: 'normal', color: '#6B7280' }}>(um por linha)</span>
                            </label>
                            <textarea
                                value={formLinks}
                                onChange={e => setFormLinks(e.target.value)}
                                placeholder="https://exemplo.com/recurso"
                                rows={2}
                                style={{ ...inputStyle, resize: 'vertical', fontFamily: 'monospace', fontSize: '12px' }}
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
