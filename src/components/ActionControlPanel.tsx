import { useState, useEffect } from 'react';
import type { Publisher, WorkbookPart } from '../types';
import { checkEligibility, type EligibilityResult } from '../services/eligibilityService';
import { getCooldownInfo, type CooldownInfo } from '../services/cooldownService';
import { loadPublisherParticipations } from '../services/historyAdapter';

/**
 * ActionControlPanel – Exibe detalhes da parte selecionada
 * Mostra informações sobre a parte, status, publicador designado e permite ações futuras.
 */
interface Props {
    selectedPartId: string | null;
    parts: WorkbookPart[];
    publishers: Publisher[];
}

interface PublisherStats {
    lastDate: string | null;
    totalAssignments: number;
}

export default function ActionControlPanel({ selectedPartId, parts, publishers }: Props) {
    const selectedPart = parts.find(p => p.id === selectedPartId);

    // Buscar o publicador designado para esta parte
    const assignedPublisher = selectedPart?.rawPublisherName
        ? publishers.find(pub =>
            pub.name.toLowerCase() === selectedPart.rawPublisherName?.toLowerCase()
        )
        : null;

    // Estados para dados assíncronos
    const [eligibility, setEligibility] = useState<EligibilityResult | null>(null);
    const [cooldown, setCooldown] = useState<CooldownInfo | null>(null);
    const [stats, setStats] = useState<PublisherStats | null>(null);
    const [loading, setLoading] = useState(false);

    useEffect(() => {
        let isMounted = true;

        async function fetchData() {
            if (!selectedPart || !assignedPublisher) {
                setEligibility(null);
                setCooldown(null);
                setStats(null);
                return;
            }

            setLoading(true);
            try {
                // 1. Verificar Elegibilidade (Rápido, Síncrono)
                const elig = checkEligibility(
                    assignedPublisher,
                    selectedPart.modalidade as any, // Cast simples, idealmente tipar melhor no WorkbookPart
                    selectedPart.funcao as any,
                    {
                        date: selectedPart.date,
                        partTitle: selectedPart.tituloParte,
                        secao: selectedPart.section
                    }
                );

                if (isMounted) setEligibility(elig);

                // 2. Buscar Histórico (Assíncrono)
                const history = await loadPublisherParticipations(assignedPublisher.name);

                if (!isMounted) return;

                // 3. Calcular Cooldown
                const cdInfo = getCooldownInfo(
                    assignedPublisher.name,
                    selectedPart.tipoParte,
                    history,
                    new Date() // Hoje
                );
                setCooldown(cdInfo);

                // 4. Calcular Estatísticas Simples
                // Filtrar apenas partes do mesmo tipo para "Última vez"
                const sameTypeHistory = history.filter(h => h.tipoParte === selectedPart.tipoParte);
                const lastDate = sameTypeHistory.length > 0 ? sameTypeHistory[0].date : null;

                setStats({
                    lastDate,
                    totalAssignments: history.length
                });

            } catch (error) {
                console.error("Erro ao buscar dados do publicador:", error);
            } finally {
                if (isMounted) setLoading(false);
            }
        }

        fetchData();

        return () => { isMounted = false; };
    }, [selectedPart, assignedPublisher]);


    // Estilo para badges de status
    const getBadgeStyle = (type: 'success' | 'warning' | 'info' | 'error'): React.CSSProperties => {
        const colors = {
            success: { bg: '#DEF7EC', text: '#03543F' },
            warning: { bg: '#FDF6B2', text: '#723B13' },
            info: { bg: '#E1EFFE', text: '#1E40AF' },
            error: { bg: '#FDE8E8', text: '#9B1C1C' },
        };
        return {
            display: 'inline-block',
            padding: '2px 8px',
            borderRadius: '9999px',
            fontSize: '10px',
            fontWeight: '600',
            backgroundColor: colors[type].bg,
            color: colors[type].text,
        };
    };

    // Formatar status da parte
    const getStatusBadge = (status: string) => {
        switch (status) {
            case 'PENDENTE': return <span style={getBadgeStyle('warning')}>⏳ Pendente</span>;
            case 'CONFIRMED': return <span style={getBadgeStyle('success')}>✅ Confirmada</span>;
            case 'COMPLETED': return <span style={getBadgeStyle('info')}>✓ Concluída</span>;
            case 'CANCELADA': return <span style={getBadgeStyle('error')}>❌ Cancelada</span>;
            default: return <span style={getBadgeStyle('info')}>{status}</span>;
        }
    };

    // Estilos
    const sectionStyle: React.CSSProperties = {
        marginBottom: '16px',
        padding: '12px',
        background: '#F9FAFB',
        borderRadius: '8px',
        border: '1px solid #E5E7EB',
    };

    const labelStyle: React.CSSProperties = {
        fontSize: '10px',
        fontWeight: '600',
        color: '#6B7280',
        textTransform: 'uppercase',
        letterSpacing: '0.05em',
        marginBottom: '4px',
    };

    const valueStyle: React.CSSProperties = {
        fontSize: '13px',
        color: '#111827',
        fontWeight: '500',
    };

    return (
        <div style={{ padding: '12px', height: '100%', overflowY: 'auto' }}>
            {selectedPart ? (
                <>
                    {/* Header com título da parte */}
                    <div style={{ marginBottom: '16px', paddingBottom: '12px', borderBottom: '2px solid #4F46E5' }}>
                        <h3 style={{ margin: '0 0 4px 0', fontSize: '15px', color: '#111827' }}>
                            {selectedPart.tituloParte || selectedPart.tipoParte}
                        </h3>
                        <div style={{ fontSize: '12px', color: '#6B7280' }}>
                            {selectedPart.weekDisplay} • {selectedPart.section}
                        </div>
                    </div>

                    {/* Status e Horário */}
                    <div style={sectionStyle}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                            <div style={labelStyle}>Status</div>
                            {getStatusBadge(selectedPart.status)}
                        </div>
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
                            <div>
                                <div style={labelStyle}>Horário</div>
                                <div style={valueStyle}>{selectedPart.horaInicio} - {selectedPart.horaFim}</div>
                            </div>
                            <div>
                                <div style={labelStyle}>Duração</div>
                                <div style={valueStyle}>{selectedPart.duracao}</div>
                            </div>
                        </div>
                    </div>

                    {/* Publicador Designado */}
                    <div style={sectionStyle}>
                        <div style={labelStyle}>Publicador Designado</div>
                        {selectedPart.rawPublisherName ? (
                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: '4px' }}>
                                <div style={{
                                    width: '32px',
                                    height: '32px',
                                    borderRadius: '50%',
                                    background: '#4F46E5',
                                    color: 'white',
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    fontSize: '14px',
                                    fontWeight: '600',
                                }}>
                                    {selectedPart.rawPublisherName.charAt(0).toUpperCase()}
                                </div>
                                <div>
                                    <div style={valueStyle}>{selectedPart.rawPublisherName}</div>
                                    {assignedPublisher && (
                                        <div style={{ fontSize: '10px', color: '#6B7280' }}>
                                            {assignedPublisher.gender === 'brother' ? '👨' : '👩'} {assignedPublisher.condition}
                                        </div>
                                    )}
                                </div>
                            </div>
                        ) : (
                            <div style={{ ...valueStyle, color: '#DC2626', marginTop: '4px' }}>
                                ⚠️ Nenhum publicador designado
                            </div>
                        )}
                    </div>

                    {/* Painel de Análise (Substitui Placeholder) */}
                    {assignedPublisher && (
                        <div style={{ ...sectionStyle, background: '#FFFFFF', borderColor: '#D1D5DB' }}>
                            <div style={{ marginBottom: '8px', fontWeight: 'bold', fontSize: '12px', color: '#374151' }}>
                                📊 Análise do Designado
                            </div>

                            {loading ? (
                                <div style={{ fontSize: '11px', color: '#6B7280', fontStyle: 'italic' }}>
                                    Carregando histórico...
                                </div>
                            ) : (
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>

                                    {/* Elegibilidade */}
                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                        <span style={{ fontSize: '11px', color: '#4B5563' }}>Elegibilidade</span>
                                        {eligibility?.eligible ? (
                                            <span style={{ fontSize: '11px', color: '#059669', fontWeight: 'bold' }}>✓ Apto com Louvor</span>
                                        ) : (
                                            <span style={{ fontSize: '11px', color: '#DC2626', fontWeight: 'bold' }}>
                                                ⚠️ {eligibility?.reason || 'Restrição Encontrada'}
                                            </span>
                                        )}
                                    </div>

                                    {/* Cooldown */}
                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                        <span style={{ fontSize: '11px', color: '#4B5563' }}>Intervalo (Cooldown)</span>
                                        {cooldown?.isInCooldown ? (
                                            <span style={{ fontSize: '11px', color: '#D97706', fontWeight: 'bold' }}>
                                                ⏳ Aguarde {cooldown.cooldownRemaining} sem.
                                            </span>
                                        ) : (
                                            <span style={{ fontSize: '11px', color: '#059669' }}>
                                                ✓ Liberado
                                            </span>
                                        )}
                                    </div>

                                    {/* Estatísticas */}
                                    {stats && (
                                        <>
                                            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                                                <span style={{ fontSize: '11px', color: '#4B5563' }}>Última vez nesta parte</span>
                                                <span style={{ fontSize: '11px', fontWeight: '500' }}>
                                                    {stats.lastDate ? new Date(stats.lastDate).toLocaleDateString() : 'Nunca'}
                                                </span>
                                            </div>
                                            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                                                <span style={{ fontSize: '11px', color: '#4B5563' }}>Total de Designações</span>
                                                <span style={{ fontSize: '11px', fontWeight: '500' }}>
                                                    {stats.totalAssignments}
                                                </span>
                                            </div>
                                        </>
                                    )}
                                </div>
                            )}
                        </div>
                    )}

                    {/* Detalhes da Parte */}
                    {selectedPart.descricaoParte && (
                        <div style={sectionStyle}>
                            <div style={labelStyle}>Descrição</div>
                            <div style={{ fontSize: '12px', color: '#374151', marginTop: '4px' }}>
                                {selectedPart.descricaoParte}
                            </div>
                        </div>
                    )}

                    {/* Função (Titular/Ajudante) */}
                    <div style={sectionStyle}>
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
                            <div>
                                <div style={labelStyle}>Função</div>
                                <div style={valueStyle}>{selectedPart.funcao}</div>
                            </div>
                            <div>
                                <div style={labelStyle}>Modalidade</div>
                                <div style={valueStyle}>{selectedPart.modalidade || '—'}</div>
                            </div>
                        </div>
                    </div>
                </>
            ) : (
                <div style={{
                    height: '100%',
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    justifyContent: 'center',
                    color: '#9CA3AF',
                    textAlign: 'center',
                    padding: '20px',
                }}>
                    <div style={{ fontSize: '48px', marginBottom: '16px' }}>👆</div>
                    <div style={{ fontWeight: '500', marginBottom: '8px' }}>Selecione uma parte</div>
                    <div style={{ fontSize: '12px' }}>
                        Clique em uma parte na lista do carrossel para ver detalhes e opções de ação.
                    </div>
                </div>
            )}
        </div>
    );
}
