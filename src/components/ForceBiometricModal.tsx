import React, { useEffect, useState } from 'react';
import { deviceAuthService } from '../services/deviceAuthService';
import { useAuth } from '../context/AuthContext';

export function ForceBiometricModal() {
    const { user, authSystemMode, registerDeviceAuth, signOut } = useAuth();
    
    const [isAvailable, setIsAvailable] = useState<boolean | null>(null);
    const [isChecking, setIsChecking] = useState(true);
    const [isRegistering, setIsRegistering] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [isDismissed, setIsDismissed] = useState(false);

    useEffect(() => {
        let mounted = true;
        
        async function checkAvailability() {
            try {
                const available = await deviceAuthService.isWebAuthnAvailable();
                if (mounted) {
                    setIsAvailable(available);
                }
            } catch (e) {
                if (mounted) setIsAvailable(false);
            } finally {
                if (mounted) setIsChecking(false);
            }
        }
        
        checkAvailability();
        
        return () => { mounted = false; };
    }, []);

    // Regras de disparo
    const isTargetMode = authSystemMode === 'device_biometric' || authSystemMode === 'flexible';
    const email = user?.email;
    const lastDeviceUser = localStorage.getItem('rvm_last_device_user');
    
    const isAlreadyRegisteredHere = email && lastDeviceUser === email;

    // Log de fallback para dispositivos não suportados
    useEffect(() => {
        if (!isChecking && isAvailable === false && isTargetMode && email) {
            const logKey = `logged_unsupported_${email}`;
            if (!sessionStorage.getItem(logKey)) {
                sessionStorage.setItem(logKey, '1');
                import('../context/AuthContext').then(({ logAuthEvent }) => {
                    logAuthEvent(user?.id || null, email, 'webauthn_unsupported', { 
                        userAgent: navigator.userAgent 
                    }).catch(console.error);
                });
            }
        }
    }, [isChecking, isAvailable, isTargetMode, email, user?.id]);

    // Se o modal foi resolvido com sucesso, não exibe mais nada.
    if (isDismissed) return null;
    
    // Mostra spinner enquanto verifica suporte
    if (isChecking) return null;

    // isTargetMode, email, etc já extraídos acima

    if (!isTargetMode || isAlreadyRegisteredHere || !isAvailable || !email) {
        // Não é alvo desse bloqueio
        return null;
    }

    const handleRegister = async () => {
        setIsRegistering(true);
        setError(null);
        try {
            const result = await registerDeviceAuth();
            if (result.success) {
                setIsDismissed(true);
            } else {
                setError(result.error || 'Falha ao registrar.');
            }
        } catch (err: unknown) {
            setError(err instanceof Error ? err.message : 'Falha ao registrar.');
        } finally {
            setIsRegistering(false);
        }
    };

    return (
        <div style={{
            position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
            background: 'rgba(15, 23, 42, 0.9)',
            backdropFilter: 'blur(8px)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            zIndex: 999999, // Fica acima de TUDO no app
            padding: '20px'
        }}>
            <div style={{
                background: '#1E293B',
                width: '100%', maxWidth: '480px',
                borderRadius: '16px',
                boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.5)',
                border: '1px solid #334155',
                overflow: 'hidden',
                animation: 'modalSlideUp 0.3s ease-out'
            }}>
                <div style={{ padding: '24px', borderBottom: '1px solid #334155', textAlign: 'center' }}>
                    <div style={{ fontSize: '3rem', marginBottom: '16px' }}>🛡️</div>
                    <h2 style={{ margin: 0, color: '#F8FAFC', fontSize: '1.5rem' }}>
                        Registro de Aparelho Obrigatório
                    </h2>
                </div>

                <div style={{ padding: '24px', color: '#CBD5E1', fontSize: '1rem', lineHeight: 1.6 }}>
                    <p style={{ margin: '0 0 16px 0' }}>
                        Para garantir a segurança do sistema e facilitar seus próximos acessos, é necessário cadastrar este aparelho.
                    </p>
                    <p style={{ margin: '0 0 24px 0', color: '#94A3B8' }}>
                        Isto ativará o login por <strong>PIN, Face ID ou Digital</strong> do seu celular ou computador.
                    </p>

                    {error && (
                        <div style={{ background: '#7F1D1D', color: '#FECACA', padding: '12px 16px', borderRadius: '8px', marginBottom: '24px', border: '1px solid #991B1B' }}>
                            {error}
                        </div>
                    )}

                    <button 
                        onClick={handleRegister}
                        disabled={isRegistering}
                        style={{
                            width: '100%',
                            padding: '14px',
                            background: '#3B82F6',
                            color: '#FFFFFF',
                            border: 'none',
                            borderRadius: '8px',
                            fontSize: '1.1rem',
                            fontWeight: '600',
                            cursor: isRegistering ? 'not-allowed' : 'pointer',
                            opacity: isRegistering ? 0.7 : 1,
                            marginBottom: '12px'
                        }}
                    >
                        {isRegistering ? 'Acionando sistema...' : 'Cadastrar PIN / Biometria Agora'}
                    </button>
                    
                    <button 
                        onClick={signOut}
                        style={{
                            width: '100%',
                            padding: '12px',
                            background: 'transparent',
                            color: '#EF4444',
                            border: '1px solid #7F1D1D',
                            borderRadius: '8px',
                            fontSize: '0.95rem',
                            cursor: 'pointer'
                        }}
                    >
                        Sair / Cancelar
                    </button>
                </div>
            </div>
        </div>
    );
}
