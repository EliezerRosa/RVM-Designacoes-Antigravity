/**
 * LocalNeedsQueue - Gerenciador de Fila de Necessidades Locais
 * Permite adicionar, reordenar e visualizar pré-designações
 */

import { useState, useEffect, useCallback } from 'react';
import { localNeedsService, type LocalNeedsPreassignment } from '../services/localNeedsService';
import { GuidedTour, tourSeenKey, type TourStep } from './GuidedTour';

interface Props {
    publishers: { id: string; name: string; condition: string }[];
    availableWeeks?: { weekId: string; display: string }[];  // Semanas disponíveis para seleção
    onManualAssignment?: (assignment: LocalNeedsPreassignment) => Promise<void>;
    onClose?: () => void;
    /** Se true, esconde formulário e botões de mutação (somente leitura). */
    readOnly?: boolean;
    /** Papel do usuário para badge edit/view no tutorial. Default 'admin'. */
    role?: string;
}

export function LocalNeedsQueue({ publishers, availableWeeks = [], onClose, onManualAssignment, readOnly = false, role = 'admin' }: Props) {
    const [queue, setQueue] = useState<LocalNeedsPreassignment[]>([]);
    const [history, setHistory] = useState<LocalNeedsPreassignment[]>([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [showHistory, setShowHistory] = useState(false);

    // Formulário de nova pré-designação
    const [newTheme, setNewTheme] = useState('');
    const [newAssignee, setNewAssignee] = useState('');
    const [newTargetWeek, setNewTargetWeek] = useState('');  // Semana alvo (opcional)

    // Tutorial
    const [showTour, setShowTour] = useState(false);

    // Filtrar apenas Anciãos (regra: somente Anciãos podem fazer Necessidades Locais)
    // Alinhado com eligibilityService.ts linha 214-223
    const eligiblePublishers = publishers.filter(p =>
        p.condition === 'Ancião' || p.condition === 'Anciao'
    );

    const loadQueue = useCallback(async () => {
        try {
            setLoading(true);
            const [queueData, historyData] = await Promise.all([
                localNeedsService.getPendingQueue(),
                localNeedsService.getAssignedHistory(),
            ]);
            setQueue(queueData);
            setHistory(historyData);
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Erro ao carregar fila');
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        loadQueue();
    }, [loadQueue]);

    // Auto-abre tutorial na 1ª visita por papel
    useEffect(() => {
        try {
            const seen = localStorage.getItem(tourSeenKey('localneeds', role));
            if (!seen) {
                const t = setTimeout(() => setShowTour(true), 500);
                return () => clearTimeout(t);
            }
        } catch { /* ignore */ }
    }, [role]);

    const handleAdd = async () => {
        if (!newTheme.trim() || !newAssignee.trim()) {
            setError('Preencha tema e responsável');
            return;
        }

        try {
            setLoading(true);
            await localNeedsService.addToQueue(
                newTheme.trim(),
                newAssignee.trim(),
                newTargetWeek || null  // Passar semana alvo se selecionada
            );
            // Se tiver semana alvo, tentar atribuição imediata
            if (newTargetWeek && onClose) {
                // Pequeno delay para garantir que o backend processou
                // Idealmente o addToQueue retornaria o objeto completo
                // Mas como retorna LocalNeedsPreassignment, podemos usar
                const newItem = await localNeedsService.getForWeek(newTargetWeek);
                if (newItem && onManualAssignment) {
                    await onManualAssignment(newItem);
                }
            }

            setNewTheme('');
            setNewAssignee('');
            setNewTargetWeek('');
            await loadQueue();
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Erro ao adicionar');
        } finally {
            setLoading(false);
        }
    };

    const handleRemove = async (id: string) => {
        if (!confirm('Remover esta pré-designação da fila?')) return;

        try {
            setLoading(true);
            await localNeedsService.remove(id);
            await loadQueue();
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Erro ao remover');
        } finally {
            setLoading(false);
        }
    };

    const handleMoveUp = async (id: string, currentPosition: number) => {
        if (currentPosition <= 1) return;
        try {
            await localNeedsService.reorder(id, currentPosition - 1);
            await loadQueue();
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Erro ao mover');
        }
    };

    const handleMoveDown = async (id: string, currentPosition: number) => {
        if (currentPosition >= queue.length) return;
        try {
            await localNeedsService.reorder(id, currentPosition + 1);
            await loadQueue();
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Erro ao mover');
        }
    };

    // Estilos
    const containerStyle: React.CSSProperties = {
        background: '#fff',
        borderRadius: '12px',
        padding: '20px',
        maxWidth: '600px',
        margin: '0 auto',
        boxShadow: '0 4px 20px rgba(0,0,0,0.1)',
    };

    const headerStyle: React.CSSProperties = {
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: '16px',
        borderBottom: '2px solid #E5E7EB',
        paddingBottom: '12px',
    };

    const queueItemStyle: React.CSSProperties = {
        display: 'flex',
        alignItems: 'center',
        gap: '12px',
        padding: '12px',
        background: '#F3F4F6',
        borderRadius: '8px',
        marginBottom: '8px',
    };

    const badgeStyle: React.CSSProperties = {
        background: '#7C3AED',
        color: 'white',
        borderRadius: '50%',
        width: '28px',
        height: '28px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontWeight: '600',
        fontSize: '12px',
    };

    const buttonStyle = (color: string): React.CSSProperties => ({
        padding: '4px 8px',
        border: 'none',
        borderRadius: '4px',
        cursor: 'pointer',
        fontSize: '12px',
        background: color,
        color: 'white',
    });

    return (
        <div style={containerStyle} data-tour-root="localneeds">
            {/* Header */}
            <div style={headerStyle}>
                <h3 style={{ margin: 0, color: '#1F2937' }} data-tour="nl-title">
                    📋 Fila de Necessidades Locais
                </h3>
                <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
                    <button
                        onClick={() => setShowTour(true)}
                        title="Ver tutorial guiado deste modal"
                        data-tour="nl-help"
                        style={{
                            border: 'none', background: '#0EA5E9', color: 'white',
                            cursor: 'pointer', fontSize: '12px', fontWeight: 600,
                            borderRadius: '6px', padding: '4px 10px',
                        }}
                    >
                        ❓ Tutorial
                    </button>
                    {onClose && (
                        <button
                            onClick={onClose}
                            style={{ border: 'none', background: 'none', cursor: 'pointer', fontSize: '20px' }}
                        >
                            ✕
                        </button>
                    )}
                </div>
            </div>

            {/* Erro */}
            {error && (
                <div style={{ padding: '8px', background: '#FEE2E2', color: '#B91C1C', borderRadius: '6px', marginBottom: '12px' }}>
                    {error}
                    <button onClick={() => setError(null)} style={{ float: 'right', border: 'none', background: 'none' }}>✕</button>
                </div>
            )}

            {/* Formulário de Adição (oculto em modo somente leitura) */}
            {!readOnly && (
            <div data-tour="nl-form" style={{ display: 'flex', gap: '8px', marginBottom: '16px', flexWrap: 'wrap' }}>
                <input
                    type="text"
                    placeholder="Tema da Necessidade Local"
                    value={newTheme}
                    onChange={(e) => setNewTheme(e.target.value)}
                    style={{
                        flex: '2',
                        minWidth: '180px',
                        padding: '8px 12px',
                        borderRadius: '6px',
                        border: '1px solid #D1D5DB',
                    }}
                />
                <select
                    value={newAssignee}
                    onChange={(e) => setNewAssignee(e.target.value)}
                    style={{
                        flex: '1',
                        minWidth: '120px',
                        padding: '8px',
                        borderRadius: '6px',
                        border: '1px solid #D1D5DB',
                    }}
                >
                    <option value="">Responsável</option>
                    {eligiblePublishers.map(p => (
                        <option key={p.id} value={p.name}>{p.name}</option>
                    ))}
                </select>
                <select
                    value={newTargetWeek}
                    onChange={(e) => setNewTargetWeek(e.target.value)}
                    style={{
                        flex: '1',
                        minWidth: '130px',
                        padding: '8px',
                        borderRadius: '6px',
                        border: '1px solid #D1D5DB',
                        background: newTargetWeek ? '#DBEAFE' : 'white',
                    }}
                >
                    <option value="">📅 Auto (fila)</option>
                    {availableWeeks.map(w => (
                        <option key={w.weekId} value={w.weekId}>{w.display}</option>
                    ))}
                </select>
                <button
                    onClick={handleAdd}
                    disabled={loading}
                    style={{
                        padding: '8px 16px',
                        background: '#059669',
                        color: 'white',
                        border: 'none',
                        borderRadius: '6px',
                        cursor: loading ? 'wait' : 'pointer',
                        fontWeight: '600',
                    }}
                >
                    ➕
                </button>
            </div>
            )}

            {readOnly && (
                <div style={{ padding: '8px 12px', background: '#FEF3C7', color: '#92400E', borderRadius: '6px', marginBottom: '12px', fontSize: '12px', fontWeight: 600 }}>
                    👁️ Modo somente leitura — você não tem permissão para alterar a fila.
                </div>
            )}

            {/* Tabs */}
            <div data-tour="nl-tabs" style={{ display: 'flex', gap: '8px', marginBottom: '12px' }}>
                <button
                    onClick={() => setShowHistory(false)}
                    style={{
                        ...buttonStyle(showHistory ? '#9CA3AF' : '#7C3AED'),
                        padding: '6px 12px',
                    }}
                >
                    Fila ({queue.length})
                </button>
                <button
                    onClick={() => setShowHistory(true)}
                    style={{
                        ...buttonStyle(!showHistory ? '#9CA3AF' : '#7C3AED'),
                        padding: '6px 12px',
                    }}
                >
                    Histórico ({history.length})
                </button>
            </div>

            {/* Lista */}
            {loading ? (
                <div style={{ textAlign: 'center', padding: '20px', color: '#6B7280' }}>
                    Carregando...
                </div>
            ) : !showHistory ? (
                /* Fila Pendente */
                queue.length === 0 ? (
                    <div style={{ textAlign: 'center', padding: '20px', color: '#6B7280' }}>
                        Nenhuma pré-designação na fila.
                        <br />
                        <small>Adicione temas acima para serem atribuídos automaticamente.</small>
                    </div>
                ) : (
                    queue.map((item, index) => (
                        <div key={item.id} style={queueItemStyle}>
                            <div style={{
                                ...badgeStyle,
                                background: item.targetWeek ? '#0891B2' : '#7C3AED',  // Azul se tem semana específica
                            }}>
                                {item.targetWeek ? '📅' : (index + 1)}
                            </div>
                            <div style={{ flex: 1 }}>
                                <div style={{ fontWeight: '600', color: '#1F2937' }}>{item.theme}</div>
                                <div style={{ fontSize: '12px', color: '#6B7280' }}>
                                    {item.assigneeName}
                                    {item.targetWeek && (
                                        <span style={{ marginLeft: '8px', color: '#0891B2', fontWeight: '500' }}>
                                            → {item.targetWeek}
                                        </span>
                                    )}
                                </div>
                            </div>
                            <div style={{ display: 'flex', gap: '4px' }}>
                                {!readOnly && (<>
                                <button
                                    onClick={() => handleMoveUp(item.id, item.orderPosition)}
                                    disabled={index === 0}
                                    style={{ ...buttonStyle('#3B82F6'), opacity: index === 0 ? 0.3 : 1 }}
                                >
                                    ⬆️
                                </button>
                                <button
                                    onClick={() => handleMoveDown(item.id, item.orderPosition)}
                                    disabled={index === queue.length - 1}
                                    style={{ ...buttonStyle('#3B82F6'), opacity: index === queue.length - 1 ? 0.3 : 1 }}
                                >
                                    ⬇️
                                </button>
                                <button
                                    onClick={() => handleRemove(item.id)}
                                    style={buttonStyle('#EF4444')}
                                >
                                    🗑️
                                </button>
                                </>)}
                            </div>
                        </div>
                    ))
                )
            ) : (
                /* Histórico */
                history.length === 0 ? (
                    <div style={{ textAlign: 'center', padding: '20px', color: '#6B7280' }}>
                        Nenhum histórico ainda.
                    </div>
                ) : (
                    history.map((item) => (
                        <div key={item.id} style={{ ...queueItemStyle, background: '#E5E7EB' }}>
                            <div style={{ ...badgeStyle, background: '#6B7280' }}>✓</div>
                            <div style={{ flex: 1 }}>
                                <div style={{ fontWeight: '600', color: '#374151' }}>{item.theme}</div>
                                <div style={{ fontSize: '12px', color: '#6B7280' }}>
                                    {item.assigneeName} • {item.assignedAt ? new Date(item.assignedAt).toLocaleDateString() : 'N/A'}
                                </div>
                            </div>
                        </div>
                    ))
                )
            )}

            {/* Info */}
            <div data-tour="nl-info" style={{
                marginTop: '16px',
                padding: '12px',
                background: '#EFF6FF',
                borderRadius: '8px',
                fontSize: '12px',
                color: '#1E40AF',
            }}>
                💡 <strong>Como funciona:</strong> Ao clicar em "Gerar" no WorkbookManager, partes de "Necessidades Locais"
                futuras usarão automaticamente os itens desta fila, na ordem definida.
            </div>

            <GuidedTour
                open={showTour}
                onClose={() => {
                    setShowTour(false);
                    try { localStorage.setItem(tourSeenKey('localneeds', role), '1'); } catch { /* ignore */ }
                }}
                role={role}
                contextLabel="Necessidades Locais"
                steps={NL_STEPS(readOnly)}
            />
        </div>
    );
}

// ─── Tutorial steps ─────────────────────────────────────────────────────────
function NL_STEPS(readOnly: boolean): TourStep[] {
    return [
        {
            title: 'Necessidades Locais 📋',
            body: 'Esta é a fila de pré-designações de Necessidades Locais — temas que serão automaticamente atribuídos quando você gerar uma nova programação. Vou te mostrar cada parte em poucos passos.',
        },
        {
            selector: '[data-tour="nl-title"]',
            title: 'Cabeçalho do modal',
            body: 'Identifica que você está no gerenciador da fila. O X fecha o modal; o botão de interrogação reabre este tutorial sempre que precisar.',
        },
        {
            selector: '[data-tour="nl-form"]',
            title: 'Adicionar pré-designação',
            body: 'Preencha o tema, escolha o ancião responsável e, opcionalmente, uma semana específica. Sem semana, o item entra no fim da fila e será atribuído na próxima geração. Apenas CCA e SEC podem editar; demais papéis veem o modal em modo leitura.',
            editorRoles: readOnly ? [] : ['admin', 'CCA', 'SEC'],
        },
        {
            selector: '[data-tour="nl-tabs"]',
            title: 'Fila e Histórico',
            body: 'Alterne entre a fila pendente e o histórico de itens já atribuídos. O contador entre parênteses mostra a quantidade em cada lista.',
        },
        {
            title: 'Reordenar e remover',
            body: 'Na fila pendente, use as setas para mudar a ordem (apenas CCA e SEC) — o primeiro item será atribuído na próxima geração. O ícone de lixeira remove o item.',
            editorRoles: ['admin', 'CCA', 'SEC'],
        },
        {
            selector: '[data-tour="nl-info"]',
            title: 'Integração com a programação',
            body: 'Quando o WorkbookManager gerar uma nova semana, partes de Necessidades Locais usarão automaticamente os itens desta fila, na ordem definida. Pronto, é só isso!',
        },
    ];
}
