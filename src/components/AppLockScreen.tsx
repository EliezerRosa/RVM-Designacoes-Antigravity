import React, { useEffect, useState, useRef } from 'react';
import { useAuth } from '../context/AuthContext';

export function AppLockScreen() {
    const { user, signInWithDeviceAuth, signOut, markAppUnlocked } = useAuth();
    const [error, setError] = useState<string | null>(null);
    const [isAuthenticating, setIsAuthenticating] = useState(false);
    
    // Prevent double auto-trigger in React 18 StrictMode
    const hasTriggered = useRef(false);

    useEffect(() => {
        if (!hasTriggered.current) {
            hasTriggered.current = true;
            handleUnlock();
        }
    // eslint-disable-next-hooks/exhaustive-deps
    }, []);

    const handleUnlock = async () => {
        if (isAuthenticating) return;
        
        setIsAuthenticating(true);
        setError(null);
        
        try {
            // Tentamos usar o email do usuário atual se disponível, senão fallback pro localStorage
            const email = user?.email || localStorage.getItem('rvm_last_device_user') || undefined;
            const res = await signInWithDeviceAuth(email);
            
            if (res.success) {
                markAppUnlocked();
            } else {
                setError(res.error || 'Falha ao verificar biometria.');
            }
        } catch (err: unknown) {
            setError(err instanceof Error ? err.message : 'Falha inesperada.');
        } finally {
            setIsAuthenticating(false);
        }
    };

    const handleSignOut = async () => {
        await signOut();
    };

    return (
        <div style={{
            minHeight: '100vh',
            background: 'linear-gradient(135deg, #0f172a 0%, #1e293b 50%, #0f172a 100%)',
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'center',
            alignItems: 'center',
            padding: '1rem',
            color: '#f1f5f9'
        }}>
            <div style={{
                background: '#1e293b',
                border: '1px solid #334155',
                borderRadius: '1.5rem',
                padding: '2.5rem',
                maxWidth: '420px',
                width: '100%',
                display: 'flex',
                flexDirection: 'column',
                gap: '1.5rem',
                boxShadow: '0 25px 50px rgba(0,0,0,0.5)',
                textAlign: 'center'
            }}>
                <div>
                    <div style={{ fontSize: '3rem', marginBottom: '16px' }}>🔒</div>
                    <h1 style={{ fontSize: '1.5rem', fontWeight: 800, margin: 0 }}>App Bloqueado</h1>
                    <p style={{ color: '#94a3b8', marginTop: '0.5rem', fontSize: '0.875rem' }}>
                        Confirme sua identidade para acessar o RVM Designações.
                    </p>
                    {user?.email && (
                        <div style={{ 
                            background: '#334155', 
                            padding: '0.5rem 1rem', 
                            borderRadius: '2rem', 
                            display: 'inline-block',
                            marginTop: '1rem',
                            fontSize: '0.875rem'
                        }}>
                            👤 {user.email}
                        </div>
                    )}
                </div>

                {error && (
                    <div style={{
                        background: 'rgba(239, 68, 68, 0.1)',
                        border: '1px solid rgba(239, 68, 68, 0.3)',
                        color: '#fca5a5',
                        padding: '0.75rem 1rem',
                        borderRadius: '0.75rem',
                        fontSize: '0.875rem',
                    }}>
                        {error}
                    </div>
                )}

                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                    <button
                        onClick={handleUnlock}
                        disabled={isAuthenticating}
                        style={{
                            background: '#3b82f6',
                            color: '#fff',
                            border: 'none',
                            borderRadius: '0.75rem',
                            padding: '1rem',
                            fontSize: '1rem',
                            fontWeight: 700,
                            cursor: isAuthenticating ? 'not-allowed' : 'pointer',
                            opacity: isAuthenticating ? 0.7 : 1,
                            transition: 'opacity 0.2s',
                            display: 'flex',
                            justifyContent: 'center',
                            alignItems: 'center',
                            gap: '0.5rem'
                        }}
                    >
                        {isAuthenticating ? 'Autenticando...' : '🖐️ Tentar Novamente'}
                    </button>

                    <button
                        onClick={handleSignOut}
                        disabled={isAuthenticating}
                        style={{
                            background: 'transparent',
                            color: '#ef4444',
                            border: '1px solid #7f1d1d',
                            borderRadius: '0.75rem',
                            padding: '1rem',
                            fontSize: '1rem',
                            fontWeight: 600,
                            cursor: 'pointer',
                            marginTop: '0.5rem'
                        }}
                    >
                        Sair / Trocar Conta
                    </button>
                </div>
            </div>
        </div>
    );
}
