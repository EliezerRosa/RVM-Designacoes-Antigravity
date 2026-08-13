import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { getModalidadeFromTipo } from '../constants/mappings';
import { publisherDirectoryService } from '../services/publisherDirectoryService';
import { workbookService, mapDbToWorkbookPart } from '../services/workbookService';
import { api } from '../services/api';
import { zapiOrchestrator } from '../services/zapiOrchestrator';
import { EnumModalidade, WorkbookStatus, type WorkbookPart } from '../types';
import { useAuth } from '../context/AuthContext';
import './DesignationConfirmationPortal.css';

interface DesignationConfirmationPortalProps {
    partId: string;
    publisherId: string;
    token: string;
}

interface PortalSubmitResult {
    success?: boolean;
    error?: string;
    already_processed?: boolean;
    response_status?: 'confirmed' | 'refused';
    part_status?: string;
    authenticated_email?: string;
}

export function DesignationConfirmationPortal({ partId, publisherId, token }: DesignationConfirmationPortalProps) {
    // Fase 1 token-only: user existe se admin/publicador logou como step-up.
    // Portal NAO bloqueia acesso anonimo; RPCs sao token-first.
    const { user, isLoading: authLoading, signInWithGoogle } = useAuth();
    const [part, setPart] = useState<WorkbookPart | null>(null);
    const [partnerInfo, setPartnerInfo] = useState<{ name: string; phone?: string; funcao: string } | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [status, setStatus] = useState<'pending' | 'success' | 'error'>('pending');
    const [alreadyResponded, setAlreadyResponded] = useState<'confirmed' | 'refused' | null>(null);
    const [isSigningIn, setIsSigningIn] = useState(false);
    const [stepUpError, setStepUpError] = useState<string | null>(null);

    const [meetingDayOfWeek, setMeetingDayOfWeek] = useState<number>(4);

    // Form state
    const [accept, setAccept] = useState<boolean | null>(null);
    const [reason, setReason] = useState('');
    const [isSubmitting, setIsSubmitting] = useState(false);

    const authenticatedEmail = user?.email ?? null;

    useEffect(() => {
        let cancelled = false;

        const preparePortal = async () => {
            if (authLoading) {
                return;
            }
            await loadPart(cancelled);
        };

        preparePortal();

        return () => {
            cancelled = true;
        };
    }, [authLoading, partId, publisherId, token]);

    const loadPart = async (cancelled = false) => {
        try {
            const { data, error } = await supabase.rpc('get_portal_part_data', {
                p_part_id: partId,
                p_publisher_id: publisherId,
                p_token: token
            });

            if (cancelled) {
                return;
            }

            if (error || !data || data.error) {
                console.error('[Portal] Erro na RPC get_portal_part_data:', error || data?.error);
                setError('Designação não encontrada ou expirada.');
                return;
            }

            const found = mapDbToWorkbookPart(data.part);

            // Guard: Verificar se já foi respondido (proteção contra dupla submissão)
            const currentStatus = found.status;
            if (currentStatus === WorkbookStatus.DESIGNADA || currentStatus === WorkbookStatus.CONCLUIDA) {
                setAlreadyResponded('confirmed');
            } else if (currentStatus === WorkbookStatus.REJEITADA || currentStatus === WorkbookStatus.CANCELADA) {
                setAlreadyResponded('refused');
            }
            setPart(found);
            
            // Usar o meetingDay da RPC (ou fallback para 4)
            setMeetingDayOfWeek(typeof data.meetingDay === 'number' && data.meetingDay >= 0 && data.meetingDay <= 6 ? data.meetingDay : 4);

            if (data.partner) {
                setPartnerInfo({
                    name: data.partner.name || '',
                    phone: data.partner.phone || '',
                    funcao: data.partner.funcao === 'Ajudante' ? 'Ajudante' : 'Titular'
                });
            }

        } catch (err) {
            console.error('Erro ao carregar designação:', err);
            if (!cancelled) {
                setError('Falha ao conectar com o servidor.');
            }
        } finally {
            if (!cancelled) {
                setLoading(false);
            }
        }
    };

    // Step-up opcional: publicador/admin loga com Google apenas para elevar
    // trust_level da resposta (identified/verified/admin) ou recuperar link.
    const handleGoogleLogin = async () => {
        setIsSigningIn(true);
        setStepUpError(null);
        try {
            await signInWithGoogle();
        } catch (err) {
            console.error('Erro ao iniciar login Google (step-up):', err);
            const message = err instanceof Error ? err.message : 'Falha ao iniciar login Google.';
            setStepUpError(message);
            setIsSigningIn(false);
        }
    };

    const handleSubmit = async () => {
        if (accept === null) return;
        if (alreadyResponded) return; // Proteção extra contra dupla submissão
        if (accept === false && !reason.trim()) {
            alert('Por favor, informe o motivo da recusa.');
            return;
        }

        setIsSubmitting(true);
        try {
            const { data, error: submitError } = await supabase.rpc('submit_confirmation_portal_response', {
                p_part_id: partId,
                p_publisher_id: publisherId,
                p_token: token,
                p_accept: accept,
                p_reason: accept ? null : reason.trim(),
            });

            if (submitError) {
                throw submitError;
            }

            const submitResult = (data && typeof data === 'object' && !Array.isArray(data)
                ? data
                : {}) as PortalSubmitResult;

            if (!submitResult.success) {
                throw new Error(submitResult.error || 'Falha ao processar sua resposta.');
            }

            if (submitResult.authenticated_email) {
                setAuthenticatedEmail(submitResult.authenticated_email);
            }

            if (submitResult.already_processed && submitResult.response_status) {
                setAlreadyResponded(submitResult.response_status);
                await loadPart();
                return;
            }

            // --- Z-API Orchestration ---
            try {
                if (accept && part) {
                    const caption = `✅ *Confirmação Recebida!*\n\nFicamos felizes em saber que você poderá realizar sua parte: *${part.tipoParte}*.\nQue Jeová abençoe sua preparação!`;
                    const publishers = await api.loadPublishers();
                    const pub = publishers.find(p => p.id === publisherId || p.id === part.resolvedPublisherId);
                    if (pub?.phone) {
                        zapiOrchestrator.dispatchS89Receipt(partId, pub.phone, caption).catch(console.error);
                    }
                } else if (!accept && part) {
                    zapiOrchestrator.dispatchRefusalAlert(part, reason.trim()).catch(console.error);
                }
            } catch (zapiErr) {
                console.error('[Portal] Erro ao orquestrar Z-API:', zapiErr);
            }
            // -----------------------------

            setStatus('success');
        } catch (err) {
            console.error('Erro ao processar resposta:', err);
            setStatus('error');
        } finally {
            setIsSubmitting(false);
        }
    };

    if (authLoading || (loading && !part && !error)) {
        return <div className="portal-container"><div className="spinner"></div><p>Carregando designação...</p></div>;
    }

    if (loading) return <div className="portal-container"><div className="spinner"></div><p>Carregando dados...</p></div>;
    if (error) return <div className="portal-container error"><h2>⚠️ Ops!</h2><p>{error}</p></div>;

    // Proteção contra dupla submissão
    if (alreadyResponded && status === 'pending') return (
        <div className="portal-container success">
            <h2>{alreadyResponded === 'confirmed' ? '✅ Já Confirmado!' : '❌ Já Respondido'}</h2>
            <p>
                {alreadyResponded === 'confirmed'
                    ? 'Sua participação já foi confirmada anteriormente. Obrigado!'
                    : 'Esta designação já foi respondida anteriormente. O superintendente já foi notificado.'}
            </p>
            {part && (
                <div style={{ marginTop: '16px', padding: '12px', background: 'rgba(255,255,255,0.05)', borderRadius: '12px', textAlign: 'left', fontSize: '0.9rem' }}>
                    <p style={{ margin: '4px 0', color: '#94a3b8' }}>📝 <strong style={{ color: '#e2e8f0' }}>{part.tipoParte}</strong></p>
                    {part.tituloParte && <p style={{ margin: '4px 0', color: '#94a3b8', fontStyle: 'italic' }}>"{part.tituloParte}"</p>}
                    <p style={{ margin: '4px 0', color: '#94a3b8' }}>👤 {part.resolvedPublisherName || part.rawPublisherName}</p>
                </div>
            )}
            <button onClick={() => window.close()} className="btn-close">Fechar Janela</button>
        </div>
    );

    if (status === 'success') return (
        <div className="portal-container success">
            <h2>✨ Recebido!</h2>
            <p>Sua resposta foi enviada com sucesso ao sistema RVM.</p>
            <p>{accept ? 'Obrigado por confirmar sua participação!' : 'Sentimos muito que não possa participar. O superintendente já foi notificado.'}</p>
            <button onClick={() => window.close()} className="btn-close">Fechar Janela</button>
        </div>
    );

    if (status === 'error') return (
        <div className="portal-container error">
            <h2>⚠️ Não foi possível concluir</h2>
            <p>Houve uma falha ao registrar sua resposta. Tente novamente com o mesmo link.</p>
            <button onClick={() => setStatus('pending')} className="btn-submit">Tentar novamente</button>
        </div>
    );

    if (!part) return null;

    // Calcular data da reunião usando dia da semana persistido
    const MESES = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho',
        'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];
    const DIAS_SEMANA = ['domingo', 'segunda-feira', 'terça-feira', 'quarta-feira', 'quinta-feira', 'sexta-feira', 'sábado'];
    const weekRangeDisplay = part.weekDisplay || part.date || '';
    let meetingDateDisplay = '';
    // weekId é sempre YYYY-MM-DD (segunda-feira da semana); usar como base confiável
    const dateSource = part.weekId || part.date;
    const dp = dateSource?.split('-');
    if (dp && dp.length >= 3) {
        const baseDate = new Date(parseInt(dp[0]), parseInt(dp[1]) - 1, parseInt(dp[2]));
        const daysToMeeting = (meetingDayOfWeek - baseDate.getDay() + 7) % 7;
        const meetingDate = new Date(baseDate);
        meetingDate.setDate(meetingDate.getDate() + daysToMeeting);
        const dayName = DIAS_SEMANA[meetingDate.getDay()] ?? 'quinta-feira';
        meetingDateDisplay = `${dayName}, ${meetingDate.getDate()} de ${MESES[meetingDate.getMonth()]}`;
    }

    return (
        <div className="portal-container">
            <div className="portal-header">
                <h1>RVM Designações</h1>
                <p>Confirme sua participação na reunião</p>
                {authenticatedEmail && <p style={{ color: '#cbd5e1' }}>Conta identificada: <strong>{authenticatedEmail}</strong></p>}
            </div>

            <div className="assignment-card">
                <div className="card-item">
                    <span className="label">📅 Data:</span>
                    <span className="value">
                        {weekRangeDisplay}
                        {meetingDateDisplay && (
                            <span style={{ display: 'block', fontSize: '0.88em', color: '#475569', marginTop: 2 }}>
                                Reunião: {meetingDateDisplay}
                            </span>
                        )}
                    </span>
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
                        <label>Motivo da recusa (obrigatório):</label>
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

            {!user && (
                <div style={{ textAlign: 'center', marginTop: '12px', fontSize: '0.8rem' }}>
                    <button
                        type="button"
                        onClick={handleGoogleLogin}
                        disabled={isSigningIn}
                        style={{
                            background: 'none',
                            border: 'none',
                            color: '#64748b',
                            textDecoration: 'underline',
                            cursor: 'pointer',
                            padding: 0,
                        }}
                        title="Faca login para identificar sua resposta (opcional)"
                    >
                        {isSigningIn ? 'Redirecionando...' : 'Sou administrador ou quero identificar minha resposta'}
                    </button>
                    {stepUpError && <p style={{ color: '#fca5a5', marginTop: '6px' }}>{stepUpError}</p>}
                </div>
            )}

            <footer className="portal-footer">
                <p>© 2026 RVM Unified System</p>
            </footer>
        </div>
    );
}
