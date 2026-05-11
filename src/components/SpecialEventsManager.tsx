/**
 * SpecialEventsManager - Gerenciador de Eventos Especiais
 * Modal com CRUD completo para eventos que impactam semanas da apostila
 */

import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { specialEventService, EVENT_TEMPLATES } from '../services/specialEventService';
import { announcementService, type AnnouncementHistoryEntry } from '../services/announcementService';
import { announcementPermissions, type AnnouncementUser, type Funcao as AnnFuncao } from '../lib/announcementPermissions';
import { supabase } from '../lib/supabase';
import { useAuth } from '../context/AuthContext';
import type { SpecialEvent, EventImpactOverride, WorkbookPart, Publisher, AnnouncementApprovalStatus } from '../types';
import { GuidedTour, tourSeenKey, type TourStep } from './GuidedTour';
import { AnnouncementBanner } from './AnnouncementBanner';
import { WhatsAppDispatcher } from './WhatsAppDispatcher';

/** Mapeia ação de histórico → label PT-BR. */
const HISTORY_ACTION_LABELS: Record<string, string> = {
    created: 'Criado',
    edited_draft: 'Rascunho editado',
    submitted: 'Submetido para aprovação',
    approved: 'Aprovado',
    rejected: 'Rejeitado',
    reverted: 'Aprovação revertida',
    edited_after_approval: 'Editado após aprovação',
    revoked: 'Revogado',
    whatsapp_dispatched: 'Enviado via WhatsApp',
    auto_cloned_from_template: 'Clonado de template',
};

const ANNOUNCEMENT_TEMPLATE_IDS = ['anuncio', 'notificacao'] as const;
const isAnnouncementTemplate = (templateId: string | undefined | null) =>
    !!templateId && (ANNOUNCEMENT_TEMPLATE_IDS as readonly string[]).includes(templateId);

const APPROVAL_STATUS_STYLES: Record<AnnouncementApprovalStatus, { bg: string; color: string; label: string }> = {
    DRAFT: { bg: '#E5E7EB', color: '#374151', label: 'Rascunho' },
    PENDING: { bg: '#FEF3C7', color: '#92400E', label: 'Aguardando aprovação' },
    APPROVED: { bg: '#DCFCE7', color: '#166534', label: 'Aprovado' },
    REJECTED: { bg: '#FEE2E2', color: '#B91C1C', label: 'Rejeitado' },
    REVOKED: { bg: '#FFE4E6', color: '#9F1239', label: 'Revogado' },
};

// Templates que geram uma parte adicional na Vida Cristã via subevento.
const ADD_PART_TEMPLATE_IDS = [
    'visita-sc',
    'preparacao-assembleia',
    'recapitulacao-assembleia',
    'preparacao-congresso',
    'recapitulacao-congresso',
] as const;

interface Props {
    availableWeeks: { weekId: string; display: string }[];
    onClose: () => void;
    onEventApplied?: () => void;  // Callback para recarregar partes
    workbookParts?: WorkbookPart[];  // Mantido para compatibilidade, mas não usado
    publishers?: Publisher[];         // Para picker Ancião/SM no sub-evento
    /** Se true, esconde formulário e botões de mutação (somente leitura). */
    readOnly?: boolean;
    /** Papel do usuário para badge edit/view no tutorial. Default 'admin'. */
    role?: string;
    /** Identidade efetiva para gating do workflow de aprovação (CCA/SEC/SS). */
    currentUser?: AnnouncementUser;
    /** Se true, exibe apenas eventos do tipo anuncio/notificacao (para uso no portal admin de Links de Form). */
    announcementsOnly?: boolean;
}

export function SpecialEventsManager({ availableWeeks, onClose, onEventApplied, readOnly = false, role = 'admin', publishers = [], currentUser, announcementsOnly = false }: Props) {
    const [events, setEvents] = useState<SpecialEvent[]>([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [showForm, setShowForm] = useState(false);
    const [editingEvent, setEditingEvent] = useState<SpecialEvent | null>(null);

    // Phase B: Filtro de aprovação (aplica só a anuncio/notificacao)
    const [approvalFilter, setApprovalFilter] = useState<'ALL' | AnnouncementApprovalStatus>('ALL');

    // Phase B: Drawer de histórico inline
    const [historyOpenFor, setHistoryOpenFor] = useState<string | null>(null);
    const [historyEntries, setHistoryEntries] = useState<AnnouncementHistoryEntry[]>([]);
    const [historyLoading, setHistoryLoading] = useState(false);

    // Phase D: WhatsApp dispatcher modal
    const [dispatcherOpenFor, setDispatcherOpenFor] = useState<SpecialEvent | null>(null);

    // Identidade efetiva (Phase C): se caller passou currentUser, usar.
    // Senão, resolver via AuthContext + lookup em publishers (funcao do registro).
    const { profile } = useAuth();
    const effectiveUser: AnnouncementUser = useMemo(() => {
        if (currentUser) return currentUser;
        const myPub = profile?.publisher_id
            ? publishers.find(p => p.id === profile.publisher_id)
            : undefined;
        return {
            role: (profile?.role ?? (role === 'admin' ? 'admin' : 'publicador')) as AnnouncementUser['role'],
            funcao: (myPub?.funcao ?? null) as AnnFuncao,
        };
    }, [currentUser, profile, publishers, role]);

    // Tutorial
    const [showTour, setShowTour] = useState(false);
    const [showFormTour, setShowFormTour] = useState(false);
    // Rastreia o que o tutorial pré-selecionou (para desfazer ao fechar)
    const tourSampleRef = useRef<{ template: boolean; week: boolean }>({ template: false, week: false });

    // Form state
    const [formTemplateId, setFormTemplateId] = useState('');
    const [formWeekId, setFormWeekId] = useState('');
    const [formTheme, setFormTheme] = useState('');
    const [formAssignee, setFormAssignee] = useState('');
    const [formAutoApply, setFormAutoApply] = useState(true);

    // Sub-evento (templates com ADD_PART)
    const [formSubEventDuration, setFormSubEventDuration] = useState(10);
    const [formSubEventTheme, setFormSubEventTheme] = useState('');
    const [formAssigneeIsCustom, setFormAssigneeIsCustom] = useState(false);
    const [formInsertAfterId, setFormInsertAfterId] = useState<string>('');

    // Suporte a Impactos Granulares por Parte
    const [formGranularImpacts, setFormGranularImpacts] = useState<Record<string, { visual: boolean; cancel: boolean; reduceTime: boolean; minutes: number }>>({});

    // Campos de Informação Adicional
    const [formContent, setFormContent] = useState('');
    const [formObservation, setFormObservation] = useState('');
    const [formReference, setFormReference] = useState('');
    const [formLinks, setFormLinks] = useState('');
    const [formLinkedEventId, setFormLinkedEventId] = useState<string>('');

    // Lista de Partes para Seleção do Form
    const [allWeekParts, setAllWeekParts] = useState<Array<{ id: string; title: string; duration: string; section: string; tipoParte: string; seq?: number }>>([]);
    const [formGlobalAffectedPartIds, setFormGlobalAffectedPartIds] = useState<string[]>([]);

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

    // Chaves de tour contextualizada: CS usa chave separada para ver o tutorial específico
    const tourKey = announcementsOnly ? 'announcements' : 'events';
    const tourFormKey = announcementsOnly ? 'announcements_form' : 'events_form';

    // Auto-abre tutorial na 1ª visita por papel
    useEffect(() => {
        try {
            const seen = localStorage.getItem(tourSeenKey(tourKey, role));
            if (!seen) {
                const t = setTimeout(() => setShowTour(true), 500);
                return () => clearTimeout(t);
            }
        } catch { /* ignore */ }
    }, [role, tourKey]);

    // Auto-abre tutorial do formulário na 1ª vez que abre 'Novo Evento'
    useEffect(() => {
        if (!showForm) return;
        // Fecha o tour do modal antes de abrir o do formulário (evita 2 painéis sobrepostos)
        setShowTour(false);
        try {
            const seen = localStorage.getItem(tourSeenKey(tourFormKey, role));
            if (!seen) {
                const t = setTimeout(() => setShowFormTour(true), 400);
                return () => clearTimeout(t);
            }
        } catch { /* ignore */ }
    }, [showForm, role, tourFormKey]);

    const selectedTemplate = templates.find(t => t.id === formTemplateId);

    const isInAddPartMode = (ADD_PART_TEMPLATE_IDS as readonly string[]).includes(formTemplateId);
    const addPartBlockTitle = formTemplateId === 'visita-sc'
        ? 'Parte Especial da Visita'
        : 'Parte a Apresentar';
    const addPartBlockDescription = formTemplateId === 'visita-sc'
        ? 'Defina o responsável e a duração da parte adicional ligada à visita do SC.'
        : 'Defina o responsável e a duração da parte adicional ligada a este evento.';

    // Anciãos e SMs ativos para o picker
    const eldersSMs = publishers
        .filter(p =>
            (p.condition === 'Ancião' || p.condition === 'Anciao' || p.condition === 'Servo Ministerial') &&
            p.isServing !== false
        )
        .sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'));

    // Carregar partes da semana diretamente do Supabase (fonte da verdade)
    useEffect(() => {
        if (!formWeekId) {
            setAllWeekParts([]);
            return;
        }

        const fetchParts = async () => {
            try {
                const { data, error: fetchErr } = await supabase
                    .from('workbook_parts')
                    .select('id, part_title, tipo_parte, duracao, section, seq, status')
                    .eq('week_id', formWeekId)
                    .neq('status', 'CANCELADA')
                    .order('seq', { ascending: true });

                if (fetchErr) throw fetchErr;

                const allParts = (data || []).map((row: any) => ({
                    id: row.id,
                    title: (row.part_title || row.tipo_parte || 'Parte sem título').trim() || 'Parte sem título',
                    duration: (row.duracao || '0 min').trim() || '0 min',
                    section: row.section || '',
                    tipoParte: row.tipo_parte || '',
                    seq: row.seq
                }));

                setAllWeekParts(allParts);

            } catch (err) {
                console.error('[SpecialEvents] Erro ao buscar partes:', err);
            }
        };
        fetchParts();
    }, [formWeekId]);

    // Quando troca template, resetar impactos granulares se vazio? 
    // Na verdade, melhor manter ou pré-popular baseado no template.
    useEffect(() => {
        if (selectedTemplate && Object.keys(formGranularImpacts).length === 0 && allWeekParts.length > 0) {
            const initial: Record<string, any> = {};
            // Lógica legada/template: Se template for 'visita-sc', marcar partes específicas para cancelar
            if (formTemplateId === 'visita-sc') {
                allWeekParts.forEach(p => {
                    if (p.tipoParte === 'Dirigente do EBC' || p.tipoParte === 'Leitor do EBC' || p.tipoParte === 'Necessidades Locais' || p.tipoParte === 'Comentários Finais') {
                        initial[p.id] = { visual: true, cancel: true, reduceTime: false, minutes: 0 };
                    }
                });
            }
            setFormGranularImpacts(initial);
        }
    }, [formTemplateId, allWeekParts.length]);

    // Sincronizar duração padrão do sub-evento quando muda o template
    useEffect(() => {
        if (selectedTemplate) {
            setFormSubEventDuration(selectedTemplate.defaults.duration || 10);
        }
    }, [formTemplateId]); // eslint-disable-line react-hooks/exhaustive-deps

    useEffect(() => {
        if (!isInAddPartMode) {
            setFormSubEventTheme('');
            setFormInsertAfterId('');
        }
    }, [isInAddPartMode]);

    // Default: posicionar nova parte após a última parte de "Nossa Vida Cristã"
    // (slot natural antes do "Final da Reunião"). Editar mantém o valor já setado por handleEdit.
    useEffect(() => {
        if (!isInAddPartMode || editingEvent || formInsertAfterId || allWeekParts.length === 0) return;
        const vidaCristaParts = allWeekParts.filter(p =>
            (p.section || '').toLowerCase().includes('vida crist') &&
            p.tipoParte !== 'Evento Especial'
        );
        const anchor = vidaCristaParts.length > 0
            ? vidaCristaParts[vidaCristaParts.length - 1]
            : allWeekParts[allWeekParts.length - 1];
        if (anchor) setFormInsertAfterId(anchor.id);
    }, [isInAddPartMode, allWeekParts, editingEvent, formInsertAfterId]);

    const resetForm = () => {
        setFormTemplateId('');
        setFormWeekId('');
        setFormTheme('');
        setFormAssignee('');
        setFormAutoApply(true);
        setEditingEvent(null);
        setShowForm(false);
        // Novos resets
        setFormGranularImpacts({});
        setFormContent('');
        setFormObservation('');
        setFormReference('');
        setFormLinks('');
        setFormLinkedEventId('');
        setAllWeekParts([]);
        setFormGlobalAffectedPartIds([]);
        setFormSubEventDuration(10);
        setFormSubEventTheme('');
        setFormAssigneeIsCustom(false);
        setFormInsertAfterId('');
    };

    const handleSubmit = async () => {
        if (!formTemplateId || !formWeekId) {
            setError('Selecione o tipo e a semana');
            return;
        }

        if (isInAddPartMode && !formSubEventTheme.trim()) {
            setError('Informe o tema da parte adicional para este evento.');
            return;
        }

        const partsToAffect = Object.entries(formGranularImpacts).filter(([_, cfg]) => cfg.visual || cfg.cancel || cfg.reduceTime);

        if (partsToAffect.length === 0 && !selectedTemplate?.defaults.requiresTheme) {
             // Opcional: permitir salvamento sem impacto se for informativo
        }

        try {
            setLoading(true);

            // TRANSFORMAÇÃO: Granular -> impacts[]
            const visualIds: string[] = [];
            const canceledIds: string[] = [];
            const timeReductions: Record<number, string[]> = {};

            Object.entries(formGranularImpacts).forEach(([id, cfg]) => {
                if (cfg.visual) visualIds.push(id);
                if (cfg.cancel) canceledIds.push(id);
                if (cfg.reduceTime) {
                    if (!timeReductions[cfg.minutes]) timeReductions[cfg.minutes] = [];
                    timeReductions[cfg.minutes].push(id);
                }
            });

            const impacts: EventImpactOverride[] = [];

            // Combinar IDs visuais da tabela granular + seção "Vínculo Visual"
            const allVisualIds = [...new Set([...visualIds, ...formGlobalAffectedPartIds])];
            
            if (canceledIds.length > 0) {
                impacts.push({
                    action: 'REPLACE_PART',
                    affectedPartIds: canceledIds
                });
            }

            Object.entries(timeReductions).forEach(([mins, ids]) => {
                impacts.push({
                    action: 'REDUCE_VIDA_CRISTA_TIME',
                    timeReductionDetails: {
                        targetPartIds: ids,
                        minutes: Number(mins)
                    }
                });
            });

            // Templates com ADD_PART: inserir uma parte adicional na Vida Cristã
            if (isInAddPartMode && formAssignee) {
                impacts.push({
                    action: 'ADD_PART',
                    newPartDetails: {
                        duration: formSubEventDuration,
                        theme: formSubEventTheme.trim(),
                        insertAfterId: formInsertAfterId || undefined,
                    },
                });
            }

            const eventData = {
                templateId: formTemplateId,
                week: formWeekId,
                theme: formTheme || undefined,
                responsible: formAssignee || undefined,
                duration: isInAddPartMode ? formSubEventDuration : selectedTemplate?.defaults.duration,
                isApplied: false,
                impacts: impacts,
                affectedPartIds: allVisualIds.length > 0 ? allVisualIds : undefined,
                content: formContent || undefined,
                observation: formObservation || undefined,
                reference: formReference || undefined,
                links: formLinks ? formLinks.split('\n').filter(l => l.trim()) : undefined,
                linkedEventId: formLinkedEventId || undefined,
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

                // Recalcular horários de início/fim das partes da semana
                try {
                    const { workbookService } = await import('../services/workbookService');
                    await workbookService.recalculateWeekTimings(formWeekId);
                } catch (e) {
                    console.warn('[Eventos] Recálculo de horários falhou (não crítico):', e);
                }
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
        const assignee = event.responsible || '';
        setFormAssignee(assignee);
        setFormAssigneeIsCustom(!!assignee && !eldersSMs.some(p => p.name === assignee));

        const addPartImpact = event.impacts?.find(imp => imp.action === 'ADD_PART');
        setFormSubEventDuration(
            Number(addPartImpact?.newPartDetails?.duration) || event.duration || 10
        );
        setFormSubEventTheme((addPartImpact?.newPartDetails?.theme || event.theme || '').trim());
        setFormInsertAfterId(addPartImpact?.newPartDetails?.insertAfterId || '');

        // Popular impactos granulares a partir do array de impacts do banco
        const granular: Record<string, any> = {};
        
        // 1. Processar affectedPartIds globais como "Visual"
        if (event.affectedPartIds) {
            event.affectedPartIds.forEach(id => {
                granular[id] = { ...granular[id], visual: true };
            });
        }

        // 2. Processar impactos específicos
        if (event.impacts) {
            event.impacts.forEach(imp => {
                const ids = imp.affectedPartIds || [];
                if (imp.action === 'REPLACE_PART' || imp.action === 'CANCEL_WEEK' || imp.action === 'SC_VISIT_LOGIC') {
                    ids.forEach(id => {
                        granular[id] = { ...granular[id], cancel: true, visual: true };
                    });
                }
                if (imp.action === 'REDUCE_VIDA_CRISTA_TIME' || imp.action === 'TIME_ADJUSTMENT') {
                    const tIds = imp.timeReductionDetails?.targetPartIds || (imp.timeReductionDetails?.targetPartId ? [imp.timeReductionDetails.targetPartId] : []);
                    tIds.forEach(id => {
                        granular[id] = { ...granular[id], reduceTime: true, minutes: imp.timeReductionDetails?.minutes || 5 };
                    });
                }
            });
        }

        setFormGranularImpacts(granular);

        setFormContent(event.content || '');
        setFormObservation(event.observation || '');
        setFormReference(event.reference || '');
        setFormLinks(event.links?.join('\n') || '');
        setFormLinkedEventId(event.linkedEventId || '');
        setFormGlobalAffectedPartIds(event.affectedPartIds || []);
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

    // ─── Phase B: Workflow de aprovação (anúncio/notificação) ────────────
    const wrapWorkflow = async (fn: () => Promise<void>) => {
        try {
            setLoading(true);
            await fn();
            await loadEvents();
            // Se o histórico estiver aberto para este evento, recarregar
            if (historyOpenFor) await openHistory(historyOpenFor, true);
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Erro no workflow de aprovação');
        } finally {
            setLoading(false);
        }
    };

    const handleSubmitForApproval = (event: SpecialEvent) =>
        wrapWorkflow(async () => {
            await announcementService.submitForApproval(event.id, effectiveUser.funcao || 'Usuário');
        });

    const handleApprove = (event: SpecialEvent) =>
        wrapWorkflow(async () => {
            await announcementService.approve(event.id, effectiveUser.funcao || 'Aprovador');
        });

    const handleReject = (event: SpecialEvent) => {
        const reason = prompt('Motivo da rejeição (será registrado no histórico):');
        if (!reason || !reason.trim()) return;
        return wrapWorkflow(async () => {
            await announcementService.reject(event.id, effectiveUser.funcao || 'Aprovador', reason.trim());
        });
    };

    const handleRevertApproval = (event: SpecialEvent) => {
        const reason = prompt('Motivo da revogação:');
        if (!reason || !reason.trim()) return;
        return wrapWorkflow(async () => {
            await announcementService.revertApproval(event.id, effectiveUser.funcao || 'Aprovador', reason.trim());
        });
    };

    const openHistory = async (eventId: string, silent = false) => {
        try {
            if (!silent) setHistoryLoading(true);
            setHistoryOpenFor(eventId);
            const entries = await announcementService.getHistory(eventId);
            setHistoryEntries(entries);
        } catch (err) {
            if (!silent) setError(err instanceof Error ? err.message : 'Erro ao carregar histórico');
        } finally {
            if (!silent) setHistoryLoading(false);
        }
    };

    const closeHistory = () => {
        setHistoryOpenFor(null);
        setHistoryEntries([]);
    };

    const renderApprovalBadge = (status?: AnnouncementApprovalStatus | null) => {
        const s = status || 'DRAFT';
        const cfg = APPROVAL_STATUS_STYLES[s];
        return (
            <span style={{
                display: 'inline-block',
                padding: '2px 8px',
                borderRadius: '10px',
                background: cfg.bg,
                color: cfg.color,
                fontSize: '10px',
                fontWeight: 700,
                marginLeft: '6px',
                verticalAlign: 'middle',
            }}>
                {cfg.label}
            </span>
        );
    };

    // IDs de eventos não-anúncio que estão referenciados por algum anúncio/notificação
    const linkedNonAnnouncementIds = useMemo(() => {
        if (!announcementsOnly) return new Set<string>();
        return new Set(
            events
                .filter(e => isAnnouncementTemplate(e.templateId) && e.linkedEventId)
                .map(e => e.linkedEventId as string)
        );
    }, [events, announcementsOnly]);

    // Lista filtrada considerando filtro de aprovação
    // Em modo announcementsOnly: anúncios/notificações + apenas os eventos vinculados a eles
    const filteredEvents = useMemo(() => {
        let list = events;
        if (announcementsOnly) {
            list = list.filter(e =>
                isAnnouncementTemplate(e.templateId) || linkedNonAnnouncementIds.has(e.id)
            );
        }
        if (approvalFilter === 'ALL') return list;
        return list.filter(e => {
            if (!isAnnouncementTemplate(e.templateId)) return true; // Eventos vinculados sempre visíveis
            return (e.approvalStatus || 'DRAFT') === approvalFilter;
        });
    }, [events, approvalFilter, announcementsOnly, linkedNonAnnouncementIds]);

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
        <div style={containerStyle} data-tour-root="events">
            {/* Header */}
            <div style={headerStyle}>
                <h3 style={{ margin: 0, color: '#1F2937' }} data-tour="ev-title">
                    📅 Eventos Especiais
                </h3>
                <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                    {!showForm && !readOnly && (
                        <button
                            onClick={() => setShowForm(true)}
                            data-tour="ev-new"
                            style={{ ...btnStyle('#059669'), padding: '6px 12px' }}
                        >
                            ➕ Novo Evento
                        </button>
                    )}
                    <button
                        onClick={() => { setShowFormTour(false); setShowTour(true); }}
                        title="Ver tutorial guiado deste modal"
                        data-tour="ev-help"
                        style={{
                            border: 'none', background: '#0EA5E9', color: 'white',
                            cursor: 'pointer', fontSize: '12px', fontWeight: 600,
                            borderRadius: '6px', padding: '6px 10px',
                        }}
                    >
                        ❓ Tutorial
                    </button>
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

            {readOnly && (
                <div style={{ padding: '8px 12px', background: '#FEF3C7', color: '#92400E', borderRadius: '6px', marginBottom: '12px', fontSize: '12px', fontWeight: 600 }}>
                    👁️ Modo somente leitura — você não tem permissão para alterar eventos.
                </div>
            )}

            {/* Form */}
            {showForm && (
                <div data-tour="evf-root" style={{ background: '#F9FAFB', padding: '16px', borderRadius: '8px', marginBottom: '16px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
                        <h4 data-tour="evf-title" style={{ margin: 0, color: '#374151' }}>
                            {editingEvent ? 'Editar Evento' : 'Novo Evento'}
                        </h4>
                        <button
                            type="button"
                            onClick={() => { setShowTour(false); setShowFormTour(true); }}
                            title="Tutorial guiado deste formulário"
                            data-tour="evf-help"
                            style={{ ...btnStyle('#0EA5E9'), padding: '4px 10px', fontSize: '12px' }}
                        >
                            ❓ Tutorial do Formulário
                        </button>
                    </div>

                    <label style={{ fontSize: '12px', fontWeight: '600', color: '#374151' }}>Tipo de Evento</label>
                    <select
                        data-tour="evf-template"
                        value={formTemplateId}
                        onChange={e => setFormTemplateId(e.target.value)}
                        style={inputStyle}
                    >
                        <option value="">Selecione...</option>
                        {(announcementsOnly
                            ? templates.filter(t => (ANNOUNCEMENT_TEMPLATE_IDS as readonly string[]).includes(t.id))
                            : templates
                        ).map(t => (
                            <option key={t.id} value={t.id}>{t.name}</option>
                        ))}
                    </select>

                    {selectedTemplate && (
                        <div data-tour="evf-template-desc" style={{ fontSize: '12px', color: '#6B7280', marginBottom: '12px', padding: '8px', background: '#E5E7EB', borderRadius: '4px' }}>
                            {selectedTemplate.description}
                        </div>
                    )}

                    <label style={{ fontSize: '12px', fontWeight: '600', color: '#374151' }}>Semana Alvo</label>
                    <select
                        data-tour="evf-week"
                        value={formWeekId}
                        onChange={e => setFormWeekId(e.target.value)}
                        style={inputStyle}
                    >
                        <option value="">Selecione a semana...</option>
                        {availableWeeks.map(w => (
                            <option key={w.weekId} value={w.weekId}>{w.display}</option>
                        ))}
                    </select>

                    {isInAddPartMode && (
                        <div style={{
                            marginTop: '12px',
                            marginBottom: '16px',
                            padding: '12px',
                            borderRadius: '8px',
                            background: '#EFF6FF',
                            border: '1px solid #BFDBFE'
                        }}>
                            <div style={{ fontSize: '12px', fontWeight: '700', color: '#1D4ED8', marginBottom: '4px' }}>
                                📢 {addPartBlockTitle}
                            </div>
                            <div style={{ fontSize: '11px', color: '#1E40AF', marginBottom: '12px' }}>
                                {addPartBlockDescription}
                            </div>

                            <label style={{ fontSize: '12px', fontWeight: '600', color: '#374151', display: 'block', marginBottom: '6px' }}>
                                Responsável
                            </label>

                            <label style={{ fontSize: '12px', fontWeight: '600', color: '#374151', display: 'block', marginBottom: '6px' }}>
                                Tema da parte adicional
                            </label>
                            <input
                                type="text"
                                value={formSubEventTheme}
                                onChange={e => setFormSubEventTheme(e.target.value)}
                                placeholder="Ex: Visão geral da próxima assembleia"
                                style={inputStyle}
                            />

                            {formAssigneeIsCustom ? (
                                <div style={{ display: 'flex', gap: '8px', marginBottom: '12px' }}>
                                    <input
                                        type="text"
                                        value={formAssignee}
                                        onChange={e => setFormAssignee(e.target.value)}
                                        placeholder="Nome do responsável"
                                        style={{ ...inputStyle, marginBottom: 0 }}
                                    />
                                    <button
                                        type="button"
                                        onClick={() => {
                                            setFormAssignee('');
                                            setFormAssigneeIsCustom(false);
                                        }}
                                        style={btnStyle('#6B7280')}
                                    >
                                        ↩ Lista
                                    </button>
                                </div>
                            ) : (
                                <select
                                    value={formAssignee || ''}
                                    onChange={e => {
                                        const value = e.target.value;
                                        if (value === '__custom__') {
                                            setFormAssignee('');
                                            setFormAssigneeIsCustom(true);
                                            return;
                                        }
                                        setFormAssignee(value);
                                    }}
                                    style={inputStyle}
                                >
                                    <option value="">Selecione o responsável...</option>
                                    <optgroup label="Anciãos">
                                        {eldersSMs
                                            .filter(p => p.condition === 'Ancião' || p.condition === 'Anciao')
                                            .map(p => <option key={p.id} value={p.name}>{p.name}</option>)}
                                    </optgroup>
                                    <optgroup label="Servos Ministeriais">
                                        {eldersSMs
                                            .filter(p => p.condition === 'Servo Ministerial')
                                            .map(p => <option key={p.id} value={p.name}>{p.name}</option>)}
                                    </optgroup>
                                    <option value="__custom__">Nome não cadastrado...</option>
                                </select>
                            )}

                            <label style={{ fontSize: '12px', fontWeight: '600', color: '#374151', display: 'block', marginBottom: '6px' }}>
                                Duração da parte
                            </label>
                            <input
                                type="number"
                                min="1"
                                max="60"
                                value={formSubEventDuration}
                                onChange={e => setFormSubEventDuration(Number(e.target.value))}
                                style={inputStyle}
                            />

                            <label style={{ fontSize: '12px', fontWeight: '600', color: '#374151', display: 'block', marginBottom: '6px', marginTop: '8px' }}>
                                Inserir após qual parte da semana
                            </label>
                            <select
                                value={formInsertAfterId}
                                onChange={e => setFormInsertAfterId(e.target.value)}
                                style={inputStyle}
                                disabled={allWeekParts.length === 0}
                            >
                                <option value="">(Padrão: ao final da semana)</option>
                                {allWeekParts.map(p => (
                                    <option key={p.id} value={p.id}>
                                        {p.section ? `[${p.section}] ` : ''}{p.title} ({p.duration})
                                    </option>
                                ))}
                            </select>
                            <div style={{ fontSize: '11px', color: '#6B7280', marginTop: '4px' }}>
                                A nova parte será inserida logo após a parte selecionada. Os horários das partes seguintes serão recalculados automaticamente.
                            </div>
                        </div>
                    )}

                    {/* NOVA SEÇÃO: IMPACTOS POR PARTE (Modelagem Granular) */}
                    {formWeekId && allWeekParts.length > 0 && (
                        <div data-tour="evf-granular" style={{ marginTop: '16px', borderTop: '1px solid #E5E7EB', paddingTop: '16px', marginBottom: '16px' }}>
                            <label style={{ fontSize: '13px', fontWeight: '600', color: '#1F2937', display: 'block', marginBottom: '12px' }}>
                                Configuração de Impactos por Parte
                            </label>

                            <div style={{ border: '1px solid #E5E7EB', borderRadius: '8px', overflow: 'hidden' }}>
                                <table data-tour="evf-granular-table" style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px' }}>
                                    <thead style={{ background: '#F9FAFB', borderBottom: '1px solid #E5E7EB' }}>
                                        <tr>
                                            <th style={{ textAlign: 'left', padding: '8px', width: '40%', color: '#374151' }}>Parte</th>
                                            <th style={{ padding: '8px', width: '15%', color: '#374151' }}>Vínculo (*¹)</th>
                                            <th style={{ padding: '8px', width: '15%', color: '#374151' }}>Cancelar</th>
                                            <th style={{ padding: '8px', width: '30%', color: '#374151' }}>Tempo (- min)</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {allWeekParts.map((p) => {
                                            const cfg = formGranularImpacts[p.id] || { visual: false, cancel: false, reduceTime: false, minutes: 5 };
                                            return (
                                                <tr key={p.id} style={{ borderBottom: '1px solid #F3F4F6' }}>
                                                    <td style={{ padding: '8px' }}>
                                                        <div style={{ fontWeight: '500', color: '#111827' }}>{p.seq ? p.seq + '. ' : ''}{p.title || '[SEM TÍTULO]'}</div>
                                                        <div style={{ color: '#9CA3AF', fontSize: '10px' }}>{p.duration}</div>
                                                    </td>
                                                    <td style={{ textAlign: 'center', padding: '8px' }}>
                                                        <input
                                                            type="checkbox"
                                                            checked={cfg.visual || cfg.cancel} // Se cancelar, o vínculo é implícito
                                                            disabled={cfg.cancel}
                                                            onChange={e => setFormGranularImpacts({ ...formGranularImpacts, [p.id]: { ...cfg, visual: e.target.checked } })}
                                                        />
                                                    </td>
                                                    <td style={{ textAlign: 'center', padding: '8px' }}>
                                                        <input
                                                            type="checkbox"
                                                            checked={cfg.cancel}
                                                            onChange={e => setFormGranularImpacts({ ...formGranularImpacts, [p.id]: { ...cfg, cancel: e.target.checked, visual: e.target.checked ? true : cfg.visual } })}
                                                        />
                                                    </td>
                                                    <td style={{ padding: '8px' }}>
                                                        <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                                                            <input
                                                                type="checkbox"
                                                                checked={cfg.reduceTime}
                                                                disabled={cfg.cancel}
                                                                onChange={e => setFormGranularImpacts({ ...formGranularImpacts, [p.id]: { ...cfg, reduceTime: e.target.checked } })}
                                                            />
                                                            {cfg.reduceTime && (
                                                                <input
                                                                    type="number"
                                                                    value={cfg.minutes}
                                                                    onChange={e => setFormGranularImpacts({ ...formGranularImpacts, [p.id]: { ...cfg, minutes: Number(e.target.value) } })}
                                                                    style={{ width: '50px', padding: '2px 4px', fontSize: '11px', border: '1px solid #D1D5DB', borderRadius: '4px' }}
                                                                    min="1"
                                                                />
                                                            )}
                                                        </div>
                                                    </td>
                                                </tr>
                                            );
                                        })}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    )}

                    {/* SEÇÃO GLOBAL: VÍNCULO VISUAL (*¹) - Sempre disponível se houver partes */}
                    {allWeekParts.length > 0 && (
                        <div data-tour="evf-visual-link" style={{ marginTop: '16px', background: '#FEF3C7', border: '1px solid #FCD34D', borderRadius: '8px', padding: '12px', marginBottom: '16px' }}>
                            <label style={{ fontSize: '12px', fontWeight: '600', color: '#92400E', display: 'block', marginBottom: '4px' }}>
                                📌 Vínculo Visual (*¹)
                            </label>
                            <p style={{ fontSize: '11px', color: '#B45309', marginBottom: '8px' }}>
                                Selecione as partes que exibirão o marcador de nota visual no PDF e WhatsApp.
                            </p>
                            <div style={{ maxHeight: '150px', overflowY: 'auto', background: '#fff', borderRadius: '6px', border: '1px solid #FDE68A' }}>
                                {allWeekParts.map(p => (
                                    <label key={p.id} style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '6px 8px', cursor: 'pointer', fontSize: '12px', borderBottom: '1px solid #FEF3C7' }}>
                                        <input
                                            type="checkbox"
                                            checked={formGlobalAffectedPartIds.includes(p.id)}
                                            onChange={e => {
                                                const newIds = e.target.checked
                                                    ? [...formGlobalAffectedPartIds, p.id]
                                                    : formGlobalAffectedPartIds.filter(id => id !== p.id);
                                                setFormGlobalAffectedPartIds(newIds);
                                            }}
                                            style={{ margin: 0 }}
                                        />
                                        <span style={{ flex: 1, color: '#1F2937' }}><strong>{p.seq ? p.seq + '. ' : ''}</strong>{p.title || '[SEM TÍTULO]'}</span>
                                        <span style={{ color: '#9CA3AF', fontSize: '10px' }}>{p.duration}</span>
                                    </label>
                                ))}
                            </div>
                        </div>
                    )}

                    {/* Campos de Tema, Observação e Responsável */}
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

                    <div data-tour="evf-observation">
                        <label style={{ fontSize: '12px', fontWeight: '600', color: '#374151' }}>Observação (Opcional)</label>
                        <input
                            type="text"
                            value={formObservation}
                            onChange={e => setFormObservation(e.target.value)}
                            placeholder="Informação adicional para a Pauta"
                            style={inputStyle}
                        />
                    </div>

                    {selectedTemplate?.defaults.requiresAssignee && !isInAddPartMode && (
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
                        <div data-tour="evf-content-block">
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

                            <label style={{ fontSize: '12px', fontWeight: '600', color: '#374151' }}>
                                🔗 Vincular a outro evento <span style={{ fontWeight: 'normal', color: '#6B7280' }}>(opcional)</span>
                            </label>
                            <select
                                value={formLinkedEventId}
                                onChange={e => setFormLinkedEventId(e.target.value)}
                                style={inputStyle}
                            >
                                <option value="">— Não vincular —</option>
                                {events
                                    .filter(e => e.id !== editingEvent?.id)
                                    .sort((a, b) => (b.week || '').localeCompare(a.week || '') || (a.theme || '').localeCompare(b.theme || ''))
                                    .map(e => {
                                        const tplName = getTemplateName(e.templateId);
                                        const label = e.theme ? `${e.theme} · ${tplName}` : tplName;
                                        return (
                                            <option key={e.id} value={e.id}>
                                                [{e.week || 's/sem'}] {label}
                                            </option>
                                        );
                                    })
                                }
                            </select>
                            <small style={{ color: '#6B7280', fontSize: '11px', display: 'block', marginTop: '4px' }}>
                                No S-140, este item aparecerá logo abaixo do evento selecionado.
                            </small>
                        </div>
                    )}

                    {/* Opção de Auto-Aplicar */}
                    <div data-tour="evf-autoapply" style={{
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

                    <div data-tour="evf-actions" style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
                        <button onClick={resetForm} style={btnStyle('#6B7280')}>
                            Cancelar
                        </button>
                        <button onClick={handleSubmit} disabled={loading} style={btnStyle('#4F46E5')}>
                            {loading ? 'Salvando...' : 'Salvar'}
                        </button>
                    </div>
                </div>
            )}

            {/* Phase C: Banner de notificações de aprovação (somente CS members; auto-hide se vazio) */}
            <AnnouncementBanner user={effectiveUser} actorLabel={effectiveUser.funcao || 'CS'} />

            {/* Phase B: Filtro por status de aprovação (afeta só anúncios/notificações) */}
            <div data-tour="ev-approval-filter" style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '12px', fontSize: '12px' }}>
                <label style={{ color: '#6B7280', fontWeight: 600 }}>Filtrar anúncios/notificações:</label>
                <select
                    value={approvalFilter}
                    onChange={e => setApprovalFilter(e.target.value as 'ALL' | AnnouncementApprovalStatus)}
                    style={{ padding: '4px 8px', borderRadius: '6px', border: '1px solid #D1D5DB', fontSize: '12px' }}
                >
                    <option value="ALL">Todos</option>
                    <option value="DRAFT">Rascunho</option>
                    <option value="PENDING">Aguardando aprovação</option>
                    <option value="APPROVED">Aprovado</option>
                    <option value="REJECTED">Rejeitado</option>
                    <option value="REVOKED">Revogado</option>
                </select>
                <span style={{ color: '#9CA3AF' }}>({filteredEvents.length}/{events.length})</span>
            </div>

            {/* Events List */}
            {loading && !showForm ? (
                <div style={{ textAlign: 'center', padding: '20px', color: '#6B7280' }}>
                    Carregando...
                </div>
            ) : filteredEvents.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '30px', color: '#6B7280' }}>
                    {events.length === 0 ? (
                        <>Nenhum evento cadastrado.<br /><small>Clique em "Novo Evento" para adicionar.</small></>
                    ) : (
                        <>Nenhum evento corresponde ao filtro selecionado.</>
                    )}
                </div>
            ) : (
                filteredEvents.map(event => {
                    const isAnnouncement = isAnnouncementTemplate(event.templateId);
                    // Em modo CS (announcementsOnly), eventos não-anúncio são sempre somente leitura
                    const isEffectiveReadOnly = readOnly || (announcementsOnly && !isAnnouncement);
                    const status: AnnouncementApprovalStatus = (event.approvalStatus as AnnouncementApprovalStatus) || 'DRAFT';
                    return (
                        <div key={event.id}>
                        <div style={eventCardStyle(event.isApplied)}>
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
                                {isAnnouncement && renderApprovalBadge(status)}
                                {announcementsOnly && !isAnnouncement && (
                                    <span style={{
                                        fontSize: '11px', fontWeight: 500, color: '#6B7280',
                                        background: '#F3F4F6', border: '1px solid #D1D5DB',
                                        borderRadius: '4px', padding: '1px 5px', marginLeft: '6px',
                                        verticalAlign: 'middle',
                                    }}>👁️ leitura</span>
                                )}
                            </div>
                            <div style={{ fontSize: '12px', color: '#6B7280' }}>
                                Semana: {event.week}
                                {event.theme && ` • ${event.theme}`}
                                {event.responsible && ` • ${event.responsible}`}
                                {isAnnouncement && event.approvedByLabel && status === 'APPROVED' && (
                                    <> • Aprovado por <em>{event.approvedByLabel}</em></>
                                )}
                                {isAnnouncement && event.rejectedReason && status === 'REJECTED' && (
                                    <> • <span style={{ color: '#B91C1C' }}>Motivo: {event.rejectedReason}</span></>
                                )}
                            </div>
                        </div>
                        <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap' }}>
                            {/* Phase B: Botões de workflow para anúncio/notificação */}
                            {isAnnouncement && !readOnly && (
                                <>
                                    {announcementPermissions.canSubmit(effectiveUser, status) && (
                                        <button onClick={() => handleSubmitForApproval(event)} style={btnStyle('#0EA5E9')} title="Submeter para aprovação">
                                            📤 Submeter
                                        </button>
                                    )}
                                    {announcementPermissions.canApprove(effectiveUser, status) && (
                                        <>
                                            <button onClick={() => handleApprove(event)} style={btnStyle('#16A34A')} title="Aprovar">
                                                ✅ Aprovar
                                            </button>
                                            <button onClick={() => handleReject(event)} style={btnStyle('#DC2626')} title="Rejeitar">
                                                ❌ Rejeitar
                                            </button>
                                        </>
                                    )}
                                    {announcementPermissions.canRevert(effectiveUser, status) && (
                                        <button onClick={() => handleRevertApproval(event)} style={btnStyle('#9F1239')} title="Revogar aprovação">
                                            ↩️ Revogar
                                        </button>
                                    )}
                                    {announcementPermissions.canDispatchWhatsApp(effectiveUser) && status === 'APPROVED' && (
                                        <button data-tour="ev-whatsapp" onClick={() => setDispatcherOpenFor(event)} style={btnStyle('#16A34A')} title="Enviar via WhatsApp">
                                            📱 WhatsApp
                                        </button>
                                    )}
                                    <button
                                        onClick={() => historyOpenFor === event.id ? closeHistory() : openHistory(event.id)}
                                        style={btnStyle('#7C3AED')}
                                        title="Histórico de aprovação"
                                    >
                                        📜 {historyOpenFor === event.id ? 'Fechar' : 'Histórico'}
                                    </button>
                                </>
                            )}
                            {!isEffectiveReadOnly && !event.isApplied && (
                                <button onClick={() => handleApply(event)} style={btnStyle('#059669')} title="Aplicar impacto">
                                    ▶️ Aplicar
                                </button>
                            )}
                            {!isEffectiveReadOnly && event.isApplied && (
                                <button onClick={() => handleRevert(event)} style={btnStyle('#F59E0B')} title="Reverter impacto">
                                    ↩️ Reverter
                                </button>
                            )}
                            {!isEffectiveReadOnly && (<>
                                <button onClick={() => handleEdit(event)} style={btnStyle('#3B82F6')} title="Editar">
                                    ✏️
                                </button>
                                <button onClick={() => handleDelete(event)} style={btnStyle('#EF4444')} title="Excluir">
                                    🗑️
                                </button>
                            </>)}
                        </div>
                        </div>

                        {/* Phase B: Drawer de histórico inline */}
                        {isAnnouncement && historyOpenFor === event.id && (
                            <div style={{
                                margin: '0 0 8px 48px',
                                padding: '10px 12px',
                                background: '#FAF5FF',
                                border: '1px solid #DDD6FE',
                                borderRadius: '8px',
                                fontSize: '12px',
                            }}>
                                <div style={{ fontWeight: 700, color: '#5B21B6', marginBottom: '6px' }}>
                                    📜 Histórico de Aprovação
                                </div>
                                {historyLoading ? (
                                    <div style={{ color: '#6B7280' }}>Carregando...</div>
                                ) : historyEntries.length === 0 ? (
                                    <div style={{ color: '#9CA3AF', fontStyle: 'italic' }}>Sem entradas registradas.</div>
                                ) : (
                                    <ul style={{ margin: 0, paddingLeft: '18px', listStyle: 'disc' }}>
                                        {historyEntries.map(h => {
                                            const when = h.createdAt ? new Date(h.createdAt).toLocaleString('pt-BR') : '';
                                            const label = HISTORY_ACTION_LABELS[h.action] ?? h.action;
                                            const reason = (h.metadata && typeof h.metadata === 'object' && 'reason' in h.metadata)
                                                ? String((h.metadata as Record<string, unknown>).reason ?? '')
                                                : '';
                                            return (
                                                <li key={h.id} style={{ marginBottom: '4px', color: '#374151' }}>
                                                    <strong>{label}</strong>
                                                    {h.actorLabel && <> • por <em>{h.actorLabel}</em></>}
                                                    {when && <> • <span style={{ color: '#9CA3AF' }}>{when}</span></>}
                                                    {reason && (
                                                        <div style={{ color: '#6B7280', fontStyle: 'italic', marginLeft: '4px' }}>
                                                            “{reason}”
                                                        </div>
                                                    )}
                                                </li>
                                            );
                                        })}
                                    </ul>
                                )}
                            </div>
                        )}
                        </div>
                    );
                })
            )}

            {/* Info */}
            <div data-tour="ev-info" style={{
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

            <GuidedTour
                open={showTour}
                onClose={() => {
                    setShowTour(false);
                    try { localStorage.setItem(tourSeenKey(tourKey, role), '1'); } catch { /* ignore */ }
                }}
                role={role}
                contextLabel={announcementsOnly ? 'Anúncios e Notificações (CS)' : 'Eventos Especiais'}
                steps={announcementsOnly ? ANN_STEPS(readOnly) : EV_STEPS(readOnly)}
            />

            <GuidedTour
                open={showFormTour}
                onClose={() => {
                    setShowFormTour(false);
                    // Desfaz pré-seleções que o tutorial fez ("volta fechando")
                    if (tourSampleRef.current.week) { setFormWeekId(''); }
                    if (tourSampleRef.current.template) { setFormTemplateId(''); }
                    tourSampleRef.current = { template: false, week: false };
                    try { localStorage.setItem(tourSeenKey(tourFormKey, role), '1'); } catch { /* ignore */ }
                }}
                role={role}
                contextLabel={announcementsOnly ? 'Formulário de Anúncio/Notificação' : 'Formulário de Evento'}
                steps={(announcementsOnly ? ANN_FORM_STEPS : EV_FORM_STEPS)({
                    readOnly,
                    ensureFormOpen: () => setShowForm(true),
                    setSampleTemplate: () => {
                        if (!formTemplateId) {
                            const firstId = announcementsOnly
                                ? (ANNOUNCEMENT_TEMPLATE_IDS[0] as string)
                                : (templates[0]?.id || '');
                            setFormTemplateId(firstId);
                            tourSampleRef.current.template = true;
                        }
                    },
                    setSampleWeek: () => {
                        if (!formWeekId && availableWeeks.length > 0) {
                            setFormWeekId(availableWeeks[0].weekId);
                            tourSampleRef.current.week = true;
                        }
                    },
                    currentTemplateId: formTemplateId,
                    hasWeek: !!formWeekId,
                    hasParts: allWeekParts.length > 0,
                })}
            />

            {/* Phase D: WhatsApp dispatcher modal */}
            {dispatcherOpenFor && (
                <WhatsAppDispatcher
                    event={dispatcherOpenFor}
                    publishers={publishers}
                    actorLabel={effectiveUser.funcao || (effectiveUser.role === 'admin' ? 'Admin' : 'Usuário')}
                    onClose={() => setDispatcherOpenFor(null)}
                />
            )}
        </div>
    );
}

// ─── Tutorial steps — Comissão de Serviço (announcementsOnly) ───────────────

function ANN_STEPS(readOnly: boolean): TourStep[] {
    return [
        {
            title: 'Anúncios e Notificações 📢',
            body: 'Este painel é exclusivo da Comissão de Serviço. Aqui a CS cadastra, aprova e envia Anúncios e Notificações para a congregação — com rastreio de status e encaminhamento via WhatsApp. Vou te guiar em poucos passos.',
        },
        {
            selector: '[data-tour="ev-title"]',
            title: 'Cabeçalho do painel',
            body: 'Identifica o contexto restrito: apenas Anúncios e Notificações são exibidos aqui. O X fecha; o botão ❓ reabre este tutorial sempre que precisar.',
        },
        {
            selector: '[data-tour="ev-new"]',
            title: 'Novo Anúncio / Notificação',
            body: 'Abre o formulário de criação. O tipo já virá restrito a "Anúncio" ou "Notificação" — outros tipos de evento não aparecem neste portal. CCA e SEC têm acesso de edição; demais papéis visualizam apenas.',
            editorRoles: readOnly ? [] : ['admin', 'CCA', 'SEC'],
        },
        {
            selector: '[data-tour="ev-approval-filter"]',
            title: 'Filtro por status de aprovação',
            body: 'Filtra a lista pelo ciclo de vida do anúncio: Rascunho → Aguardando aprovação → Aprovado → Rejeitado → Revogado. O contador (x/total) mostra quantos registros correspondem ao filtro atual.',
        },
        {
            title: 'Ciclo de aprovação',
            body: 'Todo anúncio nasce como Rascunho. A CS o submete para aprovação; o Superintendente de Circuito ou CCA aprova/rejeita. Após aprovado, o botão � WhatsApp fica disponível para enviar à congregação.',
        },
        {
            selector: '[data-tour="ev-whatsapp"]',
            title: '📱 Botão WhatsApp',
            body: 'Este botão verde aparece **somente quando o anúncio está Aprovado** e você é membro da CS (CCA, SEC, SS ou Admin). Clicá-lo abre o **Dispatcher de WhatsApp**: lista de destinatários com filtros, prévia do texto formatado e botão de envio individual por número. Cada envio gera um hash de idempotência — evita duplicatas mesmo se clicado duas vezes.',
        },
        {
            selector: '[data-tour="ev-info"]',
            title: 'Aplicar e Encerrar',
            body: 'Clicar em "▶️ Aplicar" efetiva o anúncio na programação da semana selecionada. Após aplicado e enviado via WhatsApp, o ciclo está completo. O botão ❓ reabre este tutorial a qualquer momento. Pronto, é só isso!',
        },
    ];
}

type AnnFormStepsOpts = {
    readOnly: boolean;
    ensureFormOpen: () => void;
    setSampleTemplate: () => void;
    setSampleWeek: () => void;
    currentTemplateId: string;
    hasWeek: boolean;
    hasParts: boolean;
};

function ANN_FORM_STEPS(opts: AnnFormStepsOpts): TourStep[] {
    const { readOnly, ensureFormOpen, setSampleTemplate, setSampleWeek, hasWeek, hasParts } = opts;
    const editorRoles = readOnly ? [] : ['admin', 'CCA', 'SEC'];
    return [
        {
            title: 'Formulário de Anúncio / Notificação ✨',
            body: 'Aqui a CS redige e publica comunicações oficiais. O formulário é simples e direto: tipo, semana, conteúdo, aprovação. Vou explicar cada campo. Use ← → para navegar.',
            requireSetup: () => ensureFormOpen(),
        },
        {
            selector: '[data-tour="evf-template"]',
            title: '1️⃣ Tipo',
            body: '**Anúncio**: comunicado formal (normas, orientações do CG, deliberações do corpo de anciãos). **Notificação**: informativo pontual (lembretes, mudanças de horário, chamados). A escolha define o ícone e o cabeçalho gerados no PDF e no WhatsApp.',
            editorRoles,
            requireSetup: () => { ensureFormOpen(); setSampleTemplate(); },
        },
        {
            selector: '[data-tour="evf-template-desc"]',
            title: 'Descrição do tipo',
            body: 'Aparece logo abaixo da seleção e confirma o comportamento esperado. Leia antes de prosseguir para ter certeza de que escolheu o tipo correto.',
            editorRoles,
            requireSetup: () => { ensureFormOpen(); setSampleTemplate(); },
        },
        {
            selector: '[data-tour="evf-week"]',
            title: '2️⃣ Semana de referência',
            body: 'Define em qual semana da apostila o anúncio será vinculado. Essa semana aparecerá nos relatórios e na pauta da reunião onde o anúncio for lido.',
            editorRoles,
            requireSetup: () => { ensureFormOpen(); setSampleTemplate(); },
        },
        {
            selector: '[data-tour="evf-content-block"]',
            title: '3️⃣ Conteúdo, Referência e Links',
            body: '• **Conteúdo**: o texto integral do anúncio — o que será lido/enviado.\n• **Referência**: origem oficial (ex.: "Carta da Filial de 10/05"). Aparece em itálico abaixo do conteúdo.\n• **Links**: um por linha, convertidos em botões no PDF e links clicáveis no WhatsApp.',
            editorRoles,
            requireSetup: () => { ensureFormOpen(); setSampleTemplate(); },
        },
        ...(hasWeek && hasParts ? [{
            selector: '[data-tour="evf-granular"]' as string,
            title: '4️⃣ Impacto nas partes (opcional)',
            body: 'Se o anúncio cancelar ou modificar alguma parte da reunião daquela semana, marque aqui. Esta seção só aparece depois de selecionar a semana. Caso o anúncio seja apenas informativo, deixe em branco.',
            editorRoles,
            requireSetup: () => { ensureFormOpen(); setSampleTemplate(); setSampleWeek(); },
        } as TourStep] : []),
        {
            selector: '[data-tour="evf-observation"]',
            title: '5️⃣ Observação',
            body: 'Nota interna visível apenas na Pauta. Use para instruções ao apresentador ("ler lentamente", "distribuir folheto antes") sem que apareçam no texto enviado via WhatsApp.',
            editorRoles,
            requireSetup: () => ensureFormOpen(),
        },
        {
            selector: '[data-tour="evf-autoapply"]',
            title: '6️⃣ Auto-Aplicar',
            body: '**Marcado**: ao salvar, o anúncio já é vinculado à semana selecionada imediatamente.\n**Desmarcado**: fica como Rascunho pendente de aprovação. Recomendado quando o conteúdo ainda precisa de revisão pela CS antes da publicação.',
            editorRoles,
            requireSetup: () => ensureFormOpen(),
        },
        {
            selector: '[data-tour="evf-actions"]',
            title: '7️⃣ Salvar',
            body: '**Cancelar**: descarta tudo sem perguntar — cuidado!\n**Salvar**: grava no Supabase. Se Auto-Aplicar estiver ligado, o anúncio já entra na programação. Após salvo, o card aparece na lista com o status atual e os botões de aprovação/WhatsApp disponíveis conforme seu papel.',
            editorRoles,
            requireSetup: () => ensureFormOpen(),
        },
        {
            title: 'Pronto! 🎉',
            body: 'Fluxo resumido: Tipo → Semana → Conteúdo + Referência + Links → (Impacto nas partes) → Observação → Auto-Aplicar → Salvar. Após salvo, submeta para aprovação e, quando aprovado, envie via WhatsApp. Tutorial disponível pelo botão ❓ no cabeçalho.',
            editorRoles,
        },
    ];
}

// ─── Tutorial steps ─────────────────────────────────────────────────────────
function EV_STEPS(readOnly: boolean): TourStep[] {
    return [
        {
            title: 'Eventos Especiais 📅',
            body: 'Aqui você cadastra eventos que afetam semanas da apostila — assembleias, visitas do Superintendente de Circuito, congressos, etc. Vou te mostrar como funciona em poucos passos.',
        },
        {
            selector: '[data-tour="ev-title"]',
            title: 'Cabeçalho do modal',
            body: 'Identifica o gerenciador. O X fecha; o botão de interrogação reabre este tutorial sempre que precisar.',
        },
        {
            selector: '[data-tour="ev-new"]',
            title: 'Criar novo evento',
            body: 'Abre o formulário com modelos prontos (Visita do SC, Assembleia, Congresso etc.). Apenas CCA e SEC podem criar; demais papéis veem o modal em modo leitura.',
            editorRoles: readOnly ? [] : ['admin', 'CCA', 'SEC'],
        },
        {
            title: 'Modelos e impactos',
            body: 'Cada modelo já vem com sugestões de partes a cancelar ou reduzir. Você pode marcar manualmente quais partes daquela semana sofrerão impacto — visual (badge), cancelamento ou redução de tempo.',
            editorRoles: ['admin', 'CCA', 'SEC'],
        },
        {
            title: 'Lista de eventos',
            body: 'Cada cartão mostra um evento cadastrado, com a semana afetada, o tipo e o status (pendente ou aplicado). CCA/SEC podem aplicar, reverter, editar e excluir; demais papéis apenas visualizam.',
            editorRoles: ['admin', 'CCA', 'SEC'],
        },
        {
            selector: '[data-tour="ev-info"]',
            title: 'Aplicar para efetivar',
            body: 'O evento só passa a influenciar a programação após você clicar em Aplicar. Reverter desfaz o impacto. O motor de designação ignora partes canceladas. Pronto, é só isso!',
        },
    ];
}

// ─── Tutorial steps do FORMULÁRIO "Novo Evento" ────────────────────────────
function EV_FORM_STEPS(opts: {
    readOnly: boolean;
    ensureFormOpen: () => void;
    setSampleTemplate: () => void;
    setSampleWeek: () => void;
    currentTemplateId: string;
    hasWeek: boolean;
    hasParts: boolean;
}): TourStep[] {
    const { readOnly, ensureFormOpen, setSampleTemplate, setSampleWeek, currentTemplateId, hasWeek, hasParts } = opts;
    const editorRoles = readOnly ? [] : ['admin', 'CCA', 'SEC'];
    const isAnuncio = currentTemplateId === 'anuncio' || currentTemplateId === 'notificacao';
    return [
        {
            title: 'Tutorial do formulário "Novo Evento" ✨',
            body: 'Este formulário é o coração do gerenciador: cada campo aqui muda o comportamento do motor de designação, do PDF e do WhatsApp. Vou explicar passo a passo o impacto de cada opção. Use ← → para navegar.',
            requireSetup: () => ensureFormOpen(),
        },
        {
            selector: '[data-tour="evf-title"]',
            title: 'Modo de edição',
            body: 'O título alterna entre "Novo Evento" e "Editar Evento". Editar um evento já APLICADO não desfaz o impacto antigo automaticamente — você precisa Reverter, editar e Aplicar de novo. Em modo leitura, este formulário nem aparece.',
            editorRoles,
            requireSetup: () => ensureFormOpen(),
        },
        {
            selector: '[data-tour="evf-template"]',
            title: '1️⃣ Tipo de Evento (modelo)',
            body: 'Escolher o modelo é o passo mais importante. Cada modelo carrega defaults: quais partes costumam ser canceladas, se exige tema/responsável, se mostra campos de conteúdo (Anúncio/Notificação). Trocar o modelo NÃO apaga o que você já marcou nas partes — ele apenas pré-popula sugestões na 1ª escolha.',
            editorRoles,
            requireSetup: () => { ensureFormOpen(); setSampleTemplate(); },
        },
        {
            selector: '[data-tour="evf-template-desc"]',
            title: 'Descrição do modelo',
            body: 'Aparece logo abaixo da seleção e descreve o efeito típico do modelo (ex.: "Visita do SC substitui partes 5–7 por discurso de serviço"). Use isso para confirmar que escolheu o modelo certo antes de avançar.',
            editorRoles,
            requireSetup: () => { ensureFormOpen(); setSampleTemplate(); },
        },
        {
            selector: '[data-tour="evf-week"]',
            title: '2️⃣ Semana Alvo',
            body: 'Define EXATAMENTE qual semana receberá o impacto. Só aparecem semanas já existentes no Workbook. Trocar a semana recarrega a tabela de partes abaixo — então os impactos granulares são re-mapeados pelos IDs daquela semana específica.',
            editorRoles,
            requireSetup: () => { ensureFormOpen(); setSampleTemplate(); },
        },
        {
            selector: '[data-tour="evf-granular"]',
            title: '3️⃣ Impactos por Parte (granular)',
            body: hasWeek && hasParts
                ? 'Esta tabela só aparece depois de escolher a semana. Cada linha é uma parte real daquela semana — você decide o que acontece com ela individualmente. Esta é a diferença para versões antigas: antes era "tudo ou nada"; agora cada parte tem comportamento próprio. (Para a demo, pré-selecionei uma semana; ela será limpa ao fechar o tutorial.)'
                : 'Esta seção só aparece DEPOIS de escolher a Semana Alvo. Selecione uma semana no passo anterior e a tabela com todas as partes daquela semana será montada aqui.',
            editorRoles,
            requireSetup: () => { ensureFormOpen(); setSampleTemplate(); setSampleWeek(); },
        },
        ...(hasWeek && hasParts ? [{
            selector: '[data-tour="evf-granular-table"]' as string,
            title: 'Colunas da tabela — entenda a diferença',
            body: '• **Vínculo (*¹)**: marca a parte com o badge visual no PDF/WhatsApp, mas NÃO cancela. Útil para chamar atenção ("nesta semana, fale sobre X").\n• **Cancelar**: remove a parte da designação. O motor pula essa parte; nenhum publicador é designado. Marcar Cancelar ativa o vínculo automaticamente.\n• **Tempo (- min)**: reduz a duração da parte. Útil para comprimir a reunião sem cancelar (ex.: cortar 5 min de uma parte de 10).\n\nCancelar e Reduzir Tempo são MUTUAMENTE EXCLUSIVOS — se cancelar, o número some.',
            editorRoles,
            requireSetup: () => { ensureFormOpen(); setSampleTemplate(); },
        } as TourStep] : []),
        {
            selector: '[data-tour="evf-visual-link"]',
            title: '4️⃣ Vínculo Visual global (*¹)',
            body: hasParts
                ? 'Diferente da coluna Vínculo da tabela (que afeta UMA parte por vez), aqui você seleciona TODAS as partes que devem exibir o marcador (*¹) no rodapé do PDF e na mensagem do WhatsApp. Use isto para destacar partes que estão correlacionadas ao evento — mesmo as não canceladas.'
                : 'Esta caixa amarela aparece quando há partes na semana selecionada. Ela permite marcar quais partes mostrarão o badge visual (*¹) no PDF e WhatsApp.',
            editorRoles,
            requireSetup: () => { ensureFormOpen(); setSampleTemplate(); },
        },
        {
            selector: '[data-tour="evf-observation"]',
            title: '5️⃣ Observação',
            body: 'Texto livre que aparece na Pauta. Use para detalhes que o publicador precisa saber ("trazer cadeiras extras", "evento começa 19h em vez de 19h30"). Não afeta a designação, só a comunicação.',
            editorRoles,
            requireSetup: () => ensureFormOpen(),
        },
        ...(isAnuncio ? [{
            selector: '[data-tour="evf-content-block"]' as string,
            title: '6️⃣ Conteúdo / Referência / Links (Anúncio e Notificação)',
            body: '• **Conteúdo**: o texto principal que será lido/enviado.\n• **Referência**: origem oficial (ex.: "Carta de 15/03 do Corpo Governante"). Aparece em itálico abaixo do conteúdo.\n• **Links**: um por linha. Convertidos em links clicáveis no WhatsApp e botões no PDF.\n\nEstes campos só aparecem para os modelos Anúncio e Notificação.',
            editorRoles,
            requireSetup: () => ensureFormOpen(),
        } as TourStep] : []),
        {
            selector: '[data-tour="evf-autoapply"]',
            title: '7️⃣ Auto-Aplicar (decisão crítica)',
            body: '**MARCADO (verde)**: ao salvar, o impacto é APLICADO IMEDIATAMENTE. As partes canceladas saem da designação e o PDF/WhatsApp já refletem isso. Use quando tem certeza.\n\n**DESMARCADO (amarelo)**: o evento fica PENDENTE. Aparece na lista com badge "📅" mas não afeta nada até você clicar em "▶️ Aplicar". Use para revisar antes de efetivar.',
            editorRoles,
            requireSetup: () => ensureFormOpen(),
        },
        {
            selector: '[data-tour="evf-actions"]',
            title: '8️⃣ Salvar ou Cancelar',
            body: '**Cancelar**: descarta tudo e fecha o formulário (sem confirmação — cuidado!).\n**Salvar**: persiste no Supabase. Se Auto-Aplicar estiver ligado, também executa o impacto. Se houver erro de validação (semana ou tipo faltando), uma mensagem aparece em vermelho no topo do modal.',
            editorRoles,
            requireSetup: () => ensureFormOpen(),
        },
        {
            title: 'Pronto! 🎉',
            body: 'Resumo do fluxo: Tipo → Semana → Impactos por parte → Vínculo visual → Observação → (Conteúdo) → Auto-Aplicar → Salvar. Lembre: você pode editar e reverter eventos depois. O tutorial reabre pelo botão ❓ no cabeçalho do formulário.',
            editorRoles,
        },
    ];
}
