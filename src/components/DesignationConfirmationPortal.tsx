import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { getModalidadeFromTipo } from '../constants/mappings';
import { publisherDirectoryService } from '../services/publisherDirectoryService';
import { workbookService } from '../services/workbookService';
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

interface PortalAuthorizationResult {
    authorized?: boolean;
    reason?: string;
    authenticated_email?: string;
    assigned_publisher_name?: string;
    token_status?: string;
    response_status?: 'confirmed' | 'refused';
    responded_at?: string;
    /** HOTFIX 2026-05-01: classificador de identidade (substitui rejeição). */
    match_type?: 'strict' | 'admin' | 'delegated' | 'unverified';
    /** HOTFIX 2026-05-01: aviso não-bloqueante. */
    warning?: 'identity_not_verified' | null;
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
    const { user, profile, isLoading: authLoading, signInWithGoogle, signOut } = useAuth();
    const [part, setPart] = useState<WorkbookPart | null>(null);
    const [partnerInfo, setPartnerInfo] = useState<{ name: string; phone?: string; funcao: string } | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [status, setStatus] = useState<'pending' | 'success' | 'error'>('pending');
    const [alreadyResponded, setAlreadyResponded] = useState<'confirmed' | 'refused' | null>(null);
    const [authError, setAuthError] = useState<string | null>(null);
    const [authenticatedEmail, setAuthenticatedEmail] = useState<string | null>(null);
    const [isAuthorized, setIsAuthorized] = useState(false);
    const [isSigningIn, setIsSigningIn] = useState(false);
    const [, setMatchType] = useState<PortalAuthorizationResult['match_type']>(undefined);
    const [identityWarning, setIdentityWarning] = useState<string | null>(null);
    const [assignedPublisherName, setAssignedPublisherName] = useState<string | null>(null);

    const [meetingDayOfWeek, setMeetingDayOfWeek] = useState<number>(4);

    // Form state
    const [accept, setAccept] = useState<boolean | null>(null);
    const [reason, setReason] = useState('');
    const [isSubmitting, setIsSubmitting] = useState(false);

    useEffect(() => {
        let cancelled = false;

        const preparePortal = async () => {
            if (authLoading) {
                return;
            }

            if (!user) {
                if (!cancelled) {
                    setLoading(false);
                    setError(null);
                    setAuthError(null);
                    setIsAuthorized(false);
                    setAuthenticatedEmail(null);
                    setPart(null);
                    setPartnerInfo(null);
                }
                return;
            }

            if (!profile) {
                if (!cancelled) {
                    setLoading(false);
                    setIsAuthorized(false);
                    setAuthenticatedEmail(user.email || null);
                    setAuthError('Seu login Google foi reconhecido, mas seu perfil ainda não está vinculado ao sistema.');
                }
                return;
            }

            try {
                if (!cancelled) {
                    setLoading(true);
                    setError(null);
                    setAuthError(null);
                }

                const { data, error: authRpcError } = await supabase.rpc('authorize_confirmation_portal', {
                    p_part_id: partId,
                    p_publisher_id: publisherId,
                    p_token: token,
                });

                if (authRpcError) {
                    throw authRpcError;
                }

                const authResult = (data && typeof data === 'object' && !Array.isArray(data)
                    ? data
                    : {}) as PortalAuthorizationResult;

                if (cancelled) {
                    return;
                }

                setAuthenticatedEmail(authResult.authenticated_email || profile.email || user.email || null);

                if (!authResult.authorized) {
                    setIsAuthorized(false);
                    setLoading(false);
                    setAuthError(
                        authResult.reason === 'assignment_not_found'
                            ? 'Designação não encontrada ou indisponível.'
                            : authResult.reason === 'invalid_or_expired_token'
                                ? 'Este link de confirmação é inválido ou expirou.'
                                : authResult.reason === 'assignment_mismatch'
                                    ? 'Este link não corresponde mais à designação original.'
                            : 'Este login Google não está vinculado ao publicador designado para esta parte.'
                    );
                    return;
                }

                if (authResult.response_status) {
                    setAlreadyResponded(authResult.response_status);
                }

                setMatchType(authResult.match_type);
                setAssignedPublisherName(authResult.assigned_publisher_name || null);
                setIdentityWarning(
                    authResult.warning === 'identity_not_verified'
                        ? 'Sua conta Google não está vinculada ao publicador designado. Sua resposta será registrada e poderá ser revisada pela administração.'
                        : null
                );

                setIsAuthorized(true);
                await loadPart(cancelled);
            } catch (err) {
                console.error('Erro ao preparar portal:', err);
                if (!cancelled) {
                    setIsAuthorized(false);
                    setLoading(false);
                    setAuthError('Falha ao validar seu acesso ao link de confirmação.');
                }
            }
        };

        preparePortal();

        return () => {
            cancelled = true;
        };
    }, [authLoading, partId, profile, publisherId, token, user]);

    const loadPart = async (cancelled = false) => {
        try {
            const found = await workbookService.getPartById(partId);

            if (cancelled) {
                return;
            }

            if (!found) {
                setError('Designação não encontrada ou expirada.');
            } else {
                // Guard: Verificar se já foi respondido (proteção contra dupla submissão)
                const currentStatus = found.status;
                if (currentStatus === WorkbookStatus.DESIGNADA || currentStatus === WorkbookStatus.CONCLUIDA) {
                    setAlreadyResponded('confirmed');
                } else if (currentStatus === WorkbookStatus.REJEITADA || currentStatus === WorkbookStatus.CANCELADA) {
                    setAlreadyResponded('refused');
                }
                setPart(found);

                // Carregar dia da reunião persistido para esta semana
                try {
                    const dayMap = await api.getSetting<Record<string, number>>('s89_meeting_day_by_week', {});
                    const savedDay = dayMap[found.weekId];
                    if (!cancelled) {
                        setMeetingDayOfWeek(typeof savedDay === 'number' && savedDay >= 0 && savedDay <= 6 ? savedDay : 4);
                    }
                } catch {
                    // mantém padrão quinta-feira (4)
                }

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

                    // Verificar se é parte solo
                    let isValidPartner = !!partner;
                    if (partner) {
                        const titularPart = found.funcao === 'Ajudante' ? partner : found;
                        const titularMod = titularPart.modalidade || getModalidadeFromTipo(titularPart.tipoParte, titularPart.section);
                        const soloModalidades = [EnumModalidade.DISCURSO_ESTUDANTE, EnumModalidade.LEITURA_ESTUDANTE];
                        if (soloModalidades.includes(titularMod as any)) {
                            isValidPartner = false;
                        }
                    }

                    if (isValidPartner && partner) {
                        const partnerName = partner.resolvedPublisherName || partner.rawPublisherName || '';
                        // Buscar telefone do parceiro
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
            if (!cancelled) {
                setError('Falha ao conectar com o servidor.');
            }
        } finally {
            if (!cancelled) {
                setLoading(false);
            }
        }
    };

    const handleGoogleLogin = async () => {
        setIsSigningIn(true);
        setAuthError(null);
        try {
            await signInWithGoogle();
        } catch (err) {
            console.error('Erro ao iniciar login Google para o portal:', err);
            const message = err instanceof Error ? err.message : 'Falha ao iniciar login Google.';
            setAuthError(message);
            setIsSigningIn(false);
        }
    };

    const handleSubmit = async () => {
        if (accept === null) return;
        if (alreadyResponded) return; // Proteção extra contra dupla submissão
        if (!isAuthorized) return;
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

    if (authLoading || (user && loading && !part && !authError && !error)) {
        return <div className="portal-container"><div className="spinner"></div><p>Validando acesso...</p></div>;
    }

    if (!user) {
        return (
            <div className="portal-container">
                <div className="portal-header">
                    <h1>RVM Designações</h1>
                    <p>Entre com Google para confirmar sua participação</p>
                </div>

                <div className="assignment-card" style={{ textAlign: 'center' }}>
                    <p style={{ color: '#cbd5e1', lineHeight: 1.6, marginBottom: '1rem' }}>
                        Este link exige login Google para identificar quem está respondendo, mas não exige verificação por WhatsApp.
                    </p>
                    {authError && <p style={{ color: '#fca5a5', marginBottom: '1rem' }}>{authError}</p>}
                    <button
                        className="btn-submit"
                        onClick={handleGoogleLogin}
                        disabled={isSigningIn}
                    >
                        {isSigningIn ? 'Redirecionando...' : 'Entrar com Google'}
                    </button>
                </div>
            </div>
        );
    }

    if (!isAuthorized) {
        return (
            <div className="portal-container error">
                <h2>🔒 Acesso não autorizado</h2>
                <p>{authError || 'Este login Google não está autorizado a responder esta designação.'}</p>
                {authenticatedEmail && <p>Conta logada: <strong>{authenticatedEmail}</strong></p>}
                <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'center', flexWrap: 'wrap', marginTop: '1rem' }}>
                    <button onClick={handleGoogleLogin} className="btn-submit" disabled={isSigningIn}>
                        {isSigningIn ? 'Redirecionando...' : 'Trocar conta Google'}
                    </button>
                    <button onClick={signOut} className="btn-close">Sair</button>
                </div>
            </div>
        );
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

            {identityWarning && (
                <div
                    role="alert"
                    style={{
                        background: '#fef3c7',
                        border: '1px solid #f59e0b',
                        color: '#78350f',
                        padding: '12px 16px',
                        borderRadius: 8,
                        margin: '12px 0',
                        fontSize: 14,
                        lineHeight: 1.4,
                    }}
                >
                    <strong>⚠️ Identidade não verificada</strong>
                    <div style={{ marginTop: 4 }}>
                        {identityWarning}
                        {assignedPublisherName && (
                            <> Publicador designado: <strong>{assignedPublisherName}</strong>.</>
                        )}
                    </div>
                </div>
            )}

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

            <footer className="portal-footer">
                <p>© 2026 RVM Unified System</p>
            </footer>
        </div>
    );
}
