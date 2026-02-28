import React, { useState, useEffect } from 'react';
import { workbookService } from '../services/workbookService';
import { communicationService } from '../services/communicationService';
import { WorkbookPart, WorkbookStatus } from '../types';
import './DesignationConfirmationPortal.css';

interface DesignationConfirmationPortalProps {
    partId: string;
}

export function DesignationConfirmationPortal({ partId }: DesignationConfirmationPortalProps) {
    const [part, setPart] = useState<WorkbookPart | null>(null);
    const [partnerInfo, setPartnerInfo] = useState<{ name: string; phone?: string; funcao: string } | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [status, setStatus] = useState<'pending' | 'success' | 'error'>('pending');

    // Form state
    const [accept, setAccept] = useState<boolean | null>(null);
    const [reason, setReason] = useState('');
    const [isSubmitting, setIsSubmitting] = useState(false);

    useEffect(() => {
        loadPart();
    }, [partId]);

    const loadPart = async () => {
        try {
            setLoading(true);
            const found = await workbookService.getPartById(partId);

            if (!found) {
                setError('Designação não encontrada ou expirada.');
            } else {
                setPart(found);

                // Carregar parceiro (Titular/Ajudante) da mesma semana
                try {
                    const weekParts = await workbookService.getPartsByWeekId(found.weekId);
                    const partNumMatch = (found.tituloParte || found.tipoParte || '').match(/^(\d+)/);
                    const partNum = partNumMatch ? partNumMatch[1] : null;

                    const partner = weekParts.find(p => {
                        if (p.id === found.id) return false;
                        if (!p.resolvedPublisherName && !p.rawPublisherName) return false;
                        const otherNumMatch = (p.tituloParte || p.tipoParte || '').match(/^(\d+)/);
                        const otherNum = otherNumMatch ? otherNumMatch[1] : null;
                        if (partNum && otherNum && partNum === otherNum) return p.funcao !== found.funcao;
                        return p.tipoParte === found.tipoParte && p.funcao !== found.funcao;
                    });

                    if (partner) {
                        const partnerName = partner.resolvedPublisherName || partner.rawPublisherName || '';
                        // Buscar telefone do parceiro
                        const { api } = await import('../services/api');
                        const publishers = await api.loadPublishers();
                        const partnerPub = publishers.find(pub => pub.name.trim() === partnerName.trim());
                        setPartnerInfo({
                            name: partnerName,
                            phone: partnerPub?.phone,
                            funcao: partner.funcao === 'Ajudante' ? 'Ajudante' : 'Titular'
                        });
                    }
                } catch (partnerErr) {
                    console.warn('[Portal] Não foi possível carregar parceiro:', partnerErr);
                }
            }
        } catch (err) {
            console.error('Erro ao carregar designação:', err);
            setError('Falha ao conectar com o servidor.');
        } finally {
            setLoading(false);
        }
    };

    const handleSubmit = async () => {
        if (accept === null) return;
        if (accept === false && !reason.trim()) {
            alert('Por favor, informe o motivo da recusa.');
            return;
        }

        setIsSubmitting(true);
        try {
            if (accept) {
                // Confirmar
                await workbookService.updatePart(partId, {
                    status: WorkbookStatus.DESIGNADA // Ou status de confirmado
                });

                // Logar confirmação
                await communicationService.logActivity({
                    type: 'CONFIRMATION',
                    part_id: partId,
                    publisher_name: part?.resolvedPublisherName || part?.rawPublisherName,
                    details: 'Confirmou participação via link portal'
                });
            } else {
                // Recusar
                await workbookService.rejectProposal(partId, reason);

                // Notificar Superintendente (Edmardo)
                // Usando o serviço de comunicação
                if (part) {
                    await communicationService.notifyOverseerOfRefusal(part, reason);
                    // Logar recusa
                    await communicationService.logActivity({
                        type: 'REFUSAL',
                        part_id: partId,
                        publisher_name: part.resolvedPublisherName || part.rawPublisherName,
                        details: reason
                    });
                }
            }
            setStatus('success');
        } catch (err) {
            console.error('Erro ao processar resposta:', err);
            setStatus('error');
        } finally {
            setIsSubmitting(false);
        }
    };

    if (loading) return <div className="portal-container"><div className="spinner"></div><p>Carregando dados...</p></div>;
    if (error) return <div className="portal-container error"><h2>⚠️ Ops!</h2><p>{error}</p></div>;
    if (status === 'success') return (
        <div className="portal-container success">
            <h2>✨ Recebido!</h2>
            <p>Sua resposta foi enviada com sucesso ao sistema RVM.</p>
            <p>{accept ? 'Obrigado por confirmar sua participação!' : 'Sentimos muito que não possa participar. O superintendente já foi notificado.'}</p>
            <button onClick={() => window.close()} className="btn-close">Fechar Janela</button>
        </div>
    );

    if (!part) return null;

    // Calcular quinta-feira da reunião
    const MESES = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho',
        'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];
    let thursdayDisplay = part.weekDisplay || part.date;
    const dp = part.date?.split('-');
    if (dp && dp.length === 3) {
        const baseDate = new Date(parseInt(dp[0]), parseInt(dp[1]) - 1, parseInt(dp[2]));
        const daysToThu = (4 - baseDate.getDay() + 7) % 7;
        const thu = new Date(baseDate);
        thu.setDate(thu.getDate() + daysToThu);
        thursdayDisplay = `Quinta-feira, ${thu.getDate()} de ${MESES[thu.getMonth()]} de ${thu.getFullYear()}`;
    }

    return (
        <div className="portal-container">
            <div className="portal-header">
                <h1>RVM Designações</h1>
                <p>Confirme sua participação na reunião</p>
            </div>

            <div className="assignment-card">
                <div className="card-item">
                    <span className="label">📅 Data:</span>
                    <span className="value">{thursdayDisplay}</span>
                </div>
                <div className="card-item">
                    <span className="label">⏰ Horário:</span>
                    <span className="value">{part.horaInicio}</span>
                </div>
                <div className="card-item">
                    <span className="label">📍 Local:</span>
                    <span className="value">{part.modalidade?.toLowerCase().includes('b') ? 'SALA B' : 'SALÃO PRINCIPAL'}</span>
                </div>
                <div className="card-item divider"></div>
                <h2>{part.tipoParte}</h2>
                {part.tituloParte && <p className="assignment-theme">"{part.tituloParte}"</p>}

                <div className="card-item">
                    <span className="label">👤 Designado:</span>
                    <span className="value">{part.resolvedPublisherName || part.rawPublisherName}</span>
                </div>
                {partnerInfo && (
                    <div className="card-item" style={{ marginTop: '8px', padding: '8px', background: '#F0F9FF', borderRadius: '8px' }}>
                        <span className="label">👥 {partnerInfo.funcao}:</span>
                        <span className="value">{partnerInfo.name}</span>
                        {partnerInfo.phone && (
                            <div style={{ marginTop: '4px' }}>
                                <a href={`https://api.whatsapp.com/send?phone=${partnerInfo.phone.replace(/[^0-9]/g, '').replace(/^(?!55)(\d{10,11})$/, '55$1')}`}
                                    style={{ color: '#25D366', textDecoration: 'none', fontSize: '14px' }}
                                    target="_blank" rel="noopener noreferrer">
                                    📱 WhatsApp: {partnerInfo.phone}
                                </a>
                            </div>
                        )}
                        <p style={{ fontSize: '12px', color: '#6B7280', margin: '4px 0 0' }}>Entre em contato para combinarem o ensaio 🤝</p>
                    </div>
                )}
            </div>

            <div className="portal-form">
                <p className="form-question">Você poderá realizar esta designação?</p>
                <div className="button-group">
                    <button
                        className={`btn-confirm ${accept === true ? 'active' : ''}`}
                        onClick={() => setAccept(true)}
                    >
                        ✅ Sim, confirmo
                    </button>
                    <button
                        className={`btn-decline ${accept === false ? 'active' : ''}`}
                        onClick={() => setAccept(false)}
                    >
                        ❌ Não poderei
                    </button>
                </div>

                {accept === false && (
                    <div className="reason-field">
                        <label>Motivo da recusa (opcional para o Ancião):</label>
                        <textarea
                            value={reason}
                            onChange={(e) => setReason(e.target.value)}
                            placeholder="Ex: Viagem, doença, imprevisto..."
                        />
                    </div>
                )}

                <button
                    className="btn-submit"
                    disabled={accept === null || isSubmitting}
                    onClick={handleSubmit}
                >
                    {isSubmitting ? 'Enviando...' : 'Enviar Resposta'}
                </button>
            </div>

            <footer className="portal-footer">
                <p>© 2026 RVM Unified System</p>
            </footer>
        </div>
    );
}
