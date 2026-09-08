import React, { useState, useEffect, useTransition } from 'react';
import { zapiSmartManagerService, type SmartInteraction, type SmartInteractionStats } from '../../services/zapiSmartManagerService';

interface ZApiSmartManagerModalProps {
    isOpen: boolean;
    onClose: () => void;
}

export const ZApiSmartManagerModal: React.FC<ZApiSmartManagerModalProps> = ({ isOpen, onClose }) => {
    const [interactions, setInteractions] = useState<SmartInteraction[]>([]);
    const [stats, setStats] = useState<SmartInteractionStats | null>(null);
    const [loading, setLoading] = useState(false);
    const [filterIntent, setFilterIntent] = useState<string>('ALL');
    const [searchTerm, setSearchTerm] = useState<string>('');
    const [, startTransition] = useTransition();

    const loadData = async () => {
        setLoading(true);
        try {
            const [recent, calculatedStats] = await Promise.all([
                zapiSmartManagerService.getRecentInteractions(100),
                zapiSmartManagerService.getStats(),
            ]);
            startTransition(() => {
                setInteractions(recent);
                setStats(calculatedStats);
            });
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        if (isOpen) {
            loadData();
        }
    }, [isOpen]);

    if (!isOpen) return null;

    const filtered = interactions.filter((item) => {
        const matchesIntent = filterIntent === 'ALL' || item.detected_intent === filterIntent;
        const matchesSearch =
            !searchTerm ||
            (item.publisher_name && item.publisher_name.toLowerCase().includes(searchTerm.toLowerCase())) ||
            (item.phone && item.phone.includes(searchTerm)) ||
            (item.inbound_text && item.inbound_text.toLowerCase().includes(searchTerm.toLowerCase())) ||
            (item.reason_extracted && item.reason_extracted.toLowerCase().includes(searchTerm.toLowerCase()));
        return matchesIntent && matchesSearch;
    });

    const getIntentBadge = (intent: string) => {
        switch (intent) {
            case 'CONFIRMAR':
                return <span style={{ background: '#dcfce7', color: '#15803d', padding: '3px 8px', borderRadius: '6px', fontWeight: 'bold', fontSize: '11px' }}>✓ CONFIRMADA</span>;
            case 'RECUSAR':
                return <span style={{ background: '#fee2e2', color: '#b91c1c', padding: '3px 8px', borderRadius: '6px', fontWeight: 'bold', fontSize: '11px' }}>✗ RECUSADA</span>;
            case 'DISPONIBILIDADE':
                return <span style={{ background: '#e0f2fe', color: '#0369a1', padding: '3px 8px', borderRadius: '6px', fontWeight: 'bold', fontSize: '11px' }}>📅 DISPONIBILIDADE</span>;
            case 'PERMUTA':
                return <span style={{ background: '#fef3c7', color: '#b45309', padding: '3px 8px', borderRadius: '6px', fontWeight: 'bold', fontSize: '11px' }}>🔄 PERMUTA</span>;
            default:
                return <span style={{ background: '#f1f5f9', color: '#475569', padding: '3px 8px', borderRadius: '6px', fontSize: '11px' }}>💬 {intent}</span>;
        }
    };

    const getMatchedByLabel = (matchedBy: string) => {
        switch (matchedBy) {
            case 'BUTTON': return '🔘 Botão Nativo';
            case 'REACTION': return '👍 Reação Emoji';
            case 'QUOTED_MSG': return '💬 Citação S-89';
            case 'TEMPORAL_WINDOW': return '🕒 Texto Livre (NLP)';
            default: return '❓ Não identificado';
        }
    };

    return (
        <div style={{
            position: 'fixed',
            inset: 0,
            backgroundColor: 'rgba(15, 23, 42, 0.65)',
            backdropFilter: 'blur(4px)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 9999,
            padding: '1.5rem',
        }}>
            <div style={{
                backgroundColor: '#ffffff',
                borderRadius: '16px',
                width: '100%',
                maxWidth: '960px',
                maxHeight: '90vh',
                display: 'flex',
                flexDirection: 'column',
                boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25)',
                border: '1px solid #e2e8f0',
                overflow: 'hidden',
            }}>
                {/* Header */}
                <div style={{
                    padding: '1.25rem 1.75rem',
                    borderBottom: '1px solid #e2e8f0',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    background: '#f8fafc',
                }}>
                    <div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <span style={{ fontSize: '1.4rem' }}>🤖</span>
                            <h2 style={{ margin: 0, fontSize: '1.25rem', color: '#0f172a', fontWeight: '700' }}>
                                Inteligência Nativa WhatsApp (Z-API)
                            </h2>
                        </div>
                        <p style={{ margin: '4px 0 0 0', fontSize: '0.85rem', color: '#64748b' }}>
                            Monitoramento em tempo real das respostas, botões clicados e alertas de recusa aos anciãos.
                        </p>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                        <button
                            onClick={loadData}
                            disabled={loading}
                            style={{
                                padding: '6px 12px',
                                border: '1px solid #cbd5e1',
                                borderRadius: '8px',
                                background: '#ffffff',
                                cursor: 'pointer',
                                fontSize: '0.85rem',
                                color: '#334155',
                                fontWeight: '500',
                            }}
                        >
                            {loading ? 'Atualizando...' : '🔄 Atualizar'}
                        </button>
                        <button
                            onClick={onClose}
                            style={{
                                padding: '6px 12px',
                                border: 'none',
                                borderRadius: '8px',
                                background: '#e2e8f0',
                                cursor: 'pointer',
                                fontSize: '1rem',
                                color: '#475569',
                                fontWeight: 'bold',
                            }}
                        >
                            ✕
                        </button>
                    </div>
                </div>

                {/* Métricas e KPIs */}
                {stats && (
                    <div style={{
                        display: 'grid',
                        gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))',
                        gap: '12px',
                        padding: '1.25rem 1.75rem',
                        background: '#ffffff',
                        borderBottom: '1px solid #f1f5f9',
                    }}>
                        <div style={{ background: '#f8fafc', padding: '10px 14px', borderRadius: '10px', border: '1px solid #e2e8f0' }}>
                            <div style={{ fontSize: '0.75rem', color: '#64748b', fontWeight: '600' }}>TOTAL INTERAÇÕES</div>
                            <div style={{ fontSize: '1.4rem', fontWeight: '700', color: '#0f172a' }}>{stats.total}</div>
                        </div>
                        <div style={{ background: '#f0fdf4', padding: '10px 14px', borderRadius: '10px', border: '1px solid #bbf7d0' }}>
                            <div style={{ fontSize: '0.75rem', color: '#166534', fontWeight: '600' }}>CONFIRMADAS</div>
                            <div style={{ fontSize: '1.4rem', fontWeight: '700', color: '#15803d' }}>{stats.confirmed}</div>
                        </div>
                        <div style={{ background: '#fef2f2', padding: '10px 14px', borderRadius: '10px', border: '1px solid #fecaca' }}>
                            <div style={{ fontSize: '0.75rem', color: '#991b1b', fontWeight: '600' }}>RECUSAS (ALERTADAS)</div>
                            <div style={{ fontSize: '1.4rem', fontWeight: '700', color: '#b91c1c' }}>{stats.refused}</div>
                        </div>
                        <div style={{ background: '#f0f9ff', padding: '10px 14px', borderRadius: '10px', border: '1px solid #bae6fd' }}>
                            <div style={{ fontSize: '0.75rem', color: '#075985', fontWeight: '600' }}>DISPONIBILIDADE</div>
                            <div style={{ fontSize: '1.4rem', fontWeight: '700', color: '#0284c7' }}>{stats.availabilityRequests}</div>
                        </div>
                        <div style={{ background: '#fffbeb', padding: '10px 14px', borderRadius: '10px', border: '1px solid #fde68a' }}>
                            <div style={{ fontSize: '0.75rem', color: '#92400e', fontWeight: '600' }}>PERMUTAS (TROCAS)</div>
                            <div style={{ fontSize: '1.4rem', fontWeight: '700', color: '#d97706' }}>{stats.swaps}</div>
                        </div>
                    </div>
                )}

                {/* Filtros */}
                <div style={{
                    padding: '0.75rem 1.75rem',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    gap: '12px',
                    borderBottom: '1px solid #e2e8f0',
                    background: '#f8fafc',
                }}>
                    <input
                        type="text"
                        placeholder="Buscar por nome, telefone, texto ou motivo..."
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                        style={{
                            flex: 1,
                            padding: '8px 12px',
                            border: '1px solid #cbd5e1',
                            borderRadius: '8px',
                            fontSize: '0.9rem',
                        }}
                    />
                    <div style={{ display: 'flex', gap: '6px' }}>
                        {['ALL', 'CONFIRMAR', 'RECUSAR', 'DISPONIBILIDADE', 'PERMUTA'].map((it) => (
                            <button
                                key={it}
                                onClick={() => setFilterIntent(it)}
                                style={{
                                    padding: '6px 10px',
                                    border: '1px solid',
                                    borderColor: filterIntent === it ? '#2563eb' : '#cbd5e1',
                                    background: filterIntent === it ? '#2563eb' : '#ffffff',
                                    color: filterIntent === it ? '#ffffff' : '#475569',
                                    borderRadius: '6px',
                                    fontSize: '0.8rem',
                                    fontWeight: '600',
                                    cursor: 'pointer',
                                }}
                            >
                                {it === 'ALL' ? 'Todos' : it}
                            </button>
                        ))}
                    </div>
                </div>

                {/* Lista de Interações */}
                <div style={{ flex: 1, overflowY: 'auto', padding: '1rem 1.75rem' }}>
                    {filtered.length === 0 ? (
                        <div style={{ textAlign: 'center', padding: '3rem 0', color: '#94a3b8' }}>
                            <span style={{ fontSize: '2rem' }}>📭</span>
                            <p style={{ marginTop: '8px', fontSize: '0.95rem' }}>Nenhuma interação encontrada.</p>
                        </div>
                    ) : (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                            {filtered.map((item) => (
                                <div
                                    key={item.id}
                                    style={{
                                        border: '1px solid #e2e8f0',
                                        borderRadius: '10px',
                                        padding: '12px 16px',
                                        background: '#ffffff',
                                        display: 'flex',
                                        flexDirection: 'column',
                                        gap: '6px',
                                    }}
                                >
                                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                            <strong style={{ color: '#0f172a', fontSize: '0.95rem' }}>
                                                {item.publisher_name || 'Publicador Não Identificado'}
                                            </strong>
                                            <span style={{ fontSize: '0.8rem', color: '#64748b' }}>({item.phone || 'Sem telefone'})</span>
                                            {getIntentBadge(item.detected_intent)}
                                        </div>
                                        <div style={{ fontSize: '0.75rem', color: '#94a3b8' }}>
                                            {new Date(item.created_at).toLocaleString('pt-BR')}
                                        </div>
                                    </div>

                                    <div style={{ fontSize: '0.85rem', color: '#334155', display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
                                        <span>Canal: <em>{getMatchedByLabel(item.matched_by)}</em></span>
                                        {item.processing_time_ms && (
                                            <span style={{ color: '#64748b' }}>Tempo: <strong>{item.processing_time_ms}ms</strong></span>
                                        )}
                                    </div>

                                    {item.inbound_text && (
                                        <div style={{
                                            background: '#f8fafc',
                                            padding: '8px 12px',
                                            borderRadius: '6px',
                                            fontSize: '0.85rem',
                                            color: '#1e293b',
                                            borderLeft: '3px solid #3b82f6',
                                        }}>
                                            💬 <strong>Mensagem Recebida:</strong> "{item.inbound_text}"
                                        </div>
                                    )}

                                    {item.reason_extracted && (
                                        <div style={{
                                            background: '#fef2f2',
                                            padding: '8px 12px',
                                            borderRadius: '6px',
                                            fontSize: '0.85rem',
                                            color: '#991b1b',
                                            borderLeft: '3px solid #ef4444',
                                        }}>
                                            ⚠️ <strong>Motivo da Recusa:</strong> "{item.reason_extracted}"
                                        </div>
                                    )}

                                    {item.outbound_reply_text && (
                                        <div style={{
                                            background: '#f0fdf4',
                                            padding: '8px 12px',
                                            borderRadius: '6px',
                                            fontSize: '0.8rem',
                                            color: '#166534',
                                            borderLeft: '3px solid #22c55e',
                                        }}>
                                            🤖 <strong>Resposta Automática Enviada:</strong> {item.outbound_reply_text.slice(0, 140)}...
                                        </div>
                                    )}
                                </div>
                            ))}
                        </div>
                    )}
                </div>

                {/* Footer */}
                <div style={{
                    padding: '1rem 1.75rem',
                    borderTop: '1px solid #e2e8f0',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    background: '#f8fafc',
                }}>
                    <div style={{ fontSize: '0.8rem', color: '#64748b' }}>
                        Alerta de recusas enviado exclusivamente para <strong>O Superintendente (SRVM)</strong>, <strong>Ajudante do SRVM</strong> e <strong>Admins</strong>.
                    </div>
                    <button
                        onClick={onClose}
                        style={{
                            padding: '8px 16px',
                            borderRadius: '8px',
                            background: '#0f172a',
                            color: '#ffffff',
                            border: 'none',
                            fontWeight: '600',
                            fontSize: '0.85rem',
                            cursor: 'pointer',
                        }}
                    >
                        Fechar
                    </button>
                </div>
            </div>
        </div>
    );
};
