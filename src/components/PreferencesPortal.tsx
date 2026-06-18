import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../context/AuthContext';

interface PreferencesPortalProps {
    action: string;      // 'rejoin' | 'full-participation'
    pubId?: string;
}

export function PreferencesPortal({ action, pubId }: PreferencesPortalProps) {
    const { user, profile, isLoading: authLoading, signInWithGoogle } = useAuth();
    const [publisherName, setPublisherName] = useState('');
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [success, setSuccess] = useState(false);
    const [isSubmitting, setIsSubmitting] = useState(false);

    const isRejoin = action === 'rejoin';
    const title = isRejoin
        ? 'Voltar a Receber Designações'
        : 'Participar como Titular e Ajudante';

    const hour = new Date().getHours();
    const greeting = hour < 12 ? 'Bom dia' : hour < 18 ? 'Boa tarde' : 'Boa noite';
    
    const introText = isRejoin
        ? `${greeting}! Querido irmã(o), notamos que pediu para não participar nas partes de estudantes na Reunião de Meio de Semana. Por favor, apenas como lembrete, caso queira reconsiderar, clique no botão abaixo. Fique certo do nosso apoio. (Salmo 134:3) Obrigado mesmo!`
        : `${greeting}! Querido irmã(o), notamos que pediu para participar SÓ COMO AJUDANTE, nas partes de estudantes na Reunião de Meio de Semana. Por favor, apenas como lembrete, caso queira reconsiderar, clique no botão abaixo. Fique certo do nosso apoio. (Salmo 134:3) Obrigado mesmo!`;

    const description = isRejoin
        ? 'Ao confirmar, você voltará a receber designações na Reunião Vida e Ministério.'
        : 'Ao confirmar, você passará a receber partes tanto como titular quanto como ajudante.';
    const buttonLabel = isRejoin
        ? '✅ Sim, quero voltar a participar!'
        : '✅ Sim, quero participar integralmente!';

    useEffect(() => {
        if (authLoading || !user || !profile) return;
        loadPublisher();
    }, [authLoading, user, profile]);

    const loadPublisher = async () => {
        try {
            setLoading(true);
            setError(null);

            if (!pubId) {
                setError('Link inválido: identificador do publicador ausente.');
                return;
            }

            // Verificar que o publicador existe
            const { data: pub, error: pubError } = await supabase
                .from('publishers')
                .select('id, data')
                .eq('id', pubId)
                .maybeSingle();

            if (pubError || !pub) {
                setError('Publicador não encontrado.');
                return;
            }

            setPublisherName(pub.data?.name || 'Publicador');
        } catch (err) {
            console.error('[PreferencesPortal] Erro:', err);
            setError('Falha ao carregar dados.');
        } finally {
            setLoading(false);
        }
    };

    const handleConfirm = async () => {
        if (!pubId) return;
        setIsSubmitting(true);
        try {
            const field = isRejoin ? 'requestedNoParticipation' : 'isHelperOnly';
            const { data: pub } = await supabase
                .from('publishers')
                .select('data')
                .eq('id', pubId)
                .single();

            if (!pub) throw new Error('Publicador não encontrado.');

            const updatedData = { ...pub.data, [field]: false };
            const { error: updateError } = await supabase
                .from('publishers')
                .update({ data: updatedData })
                .eq('id', pubId);

            if (updateError) throw updateError;

            // Notificar SRVM via Edge Function
            try {
                const { data: pubs } = await supabase.from('publishers').select('id, data');
                const srvmPubs = (pubs || []).filter((p: any) =>
                    p.data?.funcao === 'Superintendente da Reunião Vida e Ministério' ||
                    p.data?.funcao === 'Ajudante do Superintendente da Reunião Vida e Ministério'
                );

                const actionLabel = isRejoin ? 'voltou a aceitar designações' : 'agora aceita partes como titular';
                const msg = `🔔 *Atualização de Preferência*\n\n${publisherName} ${actionLabel}.\n\nAtualizado via Portal de Preferências.`;

                for (const srvm of srvmPubs) {
                    if (srvm.data?.phone) {
                        await supabase.functions.invoke('send-whatsapp', {
                            body: { action: 'send-text', phone: srvm.data.phone, message: msg }
                        });
                    }
                }
            } catch (notifyErr) {
                console.warn('[PreferencesPortal] Falha ao notificar SRVM:', notifyErr);
            }

            setSuccess(true);
        } catch (err) {
            console.error('[PreferencesPortal] Erro ao confirmar:', err);
            setError('Falha ao atualizar sua preferência. Tente novamente.');
        } finally {
            setIsSubmitting(false);
        }
    };

    // --- RENDER ---

    if (authLoading) {
        return (
            <div style={styles.container}>
                <div style={styles.card}>
                    <p style={styles.loadingText}>⏳ Carregando...</p>
                </div>
            </div>
        );
    }

    if (!user) {
        return (
            <div style={styles.container}>
                <div style={styles.card}>
                    <h1 style={styles.title}>RVM Designações</h1>
                    <p style={styles.subtitle}>Entre com Google para atualizar sua preferência</p>
                    <button style={styles.primaryBtn} onClick={() => signInWithGoogle()}>
                        Entrar com Google
                    </button>
                </div>
            </div>
        );
    }

    if (loading) {
        return (
            <div style={styles.container}>
                <div style={styles.card}>
                    <p style={styles.loadingText}>⏳ Verificando dados...</p>
                </div>
            </div>
        );
    }

    if (error) {
        return (
            <div style={styles.container}>
                <div style={styles.card}>
                    <h2 style={styles.errorTitle}>⚠️ Erro</h2>
                    <p style={styles.errorText}>{error}</p>
                </div>
            </div>
        );
    }

    if (success) {
        return (
            <div style={styles.container}>
                <div style={styles.card}>
                    <h2 style={styles.successTitle}>✅ Atualizado!</h2>
                    <p style={styles.successText}>
                        {isRejoin
                            ? `${publisherName}, você agora voltará a receber designações. Que Jeová abençoe! 🙏`
                            : `${publisherName}, agora você receberá partes tanto como titular quanto ajudante. Que Jeová abençoe! 🙏`}
                    </p>
                    <p style={styles.notifyText}>O Superintendente já foi notificado desta atualização.</p>
                    <button style={styles.closeBtn} onClick={() => window.close()}>Fechar</button>
                </div>
            </div>
        );
    }

    return (
        <div style={styles.container}>
            <div style={styles.card}>
                <h1 style={styles.title}>{title}</h1>
                <div style={{
                    backgroundColor: 'rgba(56, 189, 248, 0.1)', 
                    borderLeft: '4px solid #38bdf8',
                    padding: '16px', 
                    borderRadius: '0 12px 12px 0', 
                    marginBottom: '24px',
                    textAlign: 'left',
                    color: '#e2e8f0',
                    fontSize: '0.95rem',
                    lineHeight: '1.5'
                }}>
                    {introText}
                </div>
                <p style={styles.subtitle}>{description}</p>
                <div style={styles.nameBox}>
                    <span style={styles.nameLabel}>👤 Publicador:</span>
                    <span style={styles.nameValue}>{publisherName}</span>
                </div>
                <button
                    style={isSubmitting ? { ...styles.primaryBtn, opacity: 0.6 } : styles.primaryBtn}
                    onClick={handleConfirm}
                    disabled={isSubmitting}
                >
                    {isSubmitting ? 'Processando...' : buttonLabel}
                </button>
                <p style={styles.footnote}>Se preferir não mudar, basta fechar esta página.</p>
            </div>
        </div>
    );
}

// --- ESTILOS INLINE (portal isolado, sem dependência de CSS externo) ---
const styles: Record<string, React.CSSProperties> = {
    container: {
        minHeight: '100vh',
        background: 'linear-gradient(135deg, #0f172a 0%, #1e293b 100%)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '24px',
        fontFamily: "'Inter', 'Segoe UI', sans-serif",
    },
    card: {
        width: '100%',
        maxWidth: '480px',
        background: '#1e293b',
        border: '1px solid #334155',
        borderRadius: '20px',
        padding: '32px 28px',
        color: '#e2e8f0',
        boxShadow: '0 25px 50px -12px rgba(0,0,0,0.5)',
        textAlign: 'center' as const,
    },
    title: {
        margin: '0 0 8px 0',
        fontSize: '1.5rem',
        color: '#f1f5f9',
    },
    subtitle: {
        margin: '0 0 24px 0',
        color: '#94a3b8',
        lineHeight: 1.6,
        fontSize: '0.95rem',
    },
    nameBox: {
        background: 'rgba(255,255,255,0.05)',
        borderRadius: '12px',
        padding: '14px 18px',
        marginBottom: '24px',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
    },
    nameLabel: { color: '#94a3b8', fontSize: '0.9rem' },
    nameValue: { color: '#f1f5f9', fontWeight: 600, fontSize: '1rem' },
    primaryBtn: {
        width: '100%',
        padding: '14px 20px',
        background: 'linear-gradient(135deg, #10b981 0%, #059669 100%)',
        color: '#fff',
        border: 'none',
        borderRadius: '12px',
        fontSize: '1rem',
        fontWeight: 600,
        cursor: 'pointer',
        transition: 'opacity 0.2s',
    },
    closeBtn: {
        marginTop: '16px',
        padding: '10px 24px',
        background: '#334155',
        color: '#e2e8f0',
        border: 'none',
        borderRadius: '10px',
        fontSize: '0.9rem',
        cursor: 'pointer',
    },
    footnote: {
        marginTop: '16px',
        color: '#64748b',
        fontSize: '0.8rem',
    },
    loadingText: { color: '#94a3b8', fontSize: '1rem' },
    errorTitle: { color: '#fca5a5', margin: '0 0 12px 0' },
    errorText: { color: '#cbd5e1', lineHeight: 1.6 },
    successTitle: { color: '#34d399', margin: '0 0 12px 0', fontSize: '1.5rem' },
    successText: { color: '#e2e8f0', lineHeight: 1.6, marginBottom: '8px' },
    notifyText: { color: '#94a3b8', fontSize: '0.85rem', fontStyle: 'italic' },
};
